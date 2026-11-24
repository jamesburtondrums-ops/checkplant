/* Touchline research layer: use only matches completed before the fixture. */
(function(){
"use strict";
function inspect(team,rows,standings,fixtureDate){
 const lastAll=rows.filter(m=>(m.home===team||m.away===team)&&m.date<fixtureDate).sort((a,b)=>a.date.localeCompare(b.date));
 const recent=lastAll.slice(-5),prev=lastAll.slice(-10,-5);
 const points=xs=>xs.reduce((a,m)=>{const f=m.home===team?m.hg:m.ag,g=m.home===team?m.ag:m.hg;return a+(f>g?3:f===g?1:0)},0);
 let shotsFor=0,shotsAgainst=0,sotFor=0,sotAgainst=0,shotsN=0,bt=0;
 for(const m of lastAll){
  const st=m.stat||{},home=m.home===team;
  const keys=home?["home_shots","away_shots","home_target","away_target"]:["away_shots","home_shots","away_target","home_target"];
  const z=keys.map(k=>st[k]!==""&&st[k]!==null&&st[k]!==undefined?Number(st[k]):NaN);
  if(z.every(Number.isFinite)){shotsN++;shotsFor+=z[0];shotsAgainst+=z[1];sotFor+=z[2];sotAgainst+=z[3]}
  if(m.hg>0&&m.ag>0)bt++;
 }
 let lastDate=lastAll.length?lastAll[lastAll.length-1].date:null;
 let rest=lastDate?Math.round((Date.parse(fixtureDate+"T12:00:00Z")-Date.parse(lastDate+"T12:00:00Z"))/86400000):null;
 let opponents=recent.map(m=>standings.get(m.home===team?m.away:m.home)?.ppg).filter(Number.isFinite);
 return {team,last5:points(recent),prev5:points(prev),played:lastAll.length,rest,shotsN,shotsFor:shotsN?shotsFor/shotsN:null,shotsAgainst:shotsN?shotsAgainst/shotsN:null,sotFor:shotsN?sotFor/shotsN:null,sotAgainst:shotsN?sotAgainst/shotsN:null,sotNet:shotsN?(sotFor-sotAgainst)/shotsN:null,btRate:lastAll.length?bt/lastAll.length:null,scheduleStrength:opponents.length?opponents.reduce((a,b)=>a+b,0)/opponents.length:null,oppCount:opponents.length};
}
function render(f,rows,table,safe){
 const standings=table(rows);
 const format=v=>v===null||!Number.isFinite(v)?"Not available":v.toFixed(2);
 const first=inspect(f.home,rows,standings,f.date),second=inspect(f.away,rows,standings,f.date);
 function card(x){
  return '<div class="detailCard"><span class="dcTitle">'+safe(x.team)+' — additional signals</span>'+
   '<div>Last five games: <b>'+x.last5+'/15 points</b> · prior five: '+x.prev5+'/15</div>'+
   '<div>Last five opponents’ current average points/game: <b>'+format(x.scheduleStrength)+'</b></div>'+
   '<div>Days since last league match: <b>'+(x.rest===null?'Unknown':x.rest)+'</b></div>'+
   '<div>Shots per match: <b>'+format(x.shotsFor)+'</b> for / '+format(x.shotsAgainst)+' against</div>'+
   '<div>Shots on target per match: <b>'+format(x.sotFor)+'</b> for / '+format(x.sotAgainst)+' against</div>'+
   '<div>Shots on target differential: <b>'+format(x.sotNet)+'</b> / match</div>'+
   '<div>BTTS season rate: <b>'+(x.btRate===null?'Unknown':(x.btRate*100).toFixed(1)+'%')+'</b></div>'+
   '<div class="source">Shots available for '+x.shotsN+'/'+x.played+' league matches; missing not zero. Rest excludes cup games. Opponent strength uses current league positions, not past-at-kickoff ratings.</div>'+
   '</div>';
 }
 return '<div class="detailgrid" style="margin-top:9px">'+card(first)+card(second)+'</div>';
}
function marketDetail(snapshot,leagueId,safe){
 const info=snapshot&&snapshot.leagues&&snapshot.leagues[leagueId];
 if(!info)return '';
 return '<div class="detailgrid" style="margin-top:9px"><div class="detailCard">'+
 '<span class="dcTitle">Independent historical odds / data audit</span>'+
 '<div>Football-Data matches sampled: '+(info.market_matches??'unavailable')+'</div>'+
 '<div>Matches with bookmaker 1X2 odds: '+(info.odds_matches??'unavailable')+'</div>'+
 '<div>Historical home-win rate: '+(info.home_win_rate==null?'—':(100*info.home_win_rate).toFixed(1)+'%')+'</div>'+
 '<div>Historical BTTS rate: '+(info.btts_rate==null?'—':(100*info.btts_rate).toFixed(1)+'%')+'</div>'+
 '<div class="source">Research summary only. Past bookmaker prices are NOT current odds or proof of value. Data updated '+safe(snapshot.asOf||'unknown')+'.</div>'+
 '</div></div>';
}
function marketCompare(f,reference,canonicalTeam,safe){
 if(!reference||!Array.isArray(reference.matches))return '';
 const target=reference.matches.find(x=>x.league===f.league&&x.date===f.date&&canonicalTeam(x.home)===canonicalTeam(f.home)&&canonicalTeam(x.away)===canonicalTeam(f.away));
 if(!target)return '';
 const ph=Number(f.P.H),pd=Number(f.P.D),pa=Number(f.P.A);
 const fmt=n=>(100*n).toFixed(1)+'%';
 const diff=Math.max(Math.abs(ph-target.homeP),Math.abs(pd-target.drawP),Math.abs(pa-target.awayP));
 const warn=diff>.15?'MATERIAL MODEL–MARKET DISAGREEMENT — investigate team news and assumptions':'Model and indicative market are within 15 percentage points';
 return '<div class="detailgrid" style="margin-top:9px"><div class="detailCard">'+
 '<span class="dcTitle">Indicative 1X2 market vs model</span><div><b>'+safe(warn)+'</b></div>'+
 '<div>Home: model '+fmt(ph)+' / indicative market '+fmt(target.homeP)+'</div>'+
 '<div>Draw: model '+fmt(pd)+' / indicative market '+fmt(target.drawP)+'</div>'+
 '<div>Away: model '+fmt(pa)+' / indicative market '+fmt(target.awayP)+'</div>'+
 '<div class="source">Source: football-data.co.uk fixed-interval fixtures CSV, retrieved '+safe(reference.asOf)+'. This is NOT live odds, does not price BTTS + Win, and is not proof of a value bet.</div>'+
 '</div></div>';
}

window.TouchlineResearch={inspect,render,marketDetail,marketCompare};
})();