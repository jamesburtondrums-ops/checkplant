/* Read-only asset display, launched from the existing Back Office PIN gate. */
(function () {
  'use strict';
  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reading = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  function buildRows(machines, liveJobs, defects) {
    const jobs = new Map(), open = new Map();
    liveJobs.forEach(job => {
      if (!['active','paused','assigned','planned'].includes(job.status)) return;
      if (!jobs.has(job.machineId)) jobs.set(job.machineId, []);
      jobs.get(job.machineId).push(job);
    });
    defects.filter(d => d.status === 'open').forEach(d => open.set(d.machineId, (open.get(d.machineId) || 0) + 1));
    return machines.map(machine => {
      const related = jobs.get(machine.id) || [], active = related.filter(j => j.status === 'active'), outstanding = related.filter(j => j.status !== 'active');
      const hours = reading(machine.currentHours), lastService = reading(machine.lastServiceHours);
      const nextServiceHours = reading(machine.nextServiceDueHours) ?? (lastService == null ? null : lastService + 500);
      return { machine, hours, nextServiceHours, active, outstanding, openDefects: open.get(machine.id) || 0,
        status: machine.outOfService ? 'Out of service' : open.has(machine.id) ? 'In service · defects' : 'In service',
        statusClass: machine.outOfService ? 'danger' : open.has(machine.id) ? 'warning' : 'good' };
    }).sort((a, b) => String(a.machine.name || a.machine.id).localeCompare(String(b.machine.name || b.machine.id), 'en-GB', { numeric: true, sensitivity: 'base' }));
  }
  function jobDescription(jobs) {
    return jobs.map(j => [j.jobId || 'Job', j.status === 'active' ? 'In progress' : j.status, j.engineerName, j.jobCategory || j.jobType, j.plannedDate || '', j.jobDescription].filter(Boolean).join(' · ')).join('\n');
  }
  function table(rows) {
    return '<div class="as-table-wrap"><table aria-label="Asset status list"><colgroup><col style="width:25%"><col style="width:19%"><col style="width:12%"><col style="width:13%"><col style="width:14%"><col style="width:17%"></colgroup><thead><tr><th>Asset</th><th>Status</th><th class="as-hours">Current hours</th><th class="as-hours">Next service hours</th><th>In progress</th><th>Outstanding</th></tr></thead><tbody>' + rows.map(row => {
      const m = row.machine, paused = row.outstanding.filter(j => j.status === 'paused').length;
      return '<tr><td><span class="as-name">' + h(m.name || 'Unnamed asset') + '</span><span class="as-sub">' + h(m.branch || 'No branch') + (m.serialNumber ? ' · ' + h(m.serialNumber) : '') + '</span></td><td><span class="as-badge ' + row.statusClass + '">' + h(row.status) + '</span>' + (row.openDefects ? '<span class="as-sub">' + row.openDefects + ' open defect' + (row.openDefects === 1 ? '' : 's') + '</span>' : '') + (m.outOfService && m.outOfServiceReason ? '<span class="as-sub">' + h(m.outOfServiceReason) + '</span>' : '') + '</td><td class="as-hours">' + (row.hours == null ? '<span title="No current hours recorded">—</span>' : row.hours.toLocaleString('en-GB', { maximumFractionDigits: 1 })) + '</td><td class="as-hours">' + (row.nextServiceHours == null ? '<span title="No service hours recorded">—</span>' : row.nextServiceHours.toLocaleString('en-GB', { maximumFractionDigits: 1 })) + '</td><td title="' + h(jobDescription(row.active)) + '">' + (row.active.length ? '<span class="as-badge blue">' + row.active.length + ' active</span><span class="as-sub">' + h([...new Set(row.active.map(j => j.engineerName || 'Unassigned'))].join(', ')) + '</span>' : '<span class="as-none">None</span>') + '</td><td title="' + h(jobDescription(row.outstanding)) + '">' + (row.outstanding.length ? '<span class="as-badge warning">' + row.outstanding.length + ' job' + (row.outstanding.length === 1 ? '' : 's') + '</span><span class="as-sub">' + (paused ? paused + ' paused' + (paused < row.outstanding.length ? ' · ' : '') : '') + (row.outstanding.length > paused ? (row.outstanding.length - paused) + ' waiting / planned' : '') + '</span>' : '<span class="as-none">None</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function shell(popout) {
    return '<div class="as-head"><div><div class="as-eyebrow">CheckPlant / KCM Waste Management</div><h2>Asset Status</h2></div><div class="as-clock"><strong data-as-time>--:--:--</strong><span data-as-date></span></div></div><div class="as-controls"><button type="button" data-as-fullscreen>Full screen</button>' + (popout ? '' : '<button type="button" data-as-popout>Pop out to another screen</button>') + '</div><p class="as-message" data-as-message role="status"></p><div class="as-stats" data-as-stats></div><div class="as-sync" data-as-sync data-state="warning" role="status"><span class="as-dot"></span><span data-as-sync-text>Loading asset status…</span></div><div class="as-grid" data-as-grid><div class="as-empty">Loading all assets…</div></div><div class="as-footer"><span data-as-count>All assets</span><span>Outstanding jobs = paused, assigned or planned · Current hours = latest reading · Next service = due meter reading</span></div>';
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { buildRows, table, shell }; return; }
  function installDisplay(root, displayWindow) {
    let timer;
    const full = root.querySelector('[data-as-fullscreen]');
    full.addEventListener('click', async () => {
      try {
        if (displayWindow.document.fullscreenElement) await displayWindow.document.exitFullscreen();
        else if (root.requestFullscreen) await root.requestFullscreen();
        else throw Error('Full screen is unavailable in this browser. Use the pop-out view and your browser full-screen control.');
      } catch (error) { root.querySelector('[data-as-message]').textContent = error.message; }
    });
    const onFullscreen = () => {
      const isFull = displayWindow.document.fullscreenElement === root;
      root.classList.toggle('as-wall', isFull || root.hasAttribute('data-asset-display'));
      full.textContent = isFull ? 'Exit full screen' : 'Full screen';
      root.dispatchEvent(new displayWindow.Event('asset-layout'));
      fit();
    };
    displayWindow.document.addEventListener('fullscreenchange', onFullscreen);
    function fit() {
      if (!root.classList.contains('as-wall')) { root.style.removeProperty('--as-row-font'); root.style.removeProperty('--as-pad'); return; }
      const largest = Math.max(1, ...Array.from(root.querySelectorAll('tbody')).map(body => body.rows.length));
      const allowance = Math.max(100, displayWindow.innerHeight - 270);
      const height = allowance / largest;
      root.style.setProperty('--as-row-font', Math.min(17, Math.max(10, height / 3.8)) + 'px');
      root.style.setProperty('--as-pad', Math.min(12, Math.max(2, height / 8)) + 'px');
    }
    function tick() {
      const date = new Date();
      root.querySelector('[data-as-time]').textContent = date.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false });
      root.querySelector('[data-as-date]').textContent = date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      const sync = root.querySelector('[data-as-sync]');
      sync.dataset.state = root.dataset.live !== 'true' ? 'warning' : 'live';
      root.querySelector('[data-as-sync-text]').textContent = root.dataset.connection || 'Loading asset status…';
      fit();
    }
    displayWindow.addEventListener('resize', () => { root.dispatchEvent(new displayWindow.Event('asset-layout')); fit(); });
    timer = displayWindow.setInterval(tick, 1000); tick();
    displayWindow.addEventListener('pagehide', () => displayWindow.clearInterval(timer), { once: true });
  }
  const standalone = document.querySelector('[data-asset-display]');
  let root, popup = null, access, database, started = false, subscriptions = [];
  let data = { machines: [], liveJobs: [], defects: [] }, loaded = new Set(), cached = new Set(), failed = new Set();
  const scriptURL = document.currentScript.src;
  const cssURL = new URL('asset-status.css?v=20261117-hours', scriptURL).href;
  function paint(target, rows) {
    const stats = [
      [rows.length, 'Total assets', ''],
      [rows.filter(r => r.machine.outOfService).length, 'Out of service', 'danger'],
      [rows.reduce((s, r) => s + r.active.length, 0), 'Jobs in progress', 'blue'],
      [rows.reduce((s, r) => s + r.outstanding.length, 0), 'Outstanding jobs', 'warning'],
      [rows.reduce((s, r) => s + r.openDefects, 0), 'Open defects', 'warning']
    ];
    const wall = target.classList.contains('as-wall'), view = target.ownerDocument.defaultView;
    const twoColumns = wall && view.innerWidth >= 1250 && rows.length > 1;
    const half = Math.ceil(rows.length / 2);
    target.querySelector('[data-as-grid]').innerHTML = rows.length ? twoColumns ? table(rows.slice(0, half)) + table(rows.slice(half)) : table(rows) : '<div class="as-empty">' + (loaded.size === 3 ? 'No assets recorded.' : 'Loading all assets…') + '</div>';
    target.querySelector('[data-as-stats]').innerHTML = stats.map(([value, label, cls]) => '<div class="as-stat ' + cls + '"><strong>' + value + '</strong><span>' + label + '</span></div>').join('');
    target.querySelector('[data-as-count]').textContent = 'Showing all ' + rows.length + ' assets · No pagination';
    const live = loaded.size === 3 && !cached.size && !failed.size && navigator.onLine;
    target.dataset.live = String(live);
    target.dataset.connection = failed.size ? 'Updates unavailable for ' + [...failed].join(', ') + ' — showing last received data. Reopen Asset Status to retry.' : !navigator.onLine ? 'Offline — showing last received data' : loaded.size < 3 ? 'Loading assets, defects and jobs…' : cached.size ? 'Cached data — waiting for a live connection' : 'Live updates · All assets, defects and engineering jobs synced';
  }
  function render() {
    if (!root) return;
    if (!access()) { root.innerHTML = '<p>Back Office is locked.</p>';  return; }
    const rows = buildRows(data.machines, data.liveJobs, data.defects);
    paint(root, rows);
  }
  function popout() {
    if (!access()) return;
    popup = window.open('', 'checkplantAssetStatusDisplay', 'popup,width=1600,height=950,resizable=yes,scrollbars=yes');
    if (!popup) { root.querySelector('[data-as-message]').textContent = 'The pop-out was blocked. Allow pop-ups for CheckPlant, then try again.'; return; }
    const configuration = JSON.stringify(firebase.app().options).replace(/</g, '\\u003c');
    popup.document.open();
    popup.document.write('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Asset Status — CheckPlant</title><link rel="stylesheet" href="' + h(cssURL) + '"></head><body class="asset-display-body"><main class="asset-status as-wall" data-asset-display>' + shell(true) + '</main><script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"><\/script><script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"><\/script><script>firebase.initializeApp(' + configuration + ');<\/script><script src="' + h(scriptURL) + '"><\/script></body></html>');
    popup.document.close();
    popup.focus();
  }
  function startListeners() {
    if (started && !failed.size) return;
    subscriptions.forEach(stop => stop()); subscriptions = [];
    started = true; loaded.clear(); cached.clear(); failed.clear();
    Object.keys(data).forEach(name => subscriptions.push(database.collection(name).onSnapshot({ includeMetadataChanges: true }, snapshot => {
      data[name] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); loaded.add(name); failed.delete(name);
      if (snapshot.metadata.fromCache) cached.add(name); else cached.delete(name);
      render();
    }, () => { failed.add(name); render(); })));
  }
  if (standalone) {
    root = standalone; access = () => true; database = firebase.firestore();
    root.addEventListener('asset-layout', render);
    installDisplay(root, window);
    window.addEventListener('online', render); window.addEventListener('offline', render);
    startListeners(); render(); return;
  }
  window.AssetStatus = {
    open(options) {
      if (!options.canAccess()) return;
      access = options.canAccess; database = options.db;
      if (!root) {
        root = document.getElementById('assetStatusBoard'); root.classList.add('asset-status'); root.innerHTML = shell(false);
        root.querySelector('[data-as-popout]').addEventListener('click', popout);
        root.addEventListener('asset-layout', render);
        installDisplay(root, window);
        window.addEventListener('online', render); window.addEventListener('offline', render);
      }
      startListeners();
      render();
    }
  };
}());
