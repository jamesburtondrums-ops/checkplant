const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert(!html.includes('ensureMachinesSeeded'));assert(!html.includes('SEED_MACHINES'));
const code=html.slice(html.indexOf('function normaliseAssetValue'),html.indexOf('function renderMachineList()'));
const fields=Object.fromEntries(['newMachineName','newMachineSerial','newMachineCategory','newMachineBranch','assetSaveMessage','addMachineButton'].map(k=>[k,{value:'',textContent:'',disabled:false}]));
let rows=[],version=0,writes=0,fail=false,attempts=0;
const snapshot=data=>({exists:!!data,data:()=>data});
const db={collection:name=>({doc:(id='asset-'+Math.random())=>({name,id}),get:async()=>({docs:rows.map(r=>({id:r.id,data:()=>r}))})}),runTransaction:async fn=>{
 for(let retry=0;retry<10;retry++){
  if(fail)throw Error('Network unavailable');const observed=version;const pending=[];attempts++;
  const result=await fn({get:async ref=>snapshot(ref.name==='settings'?{revision:version}:rows.find(r=>r.id===ref.id)),set:(ref,data)=>pending.push([ref,data]),update:(ref,data)=>pending.push([ref,data])});
  await new Promise(r=>setTimeout(r,1));if(version!==observed)continue;
  for(const [ref,data] of pending){if(ref.name==='settings'){version++;continue;}writes++;const existing=rows.find(r=>r.id===ref.id);if(existing)Object.assign(existing,data);else rows.push({id:ref.id,...data});}return result;
 }throw Error('Transaction retries exhausted');}};
const c=vm.createContext({db,document:{getElementById:id=>fields[id]},categories:{excavator:{lolerApplies:true}},SERVICE_HOURS_LIMIT:500,firebase:{firestore:{Timestamp:{now:()=>0}}},toast(){},renderMachineList(){}});vm.runInContext(code,c);
(async()=>{
 assert(c.sameAsset({serialNumber:'AB-123'},{serialNumber:' ab 123 '}));
 assert(!c.sameAsset({name:'Digger',serialNumber:'1'},{name:'Digger',serialNumber:'2'}));
 fields.newMachineName.value='Digger';fields.newMachineSerial.value='AB-123';fields.newMachineCategory.value='excavator';
 await Promise.all([c.addMachine(),c.addMachine()]);assert.equal(writes,1);
 fields.newMachineName.value='Changed name';fields.newMachineSerial.value='ab123';await c.addMachine();assert.equal(writes,1);assert.match(fields.assetSaveMessage.textContent,/already matches/);
 fields.newMachineSerial.value='NEW';fail=true;await c.addMachine();assert.equal(fields.newMachineSerial.value,'NEW');assert.equal(fields.addMachineButton.disabled,false);assert.match(fields.assetSaveMessage.textContent,/not saved/);fail=false;
 const before=writes;const outcomes=await Promise.allSettled([c.writeMachineIdentity(db.collection('machines').doc('a'),{name:'Concurrent',serialNumber:'RACE'},true),c.writeMachineIdentity(db.collection('machines').doc('b'),{name:'Concurrent',serialNumber:'race'},true)]);
 assert.equal(writes,before+1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
 await assert.rejects(c.writeMachineIdentity(db.collection('machines').doc(rows[0].id),{serialNumber:'RACE'},false),/already matches/);
 console.log('PASS: syntax, no automatic asset seeding, serial normalisation, distinct serials, double click, duplicate feedback, failed save recovery, competing transaction retry, duplicate edit protection');
})().catch(e=>{console.error(e);process.exitCode=1});
