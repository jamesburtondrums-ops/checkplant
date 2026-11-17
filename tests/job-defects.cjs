const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { ids, jobsFrom, persist } = require('../job-defects.js');
for (const file of ['index.html', 'costlog.html', 'managerdash.html']) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: file });
}
const data = {
  liveJobs: [{ id: 'l1', jobId: 'JOB1', status: 'completed', machineId: 'm1', defectRefId: 'd1' }, { id: 'l2', jobId: 'JOB2', status: 'paused', machineId: 'm1' }],
  records: [{ id: 'r1', type: 'adhoc', recordId: 'JOB1', machineId: 'm1' }],
  costEntries: [{ id: 'c1', linkedRecordId: 'r1', machineId: 'm1', costStatus: 'fully_signed_off' }, { id: 'external', workSource: 'external' }]
};
const groups = jobsFrom(data);
assert.equal(groups.length, 2);
const finished = groups.find(g => g.finished);
assert.equal(finished.refs.length, 3);
assert.deepEqual(finished.defectIds, ['d1']);
assert.deepEqual(ids({ defectRefIds: [], defectRefId: 'old' }), []);
const store = Object.fromEntries(finished.refs.map(r => [r.collection + '/' + r.id, { ...r.row }]));
store['defects/d1'] = { machineId: 'm1', defectId: 'DEF1' };
store['defects/d2'] = { machineId: 'm1', defectId: 'DEF2' };
store['defects/other'] = { machineId: 'm2' };
let writes = [];
const db = { collection: name => ({ doc: id => name + '/' + id }), runTransaction: async fn => {
  const pending = [];
  await fn({ get: async ref => ({ exists: !!store[ref], data: () => store[ref] }), update: (ref, patch) => pending.push([ref, patch]) });
  pending.forEach(([ref, patch]) => Object.assign(store[ref], patch)); writes = pending;
} };
(async () => {
  await persist(db, finished, ['d1', 'd2'], { Timestamp: { now: () => 1 } });
  assert.equal(writes.length, 3);
  for (const [ref] of writes) assert.deepEqual(store[ref].defectRefIds, ['d1', 'd2']);
  assert.equal(store['costEntries/c1'].costStatus, 'fully_signed_off');
  assert.equal(store['defects/d1'].status, undefined);
  const fresh = { ...finished, defectIds: ['d1', 'd2'] };
  await assert.rejects(persist(db, fresh, ['other'], { Timestamp: { now: () => 1 } }), /belonging to this machine/);
  await assert.rejects(persist(db, finished, [], { Timestamp: { now: () => 1 } }), /changed elsewhere/);
  await persist(db, fresh, [], { Timestamp: { now: () => 1 } });
  assert.deepEqual(store['records/r1'].defectRefIds, []);
  assert.equal(store['liveJobs/l1'].defectRefId, null);
  console.log('PASS: page syntax; legacy job grouping; finished/live filtering; multiple links across live, completed and signed-off records; machine validation; concurrent edit protection; removal; status preservation');
})().catch(e => { console.error(e); process.exitCode = 1; });
