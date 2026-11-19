import assert from 'node:assert/strict';import * as E from './engine.mjs';
const photos=Array.from({length:30},(_,i)=>({id:'p'+i,answer:'Phrase '+i,image:'https://pictures.test/'+i,hash:'hash'+i}));
let unique=E.uniqueDeck([...photos,{...photos[0],id:'alt0',hash:'different'},{...photos[1],id:'samefile',answer:'Different wording'}]);assert.equal(unique.length,30);assert.equal(new Set(unique.map(x=>E.phraseKey(x.answer))).size,30);
const transitive=[{id:'a',answer:'An apple',image:'a',hash:'same'},{id:'b',answer:'Banana',image:'b',hash:'same'},{id:'c',answer:'Banana',image:'c',hash:'other'},{id:'d',answer:'Orange',image:'d',group:'fruit'},{id:'e',answer:'Tangerine',image:'e',group:'fruit'}];assert.equal(E.uniqueDeck(transitive).length,2);
assert.equal(E.phraseKey('The STORM, in a teacup (Artwork 2)'),'storm in a teacup');
for(let trial=0;trial<50;trial++){const s=E.initialState();delete s.mainRounds;s.teams=[{name:'A',score:0},{name:'B',score:0},{name:'C',score:0}];E.startGame(s,photos,'round0');assert.equal(s.deck.length,30);
 const seen=new Set();for(let round=0;round<10;round++){assert.equal(s.phase,'round');assert.equal(s.round,round);assert(!seen.has(s.deck[s.cursor].id));seen.add(s.deck[s.cursor].id);const snap=E.publicSnapshot(s,0);assert(!('deck' in snap));assert.equal(snap.answer,'');assert.equal(snap.image,'');assert(!E.acceptBuzz(s,0,s.roundId,s.spinId,0));E.revealMain(s);assert(E.acceptBuzz(s,0,s.roundId,s.spinId,1));assert(!E.acceptBuzz(s,1,s.roundId,s.spinId,1));E.wrong(s,2,'spin',1);assert(s.open);assert(!E.acceptBuzz(s,0,s.roundId,s.spinId,3));assert(E.acceptBuzz(s,1,s.roundId,s.spinId,3));E.correct(s);assert.equal(s.teams[1].score,(round+1)*10);E.advance(s,'round'+(round+1));}
 assert.equal(s.phase,'qualifiers');assert.deepEqual(s.finalists,[1,0,2]); // tied cutoff included
 assert.equal(s.cursor,9);E.startFinal(s,'final');assert.equal(s.cursor,10);assert(!seen.has(s.deck[s.cursor].id));assert.equal(s.tiles.length,0);E.startSpin(s,1000,'spin1',55);assert(!E.acceptBuzz(s,0,'final','spin1',1100));let tile=E.spinTile(s,1120);assert(E.acceptBuzz(s,1,'final','spin1',1120));assert.deepEqual(s.tiles,[tile]);assert(!s.open);assert(!E.acceptBuzz(s,1,'final','spin1',1120));E.wrong(s,1200,'spin2',66);assert.equal(s.finalists[s.turn],0);assert(s.open);assert(!E.acceptBuzz(s,0,'final','spin1',1250));assert(E.acceptBuzz(s,0,'final','spin2',1320));assert.equal(new Set(s.tiles).size,2);E.correct(s);assert.equal(s.teams[0].score,25);E.advance(s,'end');assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[1]); // scores carry forward
}
// Twelve stops remove twelve unique squares; only the current finalist may buzz.
let s=E.initialState();delete s.mainRounds;s.teams=[{name:'A',score:0},{name:'B',score:0}];s.deck=photos;s.phase='final';s.finalists=[0,1];E.resetClue(s,'f');E.startSpin(s,0,'x0',2);for(let i=0;i<12;i++){assert(E.acceptBuzz(s,s.finalists[s.turn],'f','x'+i,i*100+1));if(i<11)E.wrong(s,(i+1)*100,'x'+(i+1),i+3);}assert.equal(new Set(s.tiles).size,12);E.wrong(s,1300,'full1',7);assert(!s.revealed);assert(E.acceptBuzz(s,s.finalists[s.turn],'f','full1',1400));E.wrong(s,1500,'full2',8);assert(s.revealed);E.advance(s,'next');assert.equal(s.phase,'qualifiers');assert(s.tiebreak);E.startFinal(s,'tb');assert.equal(s.cursor,1);
// A turn highlights one square at a time and changes on each speed tick.
s.tiles=[];s.spinSpeed=120;s.spinStart=0;s.spinSeed=55;const a=E.spinTile(s,0),b=E.spinTile(s,120);assert.notEqual(a,b);assert.equal(E.spinTile(s,1),a);
console.log('Passed: 50 complete 10-round games, transitive image/phrase deduplication, cutoff ties, scoring, turn gating, stale and double buzz rejection, square exhaustion, tie-breaks and safe public snapshots.');

assert.equal(E.mainRoundCount(E.initialState()),15);
for (const count of [1, 7, 15, 29]) {
  const game = E.initialState();
  game.mainRounds = count;
  game.teams = [{name:'A',score:0},{name:'B',score:0},{name:'C',score:0}];
  assert.throws(() => E.startGame(game, photos.slice(0,count), 'too-few'), /unique phrases/);
  E.startGame(game, photos, 'first');
  const used = new Set();
  for (let round=0;round<count;round++) {
    assert.equal(game.phase,'round');
    assert.equal(game.round,round);
    assert.equal(E.publicSnapshot(game,0).mainRounds,count);
    used.add(game.deck[game.cursor].id);
    E.revealAnswer(game);
    E.advance(game,'next-'+round);
  }
  assert.equal(used.size,count);
  assert.equal(game.phase,'qualifiers');
  assert.deepEqual(game.finalists,[0,1]);
  E.startFinal(game,'super');
  assert(!used.has(game.deck[game.cursor].id));
  E.startSpin(game,0,'spin',2);
  assert.equal(E.acceptBuzz(game,2,'super','spin',1),false);
  E.revealAnswer(game);
  E.advance(game,'end');
  assert.equal(game.phase,'finished');
  assert.deepEqual(game.winners,[0,1]);
}
console.log('Passed: 1, 7, 15 and 29 main questions, library limits, top two in a cutoff tie and exactly one fresh SUPER Question.');
