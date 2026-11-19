const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('asset-status.html','utf8');
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
new vm.Script(code);
const fields=Object.fromEntries(['assetPin','assetUnlockButton','assetGateMessage','assetStatusBoard','assetGate','assetUnlockForm'].map(id=>[id,{value:'',hidden:id==='assetStatusBoard',focus(){},addEventListener(type,fn){this[type]=fn;}}]));
let reads=0,opens=0,fail=false;
const db={collection:name=>({doc:id=>({get:async options=>{reads++;assert.equal(name,'settings');assert.equal(id,'backoffice');assert.equal(options.source,'server');if(fail)throw Error('offline');return{exists:true,data:()=>({pin:'1234'})};}})})};
vm.runInNewContext(code,{document:{getElementById:id=>fields[id]},firebase:{initializeApp(){},firestore:()=>db},window:{AssetStatus:{open:options=>{assert(options.canAccess());assert(options.wall);opens++;}}}});
(async()=>{
 assert.equal(reads,0);assert.equal(opens,0);assert(fields.assetStatusBoard.hidden);
 fields.assetPin.value='9999';await fields.assetUnlockForm.submit({preventDefault(){}});assert.equal(opens,0);assert(fields.assetStatusBoard.hidden);assert.match(fields.assetGateMessage.textContent,/Incorrect/);
 fail=true;fields.assetPin.value='1234';await fields.assetUnlockForm.submit({preventDefault(){}});assert.equal(opens,0);assert(fields.assetStatusBoard.hidden);assert.equal(fields.assetUnlockButton.disabled,false);
 fail=false;await fields.assetUnlockForm.submit({preventDefault(){}});assert.equal(opens,1);assert(!fields.assetStatusBoard.hidden);assert(fields.assetGate.hidden);assert.equal(fields.assetPin.value,'');
 console.log('PASS: standalone page syntax, no asset connection before unlock, incorrect PIN blocked, offline failure recovery, existing PIN unlocks wall view, no PIN persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
