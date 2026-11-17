const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildRows, table, shell } = require('../asset-status.js');
const machines = [
  { id: 'b', name: 'Grab 10', outOfService: true, outOfServiceReason: 'Hydraulic failure', currentHours: 100.5 },
  { id: 'a', name: 'Grab 2', branch: 'Rotherham', currentHours: 0 },
  { id: 'c', name: 'Loader', currentHours: '' },
  { id: 'd', name: '<script>alert(1)</script>', currentHours: -1 }
];
const jobs = [
  { id: 'j1', machineId: 'a', status: 'active', engineerName: 'Alex' },
  { id: 'j2', machineId: 'a', status: 'paused' },
  { id: 'j3', machineId: 'a', status: 'assigned' },
  { id: 'j4', machineId: 'a', status: 'planned' },
  { id: 'j5', machineId: 'a', status: 'completed' },
  { id: 'j6', machineId: 'b', status: 'cancelled' },
  { id: 'orphan', machineId: 'other', status: 'active' }
];
const defects = [{ machineId: 'a', status: 'open' }, { machineId: 'a', status: 'resolved' }, { machineId: 'b', status: 'open' }];
const rows = buildRows(machines, jobs, defects), byId = Object.fromEntries(rows.map(r => [r.machine.id, r]));
assert.equal(rows.length, 4); // All assets, including those with no jobs or hours.
assert.equal(byId.a.hours, 0);
assert.equal(byId.b.hours, 100.5);
assert.equal(byId.c.hours, null);
assert.equal(byId.d.hours, null);
assert.equal(byId.a.status, 'In service · defects');
assert.equal(byId.b.status, 'Out of service');
assert.equal(byId.c.status, 'In service');
assert.equal(byId.a.openDefects, 1);
assert.equal(byId.a.active.length, 1);
assert.equal(byId.a.outstanding.length, 3);
assert.equal(byId.b.active.length + byId.b.outstanding.length, 0);
assert(rows.findIndex(r => r.machine.id === 'a') < rows.findIndex(r => r.machine.id === 'b'));
const markup = table(rows);
assert(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!markup.includes('<script>alert(1)</script>'));
assert(markup.includes('1 paused · 2 waiting / planned'));
assert(markup.includes('No current hours recorded'));
assert(shell(true).includes('Full screen'));
assert(!shell(true).includes('data-as-popout'));
const fresh = buildRows(machines, jobs.map(j => j.id === 'j1' ? { ...j, status: 'completed' } : j), defects.map(d => ({ ...d, status: 'resolved' })));
assert.equal(fresh.find(r => r.machine.id === 'a').active.length, 0);
assert.equal(fresh.find(r => r.machine.id === 'a').status, 'In service');
const html = fs.readFileSync('index.html', 'utf8');
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const switchCode = html.slice(html.indexOf('function switchOfficeTab('), html.indexOf('function populateNewMachineCategorySelect('));
let askedForPin = 0, opened = 0;
const ctx = vm.createContext({ backOfficeUnlocked: false, requestBackOffice: () => askedForPin++, document: { querySelectorAll: () => [], getElementById: () => ({ style: {} }) }, AssetStatus: { open: options => { assert(options.canAccess()); opened++; } }, db: {} });
vm.runInContext(switchCode, ctx);
ctx.switchOfficeTab('assetstatus');
assert.equal(askedForPin, 1); assert.equal(opened, 0);
vm.runInContext('backOfficeUnlocked=true', ctx); ctx.switchOfficeTab('assetstatus');
assert.equal(opened, 1);
assert(html.indexOf('data-tab="assetstatus"') > html.indexOf('id="screen-backoffice"'));
console.log('PASS: all-asset coverage, VOR priority, defect status, zero/missing hours, active/paused/planned/assigned jobs, completed/cancelled exclusion, natural sorting, escaping, live changes, back-office PIN gate, pop-out controls and page syntax');
