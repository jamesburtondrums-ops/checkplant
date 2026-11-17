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
let writes = [], failCommit = false;
const db = { collection: name => ({ doc: id => name + '/' + id }), runTransaction: async fn => {
  const pending = [];
  const result = await fn({ get: async ref => ({ exists: !!store[ref], data: () => store[ref] }), update: (ref, patch) => pending.push([ref, patch]) });
  if (failCommit) throw Error('Network unavailable');
  pending.forEach(([ref, patch]) => Object.assign(store[ref], patch)); writes = pending; return result;
} };
(async () => {
  await persist(db, finished, ['d1', 'd2'], { Timestamp: { now: () => 1 } });
  assert.equal(writes.length, 5);
  for (const ref of finished.refs) assert.deepEqual(store[ref.collection + '/' + ref.id].defectRefIds, ['d1', 'd2']);
  assert.equal(store['costEntries/c1'].costStatus, 'fully_signed_off');
  assert.equal(store['defects/d1'].status, 'resolved');
  assert.equal(store['defects/d2'].status, 'resolved');
  assert.equal(store['defects/d1'].resolutionRecordId, 'r1');
  assert.equal(store['defects/d1'].resolutionJobId, 'JOB1');
  assert.match(store['defects/d1'].resolvedDate, /^\d{4}-\d{2}-\d{2}$/);
  const originalResolution = JSON.stringify(store['defects/d1']);
  await persist(db, { ...finished, defectIds: ['d1', 'd2'] }, ['d1', 'd2'], { Timestamp: { now: () => 2 } });
  assert.equal(JSON.stringify(store['defects/d1']), originalResolution);
  const fresh = { ...finished, defectIds: ['d1', 'd2'] };
  await assert.rejects(persist(db, fresh, ['other'], { Timestamp: { now: () => 1 } }), /belonging to this machine/);
  await assert.rejects(persist(db, finished, [], { Timestamp: { now: () => 1 } }), /changed elsewhere/);
  await persist(db, fresh, [], { Timestamp: { now: () => 1 } });
  assert.deepEqual(store['records/r1'].defectRefIds, []);
  assert.equal(store['liveJobs/l1'].defectRefId, null);
  assert.equal(store['defects/d1'].status, 'resolved');
  const unfinished = groups.find(g => !g.finished);
  store['liveJobs/l2'] = { ...unfinished.refs[0].row };
  store['defects/d3'] = { machineId: 'm1', status: 'open' };
  await persist(db, unfinished, ['d3'], { Timestamp: { now: () => 3 } });
  assert.equal(store['defects/d3'].status, 'open');
  store['liveJobs/l2'].status = 'completed';
  failCommit = true;
  await assert.rejects(persist(db, { ...unfinished, defectIds: ['d3'] }, ['d3'], { Timestamp: { now: () => 4 } }), /Network/);
  assert.equal(store['defects/d3'].status, 'open');
  failCommit = false;
  await persist(db, { ...unfinished, defectIds: ['d3'] }, ['d3'], { Timestamp: { now: () => 4 } });
  assert.equal(store['defects/d3'].status, 'resolved');
  console.log('PASS: completed-job auto resolution, unfinished links stay open, original resolution preserved, atomic failed save, fresh completion status, machine validation, concurrent edit protection, unlinking does not reopen defects, page syntax');
})().catch(e => { console.error(e); process.exitCode = 1; });
