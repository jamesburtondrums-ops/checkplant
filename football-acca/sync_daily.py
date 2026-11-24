#!/usr/bin/env python3
"""Touchline source audit. Fetch public source files politely; publish derived statistics only.
No keys, logins, paywalled pages, or attempts to bypass robots/protection.
Historical prices are not live. Team availability is maintained separately, with source dates.
"""
import csv
import io
import json
import math
import os
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
TODAY = datetime.now(timezone.utc).date()
STAMP = datetime.now(timezone.utc).isoformat(timespec="seconds")
LEAGUES = {"ENG_1_premier-league":("E0","eng.1"),
           "ENG_2_championship":("E1","eng.2"),
           "ENG_3_league-one":("E2","eng.3"),
           "ENG_4_league-two":("E3","eng.4")}
WARNINGS = []
CALLS = 0

def retrieve(url, limit=2_500_000):
    global CALLS
    req=urllib.request.Request(url,headers={"User-Agent":"TouchlineResearch/1.0 (personal non-commercial project; public data, 1 req/sec)","Accept":"text/csv,application/json,text/plain"})
    try:
        with urllib.request.urlopen(req,timeout=16) as resp:
            data=resp.read(limit+1)
            if len(data)>limit: raise ValueError("Source exceeded safe size limit")
        CALLS += 1
        time.sleep(.9)
        return data.decode("utf-8-sig",errors="replace")
    except Exception as exc:
        WARNINGS.append(url.split("?")[0]+" failed: "+type(exc).__name__+" "+str(exc)[:90])
        return None

def csv_rows(text):
    return list(csv.DictReader(io.StringIO(text))) if text else []

def num(value):
    try:
        a=float(value)
        if not math.isfinite(a): return None
        return a
    except (TypeError,ValueError):
        return None

def ratio(n,d):
    return round(n/d,4) if d else None

def normalize(name):
    import re
    name=re.sub(r"[^a-z0-9]+"," ",(name or "").lower().replace("&"," and "))
    name=re.sub(r"\b(fc|afc)\b","",name)
    return " ".join(name.split())

def current_league(id):
    url=f"https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/{id}/results_2627.csv"
    text=retrieve(url)
    if not text:return None
    matches=[r for r in csv_rows(text) if r.get("date","")<=str(TODAY) and num(r.get("ft_home")) is not None and num(r.get("ft_away")) is not None]
    n=len(matches)
    shots=[r for r in matches if num(r.get("home_target")) is not None and num(r.get("away_target")) is not None]
    home=sum(float(r["ft_home"])>float(r["ft_away"]) for r in matches)
    away=sum(float(r["ft_home"])<float(r["ft_away"]) for r in matches)
    btts=sum(float(r["ft_home"])>0 and float(r["ft_away"])>0 for r in matches)
    return {"source":"open-matchday 2026/27","results":n,"shot_matches":len(shots),
            "shot_coverage_pct":round(len(shots)/n*100,1) if n else None,
            "home_win_rate":ratio(home,n),"away_win_rate":ratio(away,n),
            "draw_rate":ratio(n-home-away,n),"btts_rate":ratio(btts,n),
            "goals_per_game":round(sum(float(r["ft_home"])+float(r["ft_away"]) for r in matches)/n,2) if n else None,
            "goals_home_per_game":round(sum(float(r["ft_home"]) for r in matches)/n,2) if n else None,
            "goals_away_per_game":round(sum(float(r["ft_away"]) for r in matches)/n,2) if n else None,
            "latest":max((r["date"] for r in matches),default=None)}

def odds_audit(div):
    total=with_odds=home_win=both=0
    overround=[]
    calibration={str(i):{"n":0,"expect":0,"observed":0} for i in range(10)}
    years=("2324","2425","2526","2627")
    for season in years:
        text=retrieve(f"https://www.football-data.co.uk/mmz4281/{season}/{div}.csv")
        if not text:continue
        for r in csv_rows(text):
            h=num(r.get("FTHG"));a=num(r.get("FTAG"))
            if h is None or a is None:continue
            total+=1;home_win+=h>a;both+=h>0 and a>0
            triplets=[("AvgCH","AvgCD","AvgCA"),("AvgH","AvgD","AvgA"),("B365CH","B365CD","B365CA"),("B365H","B365D","B365A")]
            triplet=next((tuple(num(r.get(k)) for k in tr) for tr in triplets if all(num(r.get(k)) and num(r.get(k))>1.001 for k in tr)),None)
            if triplet:
                inv=[1/x for x in triplet];s=sum(inv)
                p=inv[0]/s
                with_odds+=1;overround.append(s-1)
                ix=min(9,max(0,int(p*10)))
                cell=calibration[str(ix)];cell["n"]+=1;cell["expect"]+=p;cell["observed"]+=int(h>a)
    if not total:return None
    buckets=[{"range":f"{i*10}-{(i+1)*10}%","n":z["n"],"expected":ratio(z["expect"],z["n"]),
              "actual":ratio(z["observed"],z["n"])} for i,z in enumerate(calibration.values()) if z["n"]>=15]
    return {"market_matches":total,"odds_matches":with_odds,"home_win_rate":ratio(home_win,total),
            "btts_rate":ratio(both,total),"average_overround":round(sum(overround)/len(overround),4) if overround else None,
            "home_win_calibration_buckets":buckets,
            "note":"Past bookmaker prices, not current prices. Closing odds preferred where available; no identical settlement guarantee."}

