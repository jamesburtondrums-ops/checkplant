export const DEFAULT_MAIN_ROUNDS=15,MAIN_POINTS=10,FINAL_POINTS=25,TILE_COUNT=12;
export function phraseKey(answer){return String(answer||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s*\((artwork|alternate|version)\s*\d+\)\s*$/i,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/^(a|an|the) /,'');}
export function shuffled(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Connected components exclude identical files AND alternate artwork/phrase groups.
// Transitive duplicates cannot evade de-duplication by changing both filename and answer.
export function uniqueDeck(pictures,rng=Math.random){const rows=pictures.filter(p=>p.answer?.trim()&&p.image),parents=rows.map((_,i)=>i),seen=new Map();function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
 rows.forEach((p,i)=>{for(const token of ['phrase:'+phraseKey(p.answer),...(p.group?['group:'+phraseKey(p.group)]:[]),...(p.hash?['hash:'+p.hash]:[])]){if(seen.has(token))parents[root(i)]=root(seen.get(token));else seen.set(token,i);}});const groups=new Map();rows.forEach((p,i)=>{const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});return shuffled([...groups.values()].map(g=>g[Math.floor(rng()*g.length)]),rng);}
// Rooms already in play before this setting had ten questions.
export function mainRoundCount(state) {
  return state.mainRounds ?? 10;
}

export function initialState(){return {version:3,mainRounds:DEFAULT_MAIN_ROUNDS,phase:'lobby',capacity:8,qualifierCount:2,spinSpeed:120,teams:[],deck:[],cursor:0,round:0,tiles:[],imageVisible:false,revealed:false,open:false,buzz:null,blocked:[],finalists:[],turn:0,roundId:'',spinId:'',spinStart:0,spinSeed:0,fullGuesses:[],revision:0,tiebreak:false,history:[]};}
export function eligible(s){return s.phase==='round'?s.teams.map((_,i)=>i):s.finalists;}
export function resetClue(s,id){Object.assign(s,{tiles:[],imageVisible:s.phase==='final',revealed:false,open:false,buzz:null,blocked:[],roundId:id,spinId:id,spinStart:0,spinSeed:0,fullGuesses:[]});}
export function startGame(s,pictures,id){const deck=uniqueDeck(pictures);const count=mainRoundCount(s);if(!Number.isSafeInteger(count)||count<1)throw Error('Enter a whole number of questions, at least 1.');if(deck.length<count+1)throw Error('This game needs '+(count+1)+' unique phrases, including one for the SUPER Question.');if(s.teams.length<2)throw Error('At least two teams must join.');s.deck=deck;s.cursor=0;s.round=0;s.phase='round';s.teams.forEach(t=>t.score=0);s.history=[];s.tiebreak=false;resetClue(s,id);}
export function qualified(s) {
  const order = s.teams.map((_, i) => i).sort((a, b) => s.teams[b].score - s.teams[a].score || a - b);
  const count = Math.min(s.qualifierCount, order.length);
  if (s.mainRounds !== undefined) return order.slice(0, count);
  const cutoff = s.teams[order[count - 1]]?.score;
  return order.filter(i => s.teams[i].score >= cutoff);
}
export function spinTile(s,now){const available=Array.from({length:TILE_COUNT},(_,i)=>i).filter(i=>!s.tiles.includes(i));if(!available.length)return null;const tick=Math.max(0,Math.floor((now-s.spinStart)/s.spinSpeed));let h=(s.spinSeed>>>0)||1;for(let i=available.length-1;i>0;i--){h=(Math.imul(h,1664525)+1013904223)>>>0;const j=h%(i+1);[available[i],available[j]]=[available[j],available[i]];}return available[tick%available.length];}
export function startSpin(s,now,id,seed){if(s.phase!=='final'||s.revealed||s.buzz!==null)return false;s.open=true;s.spinStart=now;s.spinId=id;s.spinSeed=seed;return true;}
export function acceptBuzz(s,team,roundId,spinId,now){if(roundId!==s.roundId||!s.open||s.buzz!==null||s.revealed||!eligible(s).includes(team)||s.blocked.includes(team))return false;if(s.phase==='final'){if(team!==s.finalists[s.turn]||spinId!==s.spinId)return false;const tile=spinTile(s,now);if(tile!==null)s.tiles.push(tile);}s.buzz=team;s.open=false;return true;}
export function revealMain(s){if(s.phase!=='round'||s.revealed||s.buzz!==null)return false;s.imageVisible=true;s.open=true;return true;}
export function revealAnswer(s){s.revealed=true;s.imageVisible=true;s.open=false;s.buzz=null;}
export function correct(s){if(s.buzz===null)return false;const team=s.buzz,points=s.phase==='round'?MAIN_POINTS:FINAL_POINTS;s.teams[team].score+=points;s.history.push({round:s.roundId,team,points,phrase:s.deck[s.cursor]?.answer});revealAnswer(s);return true;}
export function wrong(s,now,id,seed){if(s.buzz===null)return false;const team=s.buzz;s.buzz=null;if(s.phase==='round'){s.blocked.push(team);s.open=eligible(s).some(i=>!s.blocked.includes(i));}else{if(s.tiles.length===TILE_COUNT){if(!s.fullGuesses.includes(team))s.fullGuesses.push(team);if(s.finalists.every(i=>s.fullGuesses.includes(i))){revealAnswer(s);return true;}}do{s.turn=(s.turn+1)%s.finalists.length;}while(s.tiles.length===TILE_COUNT&&s.fullGuesses.includes(s.finalists[s.turn]));startSpin(s,now,id,seed);}return true;}
export function advance(s,id){if(!s.revealed)return false;if(s.phase==='round'){if(s.round===mainRoundCount(s)-1){s.phase='qualifiers';s.finalists=qualified(s);s.open=false;s.buzz=null;return true;}s.round++;s.cursor++;resetClue(s,id);return true;}
 if(s.phase==='final'){const best=Math.max(...s.finalists.map(i=>s.teams[i].score));const winners=s.finalists.filter(i=>s.teams[i].score===best);if(s.mainRounds===undefined&&winners.length>1&&s.cursor+1<s.deck.length){s.phase='qualifiers';s.finalists=winners;s.tiebreak=true;}else{s.phase='finished';s.winners=winners;}return true;}return false;}
export function startFinal(s,id){if(s.phase!=='qualifiers')return false;if(s.cursor+1>=s.deck.length){s.phase='finished';s.winners=s.finalists;return false;}s.cursor++;s.phase='final';s.turn=0;resetClue(s,id);return true;}
export function publicSnapshot(s,hostTime){const {deck,history,...publicState}=s;const clue=deck[s.cursor];return {...publicState,hostTime,clueId:clue?.id||'',image:(s.phase==='final'||s.imageVisible)&&!['qualifiers','finished'].includes(s.phase)?clue?.image||'':'',answer:s.revealed?clue?.answer||'':'',history:history.map(({phrase,...row})=>row)};}
