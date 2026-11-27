const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"../checkdiesel.html"),"utf8");
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source,{filename:"checkdiesel.html"});
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,"HTML IDs must be unique");
assert.match(html,/href="index.html"/);
assert.match(html,/href="managerdash.html"/);
const nodes=Object.fromEntries(ids.map(id=>[id,{
 value:"",textContent:"",className:"",addEventListener(){},replaceChildren(...a){this.value=a[0]?.value||""},
 add(){},append(){},querySelector(){return {disabled:false}},reset(){}
}]));
const document={getElementById:id=>nodes[id],querySelectorAll:()=>[],createElement:()=>({append(){}})};
function Option(label,value){this.label=label;this.value=value}
const data={machines:new Map([["loader-1",{name:"Case 821F",branch:"Rotherham"}]]),dieselTanks:new Map(),dieselMovements:new Map()},listeners={};
let count=0;
function emit(name){(listeners[name]||[]).forEach(fn=>fn({docs:[...data[name]].map(([id,item])=>({id,data:()=>item}))}))}
const db={
 collection(name){return {doc(id){return {id:id||"id-"+(++count),name}},orderBy(){return this},onSnapshot(fn){(listeners[name]||=[]).push(fn);emit(name)}}},
 async runTransaction(fn){const pending=[];await fn({
  async get(ref){return {exists:data[ref.name].has(ref.id),data:()=>({...data[ref.name].get(ref.id)})}},
  set(ref,values){pending.push(["set",ref,values])},
  update(ref,values){pending.push(["update",ref,values])}
 });for(const [op,ref,values] of pending){data[ref.name].set(ref.id,op==="update"?{...data[ref.name].get(ref.id),...values}:values)}[...new Set(pending.map(x=>x[1].name))].forEach(emit)}
};
const firestore=()=>db;firestore.Timestamp={now:()=>({toDate:()=>new Date(),toMillis:()=>Date.now()})};
const api=new Function("firebase","document","Option","confirm","setTimeout","clearTimeout","console",source+"return {setup,deliver,refuel,transfer,dip};")(
 {initializeApp(){},firestore},document,Option,()=>true,()=>0,()=>{}, {error(){}}
);
function set(values){for(const [key,value] of Object.entries(values))nodes[key].value=String(value)}
async function submit(action,name){await action({preventDefault(){},currentTarget:nodes["form-"+name]})}
(async()=>{
 set({"setup-name":"Main tank","setup-site":"Rotherham","setup-kind":"fixed","setup-capacity":1500,"setup-opening":800,"setup-reorder":150,"setup-cost":1.2245,"setup-operator":"Supervisor"});
 await submit(api.setup,"setup");
 const a=[...data.dieselTanks.keys()][0];assert.ok(a);
 set({"setup-name":"Bowser","setup-site":"Rotherham","setup-kind":"bowser","setup-capacity":500,"setup-opening":20,"setup-reorder":50,"setup-cost":1.3,"setup-operator":"Supervisor"});
 await submit(api.setup,"setup");
 const b=[...data.dieselTanks.keys()][1];assert.ok(b);
 set({"delivery-tank":a,"delivery-litres":100,"delivery-price":1.5567,"delivery-date":"2026-10-20","delivery-supplier":"Supplier","delivery-ref":"DN-1","delivery-operator":"Receiver"});
 await submit(api.deliver,"delivery");
 assert.equal(data.dieselTanks.get(a).stockLitres,900);
 assert.equal(data.dieselTanks.get(a).averageCostPerLitre,1.2614);
 set({"refuel-tank":a,"refuel-machine":"loader-1","refuel-litres":120,"refuel-hours":152.5,"refuel-operator":"Driver","refuel-date":"2026-10-20","refuel-note":"Shift"});
 await submit(api.refuel,"refuel");
 assert.equal(data.dieselTanks.get(a).stockLitres,780);
 assert.equal([...data.dieselMovements.values()].find(r=>r.type==="issue").machineId,"loader-1");
 set({"transfer-from":a,"transfer-to":b,"transfer-litres":50,"transfer-date":"2026-10-20","transfer-operator":"Driver","transfer-ref":"TX-1"});
 await submit(api.transfer,"transfer");
 assert.equal(data.dieselTanks.get(a).stockLitres,730);
 assert.equal(data.dieselTanks.get(b).stockLitres,70);
 set({"refuel-tank":a,"refuel-machine":"loader-1","refuel-litres":1000,"refuel-hours":155,"refuel-operator":"Driver","refuel-date":"2026-10-20"});
 await submit(api.refuel,"refuel");
 assert.equal(data.dieselTanks.get(a).stockLitres,730,"Overdraw must not change balance");
 assert.match(nodes.message.textContent,/Insufficient stock/);
 set({"dip-tank":a,"dip-stock":720,"dip-date":"2026-10-20","dip-operator":"Supervisor","dip-note":"Calibrated gauge reading"});
 await submit(api.dip,"dip");
 assert.equal(data.dieselTanks.get(a).stockLitres,720);
 assert.equal(data.dieselMovements.size,7);
 const types=[...data.dieselMovements.values()].map(x=>x.type);
 for(const expected of ["opening","delivery","issue","transfer_out","transfer_in","adjustment"])assert.ok(types.includes(expected));
 console.log("PASS CheckDiesel: syntax, unique IDs, machine link, opening balances, deliveries, weighted fuel cost, refuel, transfers, stock checks, insufficient stock");
})().catch(e=>{console.error(e);process.exitCode=1});