def scorers_from_espn(slug):
    # A single limited daily call: ESPN scoreboard competitors can include season goal leaders.
    text=retrieve(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard",limit=1_800_000)
    if not text:return {}
    try:events=json.loads(text).get("events",[])
    except (ValueError,TypeError):return {}
    result={}
    for match in events:
        for event in match.get("competitions",[]):
            for side in event.get("competitors",[]):
                team=side.get("team",{}).get("displayName")
                if not team:continue
                for stat in side.get("leaders",[]):
                    if stat.get("name") not in ("goals","goalsLeaders"):continue
                    leaders=stat.get("leaders",[])
                    if not leaders:continue
                    leader=leaders[0];player=leader.get("athlete",{}).get("displayName")
                    goals=num(leader.get("value"))
                    if player and goals is not None:
                        prev=result.get(normalize(team),{})
                        if goals>=prev.get("goals",-1):
                            result[normalize(team)]={"team":team,"player":player,"goals":int(goals),"source":"ESPN scoreboard competitor top scorer","asOf":str(TODAY),"athleteId":leader.get("athlete",{}).get("id")}
                    break
    return result

def fixture_odds():
    """Sample pre-match 1X2 market as a comparator, never an executable bookmaker quote."""
    text=retrieve("https://www.football-data.co.uk/fixtures.csv")
    if not text:return None
    from datetime import date
    rows=[]
    mapping={v[0]:k for k,v in LEAGUES.items()}
    for r in csv_rows(text):
        league=mapping.get((r.get("Div") or "").strip())
        if not league:continue
        datevalue=(r.get("Date") or "").strip()
        day=None
        for fmt in ("%d/%m/%Y","%d/%m/%y","%Y-%m-%d"):
            try:day=datetime.strptime(datevalue,fmt).date();break
            except ValueError:pass
        if day is None or day<TODAY or day>TODAY+timedelta(days=28):continue
        trips=[("AvgH","AvgD","AvgA"),("B365H","B365D","B365A"),("MaxH","MaxD","MaxA")]
        odds=next((tuple(num(r.get(z)) for z in x) for x in trips if all(num(r.get(z)) and num(r.get(z))>1.001 for z in x)),None)
        if not odds:continue
        inv=[1/z for z in odds];total=sum(inv)
        if total<.8 or total>1.55:continue
        home=(r.get("HomeTeam") or "").strip();away=(r.get("AwayTeam") or "").strip()
        if not home or not away:continue
        rows.append({"league":league,"date":str(day),"home":home,"away":away,
                     "homeP":round(inv[0]/total,4),"drawP":round(inv[1]/total,4),
                     "awayP":round(inv[2]/total,4),"overround":round(total-1,4)})
    return {"asOf":str(TODAY),"source":"football-data.co.uk/fixtures.csv",
            "nonLive":True,"status":"Fixed-interval snapshot, not live prices",
            "matches":rows,"total":len(rows)}

def main():
    p=BASE/"research-snapshot.json"
    previous={}
    if p.exists():
        try:previous=json.loads(p.read_text(encoding="utf8"))
        except Exception:pass
    summary={"asOf":str(TODAY),"sourceBuild":None,"version":"3","historicalMatches":6421,
             "market":{"status":"pending data provider response","source":"football-data.co.uk","asOf":None},
             "leagues":{},"warning":"No live bookmaker odds; historical odds are not an available betting price.",
             "sourceLinks":["https://github.com/oladeeayo/open-matchday","https://github.com/openfootball/football.json","https://www.football-data.co.uk/"]}
    build=retrieve("https://raw.githubusercontent.com/oladeeayo/open-matchday/master/build_summary.json")
    if build:
        try:summary["sourceBuild"]=json.loads(build).get("generated_utc")
        except Exception:pass
    scorer_file=BASE/"player-research.json"
    player_prev={}
    if scorer_file.exists():
        try:player_prev=json.loads(scorer_file.read_text(encoding="utf8"))
        except Exception:pass
    players={}
    odds_count=0
    for league,(div,espn) in LEAGUES.items():
        cur=current_league(league)
        item=cur or (previous.get("leagues",{}).get(league) or {})
        if not cur:item["staleSource"]=True
        market=odds_audit(div)
        if market:
            item.update(market);odds_count+=market["odds_matches"]
        else:
            keep=previous.get("leagues",{}).get(league,{})
            for key in ("market_matches","odds_matches","home_win_calibration_buckets","average_overround"):
                if key in keep:item[key]=keep[key]
            item["marketStale"]=True
        summary["leagues"][league]=item
        found=scorers_from_espn(espn)
        if found:players[league]=found
    if odds_count:
        summary["market"]={"status":"historical 1X2 statistics ready","source":"football-data.co.uk","asOf":str(TODAY),"sampleWithOdds":odds_count}
    else:
        summary["market"]={"status":"historical bookmaker data unavailable; do not infer prices","source":"football-data.co.uk","asOf":None}
    summary["sourceWarnings"]=WARNINGS[:30]
    p.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    indicative=fixture_odds()
    if indicative:
        (BASE/"odds-reference.json").write_text(json.dumps(indicative,ensure_ascii=False,indent=2)+"\\n",encoding="utf8")
    if players:
        scorer_file.write_text(json.dumps({"asOf":str(TODAY),"source":"ESPN public soccer scoreboard goal leaders; partial competition-day coverage","leagues":players},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("source audit",STAMP,"calls",CALLS,"markets",odds_count,"playerLeagues",len(players),"warnings",len(WARNINGS))
    print("English match rows:",{k:v.get("results") for k,v in summary["leagues"].items()})
    for warning in WARNINGS[:10]:print("WARN",warning)

if __name__=="__main__":
    main()
