const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const helpers=html.slice(html.indexOf('function serviceRecordDateMs('),html.indexOf('function initFirestoreListeners('));
const latest=html.slice(html.indexOf('function latestServiceRecordForMachine('),html.indexOf('function effectiveServiceBaseline('));
const recent=Array.from({length:300},(_,i)=>({id:'check-'+i,type:'check',machineId:'grab',date:'2026-11-19'}));
let refreshes=0;
const c=vm.createContext({records:recent,serviceRecords:[],serviceHistoryLoaded:false,serviceHistoryError:false,renderHomeMachineList:()=>refreshes++,renderOverdueAlerts(){},document:{getElementById:()=>null},currentProfileMachineId:null});
vm.runInContext(helpers+latest,c);
assert.match(c.serviceHistoryEmptyText(),/Loading/);
const rows=[
 {id:'old',type:'service',machineId:'grab',date:'2026-10-01',createdAt:{toMillis:()=>100}},
 {id:'new',type:'service',machineId:'grab',date:'2026-11-10'}, // No createdAt field: must still appear.
 {id:'backdated',type:'service',machineId:'grab',date:'2026-10-15',createdAt:{toMillis:()=>99999}},
 {id:'loader',type:'service',machineId:'loader',date:'2026-11-05'},
 {id:'timestamp-only',type:'service',machineId:'other',completedAt:{toMillis:()=>Date.parse('2026-11-04')}}
];
function snapshot(records,fromCache=false){return{docs:records.map(r=>({id:r.id,data:()=>r})),metadata:{fromCache}};}
c.applyServiceHistorySnapshot(snapshot(rows));
assert.equal(c.latestServiceRecordForMachine('grab').id,'new');
assert.equal(c.latestServiceRecordForMachine('loader').date,'2026-11-05');
assert.equal(c.latestServiceRecordForMachine('other').id,'timestamp-only');
assert.equal(c.serviceHistoryForMachine('grab').length,3);
assert.equal(c.serviceHistoryForMachine('missing').length,0);
assert.match(c.serviceHistoryEmptyText(),/No service recorded/);
assert.equal(c.records.length,300); // Frequent checks retain the fast recent-record feed.
c.applyServiceHistorySnapshot(snapshot(rows.filter(r=>r.id!=='new')));
assert.equal(c.latestServiceRecordForMachine('grab').id,'backdated'); // Deleted latest is removed.
c.applyServiceHistorySnapshot(snapshot([{...rows[0],date:'2026-11-18'}]));
assert.equal(c.latestServiceRecordForMachine('grab').date,'2026-11-18'); // Live edits refresh dates.
c.applyServiceHistorySnapshot(snapshot([],true));
assert.match(c.serviceHistoryEmptyText(),/Loading/); // Empty cache never claims there was no service.
c.serviceHistoryError=true;assert.match(c.serviceHistoryEmptyText(),/unavailable/);
assert(refreshes>=4);
assert(html.includes("db.collection('records').where('type','==','service').onSnapshot({includeMetadataChanges:true},applyServiceHistorySnapshot"));
assert(!html.includes("const ls=records.find(r=>r.type==='service'"));
assert(html.includes('const mr=serviceHistoryForMachine(id)'));
assert(html.includes("const r=serviceRecords.find(x=>x.id===id)||records.find(x=>x.id===id)"));
console.log('PASS: services beyond 300 daily records for multiple assets, missing createdAt, service-date order, live edits/deletions, cache/loading errors, profile history and historical PDF lookup');
