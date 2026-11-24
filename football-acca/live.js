/* Touchline in-play extension: public ESPN scoreboard, match-state aware; no guaranteed uninterrupted live service. */
(function(){
"use strict";
const ENDPOINTS={
 "ENG_1_premier-league":"eng.1",
 "ENG_2_championship":"eng.2",
 "ENG_3_league-one":"eng.3",
 "ENG_4_league-two":"eng.4",
 "UEFA_1_champions-league":"uefa.champions"
};
const state={fixtures:[],refreshed:null,failures:[],refreshing:false,attempted:false};
function num(s){let n=Number(typeof s==="object"&&s!==null?(s.value??s.displayValue):s);return Number.isFinite(n)?n:null}
function minutes(e){
 const s=e.status||{},c=s.displayClock||s.clock||s.type?.shortDetail||s.type?.detail||"";
 const m=String(c).match(/\d+/);let n=m?Number(m[0]):null;
 if((n==null||n===0)&&s.period===2)n=45;
 if(n!=null&&s.period===2&&n<45)n+=45;
 return n===null?null:Math.min(130,Math.max(0,n));
}
function parseEvent(e,id){
 const comp=e.competitions?.[0]||{},r=comp.competitors||[];
 const h=r.find(x=>x.homeAway==="home"),a=r.find(x=>x.homeAway==="away");
 if(!h||!a)return null;
 const t=e.status?.type||comp.status?.type||{},s=e.status||comp.status||{};
 const date=(e.date||"").slice(0,10);
 return {id:e.id,league:id,date,home:h.team?.displayName||h.team?.name||h.team?.shortDisplayName||"",
 away:a.team?.displayName||a.team?.name||a.team?.shortDisplayName||"",
 hg:num(h.score),ag:num(a.score),state:t.state||"pre",completed:!!t.completed,
 clock:s.displayClock||t.shortDetail||t.detail||"",minute:minutes(e),source:"ESPN scoreboard"};
}
async function refresh(date,onReady){
 if(state.refreshing)return;
 state.refreshing=true;state.attempted=true;
 const d=(date||new Date().toISOString().slice(0,10)).replace(/-/g,"");
 const ids=Object.entries(ENDPOINTS);
 try{
  const results=await Promise.allSettled(ids.map(async ([id,slug])=>{
   const u="https://site.api.espn.com/apis/site/v2/sports/soccer/"+slug+"/scoreboard?dates="+d;
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8500);
   try{const r=await fetch(u,{cache:"no-store",signal:ctl.signal});if(!r.ok)throw Error("HTTP "+r.status);
    const j=await r.json();return {id,events:(j.events||[]).map(e=>parseEvent(e,id)).filter(Boolean)};
   }finally{clearTimeout(timer)}
  }));
  const rows=[],fail=[];
  results.forEach((v,i)=>{if(v.status==="fulfilled")rows.push(...v.value.events);else fail.push(ids[i][0])});
  if(rows.length){state.fixtures=rows;state.refreshed=new Date().toISOString()}
  state.failures=fail;
 }finally{state.refreshing=false;if(typeof onReady==="function")onReady()}
}
function find(f,canonical){
 if(!state.fixtures.length)return null;
 const h=canonical(f.home),a=canonical(f.away);
 return state.fixtures.find(x=>x.league===f.league&&
  canonical(x.home)===h&&canonical(x.away)===a)||null;
}
function modelConditional(model,observed){
 if(!model||observed?.state!=="in"||observed.hg===null||observed.ag===null||observed.minute===null)return null;
 const fraction=Math.max(0,Math.min(1,(95-observed.minute)/95));
 const lh=model.lambdaH*fraction,la=model.lambdaA*fraction;
 function poisson(n,rate){let z=Math.exp(-rate);for(let i=1;i<=n;i++)z*=rate/i;return z}
 let P={H:0,A:0,D:0,B:0,HB:0,AB:0},total=0;
 for(let x=0;x<=8;x++)for(let y=0;y<=8;y++){
  const p=poisson(x,lh)*poisson(y,la),hg=observed.hg+x,ag=observed.ag+y;
  total+=p;
  if(hg>ag)P.H+=p;else if(hg<ag)P.A+=p;else P.D+=p;
  if(hg>0&&ag>0){P.B+=p;if(hg>ag)P.HB+=p;else if(ag>hg)P.AB+=p;}
 }
 for(const k of Object.keys(P))P[k]/=total;
 return {P,source:"conditional Poisson approximation",remaining:Math.round(fraction*95),modelLimitations:"No red cards, subs, tactical shifts or live in-play market input"};
}
window.TouchlineLive={state,refresh,find,modelConditional};
})();