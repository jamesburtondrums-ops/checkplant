/* Read-only asset display, launched from the existing Back Office PIN gate. */
(function () {
  'use strict';
  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reading = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  function buildRows(machines, liveJobs) {
    const jobs = new Map();
    liveJobs.forEach(job => {
      if (!['active','paused','assigned','planned'].includes(job.status)) return;
      if (!jobs.has(job.machineId)) jobs.set(job.machineId, []);
      jobs.get(job.machineId).push(job);
    });
    return machines.map(machine => {
      const related = jobs.get(machine.id) || [], active = related.filter(j => j.status === 'active'), outstanding = related.filter(j => j.status !== 'active');
      const hours = reading(machine.currentHours), lastService = reading(machine.lastServiceHours);
      const nextServiceHours = reading(machine.nextServiceDueHours) ?? (lastService == null ? null : lastService + 500);
      return { machine, hours, nextServiceHours, active, outstanding,
        status: machine.outOfService ? 'Out of service' : 'In service',
        statusClass: machine.outOfService ? 'danger' : 'good' };
    }).sort((a, b) => String(a.machine.name || a.machine.id).localeCompare(String(b.machine.name || b.machine.id), 'en-GB', { numeric: true, sensitivity: 'base' }));
  }
  const jobStates = { active: 'In progress', paused: 'Paused', assigned: 'Assigned', planned: 'Planned' };
  function eligibleJobs(jobs) { return jobs.filter(job => Object.hasOwn(jobStates, job.status)); }
  function tvLayout(assetCount, jobCount, width, height, mode) {
    // Fire TV/Silk can report a 960px viewport even on a 1080p television.
    const font = width >= 1600 ? 18 : width >= 1100 ? 16 : 14;
    const jobColumns = width >= 1600 ? 3 : 2;
    const available = Math.max(100, height - 145);
    const rowsPerColumn = Math.max(1, Math.floor(available / (font * 1.15 + 4)));
    const maxColumns = width >= 1600 ? 4 : width >= 780 ? 3 : 2;
    const columns = Math.min(maxColumns, Math.max(assetCount > 1 ? 2 : 1, Math.ceil(assetCount / rowsPerColumn)));
    return { columns, jobColumns, font };
  }
  function table(rows) {
    return '<div class="as-table-wrap"><table aria-label="Asset status list"><colgroup><col style="width:39%"><col style="width:25%"><col style="width:17%"><col style="width:19%"></colgroup><thead><tr><th>Asset</th><th>Status / jobs</th><th class="as-hours">Current hours</th><th class="as-hours">Next service hours</th></tr></thead><tbody>' + rows.map(row => {
      const m = row.machine;
      const jobSummary = [row.active.length ? row.active.length + ' active' : '', row.outstanding.length ? row.outstanding.length + ' outstanding' : ''].filter(Boolean).join(' · ');
      return '<tr><td><span class="as-name" title="' + h(m.name) + '">' + h(m.name || 'Unnamed asset') + '</span><span class="as-sub">' + h(m.branch || 'No branch') + (m.serialNumber ? ' · ' + h(m.serialNumber) : '') + '</span></td><td><span class="as-badge ' + row.statusClass + '">' + h(row.status) + '</span>' + (jobSummary ? '<span class="as-sub">' + jobSummary + '</span>' : '') + '</td><td class="as-hours">' + (row.hours == null ? '<span title="No current hours recorded">—</span>' : row.hours.toLocaleString('en-GB', { maximumFractionDigits: 1 })) + '</td><td class="as-hours">' + (row.nextServiceHours == null ? '<span title="No service hours recorded">—</span>' : row.nextServiceHours.toLocaleString('en-GB', { maximumFractionDigits: 1 })) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function jobList(rows, jobs) {
    const machines = new Map(rows.map(row => [row.machine.id, row.machine]));
    const priority = { active: 0, paused: 1, assigned: 2, planned: 3 };
    return eligibleJobs(jobs).slice().sort((a,b) => priority[a.status] - priority[b.status] || String(a.machineName || '').localeCompare(String(b.machineName || ''), 'en-GB', { numeric: true })).map(job => {
      const machine = machines.get(job.machineId);
      const description = job.jobDescription || job.jobCategory || (job.jobType === 'service' ? 'Service' : 'Engineering job');
      return '<article class="as-job ' + (job.status === 'active' ? 'active' : 'waiting') + '"><div class="as-job-head"><strong>' + h(machine ? machine.name : job.machineName || 'Unassigned asset') + '</strong><span class="as-badge ' + (job.status === 'active' ? 'blue' : 'warning') + '">' + jobStates[job.status] + '</span></div><div class="as-job-title" title="' + h(description) + '">' + h(description) + '</div><div class="as-job-meta">' + h([job.jobId || job.id, job.engineerName || 'Unassigned engineer', job.plannedDate || ''].filter(Boolean).join(' · ')) + '</div></article>';
    }).join('') || '<div class="as-empty">No current or outstanding jobs.</div>';
  }
  function shell(popout) {
    return '<div class="as-canvas" data-as-canvas><div class="as-head"><div><div class="as-eyebrow">CheckPlant / KCM Waste Management</div><h2>Asset Status</h2></div><div class="as-clock"><strong data-as-time>--:--:--</strong><span data-as-date></span></div></div><div class="as-controls"><button type="button" data-as-mode="assets" aria-pressed="true">Assets</button><button type="button" data-as-mode="jobs" aria-pressed="false">Jobs</button><button type="button" data-as-fullscreen>Full screen</button>' + (popout ? '' : '<button type="button" data-as-popout>Pop out to another screen</button>') + '</div><p class="as-message" data-as-message role="status"></p><div class="as-stats" data-as-stats></div><div class="as-sync" data-as-sync data-state="warning" role="status"><span class="as-dot"></span><span data-as-sync-text>Loading asset status…</span></div><div class="as-content"><section class="as-assets-panel"><h3>All assets</h3><div class="as-grid" data-as-grid><div class="as-empty">Loading all assets…</div></div></section><aside class="as-jobs-panel"><h3>Current &amp; outstanding jobs</h3><div data-as-jobs></div></aside></div><div class="as-footer"><span data-as-count>All assets</span><span>Live jobs: in progress, paused, assigned and planned · Next service = due meter reading</span></div></div>';
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { buildRows, table, shell, jobList, eligibleJobs, tvLayout }; return; }
  function installDisplay(root, displayWindow) {
    let timer;
    const full = root.querySelector('[data-as-fullscreen]');
    let mode = 'assets';
    try { if (displayWindow.localStorage.getItem('checkplantAssetDisplayMode') === 'jobs') mode = 'jobs'; } catch (_) {}
    root.dataset.mode = mode;
    function setMode(next) {
      root.dataset.mode = next;
      root.querySelectorAll('[data-as-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.asMode === next)));
      try { displayWindow.localStorage.setItem('checkplantAssetDisplayMode', next); } catch (_) {}
      root.dispatchEvent(new displayWindow.Event('asset-layout')); fit();
    }
    root.querySelectorAll('[data-as-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.asMode === mode));
      button.addEventListener('click', () => setMode(button.dataset.asMode));
    });
    full.addEventListener('click', async () => {
      try {
        if (displayWindow.document.fullscreenElement) await displayWindow.document.exitFullscreen();
        else if (root.requestFullscreen && displayWindow.document.fullscreenEnabled !== false) await root.requestFullscreen();
        else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
        else { root.classList.add('as-wall');root.dataset.wallDisplay='true';root.dispatchEvent(new displayWindow.Event('asset-layout'));root.querySelector('[data-as-message]').textContent='TV layout is already fitted to this screen. Browser full screen is optional.'; }
      } catch (error) { root.querySelector('[data-as-message]').textContent = error.message; }
    });
    const onFullscreen = () => {
      const isFull = displayWindow.document.fullscreenElement === root;
      root.classList.toggle('as-wall', isFull || root.hasAttribute('data-asset-display') || root.dataset.wallDisplay === 'true');
      full.textContent = isFull ? 'Exit full screen' : 'Full screen';
      root.dispatchEvent(new displayWindow.Event('asset-layout'));
      fit();
    };
    displayWindow.document.addEventListener('fullscreenchange', onFullscreen);
    root.addEventListener('asset-painted', fit);
    function fit() {
      const canvas = root.querySelector('[data-as-canvas]');
      if (!canvas || !canvas.style) return;
      if (!root.classList.contains('as-wall')) { canvas.style.removeProperty('width'); canvas.style.removeProperty('transform'); root.style.removeProperty('height'); return; }
      root.style.height = displayWindow.innerHeight + 'px';
      const width = Math.max(1, root.clientWidth * .95), height = Math.max(1, displayWindow.innerHeight * .95);
      // Keep the real viewport width: expanding it before scaling made Silk render tiny text.
      canvas.style.width = width + 'px';
      canvas.style.transform = 'none';
      const scale = Math.min(1, height / Math.max(1, canvas.scrollHeight));
      canvas.style.transform = 'scale(' + scale + ')';
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
  let data = { machines: [], liveJobs: [] }, loaded = new Set(), cached = new Set(), failed = new Set();
  const scriptURL = document.currentScript.src;
  const cssURL = new URL('asset-status.css?v=20261119-firetv', scriptURL).href;
  function paint(target, rows) {
    const stats = [
      [rows.length, 'Total assets', ''],
      [rows.filter(r => r.machine.outOfService).length, 'Out of service', 'danger'],
      [eligibleJobs(data.liveJobs).filter(j=>j.status==='active').length, 'Jobs in progress', 'blue'],
      [eligibleJobs(data.liveJobs).filter(j=>j.status!=='active').length, 'Outstanding jobs', 'warning']
    ];
    const wall = target.classList.contains('as-wall'), view = target.ownerDocument.defaultView;
    const plan = tvLayout(rows.length, eligibleJobs(data.liveJobs).length, view.innerWidth, view.innerHeight, target.dataset.mode);
    const columns = wall ? plan.columns : 1;
    const grid = target.querySelector('[data-as-grid]');
    grid.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0, 1fr))';
    target.style.setProperty('--as-tv-font', plan.font + 'px');
    target.querySelector('[data-as-jobs]').style.gridTemplateColumns = wall ? 'repeat(' + plan.jobColumns + ', minmax(0, 1fr))' : '';
    const size = Math.ceil(rows.length / columns), tables = [];
    for (let start = 0; start < rows.length; start += size) tables.push(table(rows.slice(start, start + size)));
    grid.innerHTML = rows.length ? tables.join('') : '<div class="as-empty">' + (loaded.size === 2 ? 'No assets recorded.' : 'Loading all assets…') + '</div>';
    target.querySelector('[data-as-jobs]').innerHTML = jobList(rows, data.liveJobs);
    target.querySelector('[data-as-count]').textContent = 'Showing all ' + rows.length + ' assets · No pagination';
    const live = loaded.size === 2 && !cached.size && !failed.size && navigator.onLine;
    target.dataset.live = String(live);
    target.dataset.connection = failed.size ? 'Updates unavailable for ' + [...failed].join(', ') + ' — showing last received data. Reopen Asset Status to retry.' : !navigator.onLine ? 'Offline — showing last received data' : loaded.size < 2 ? 'Loading assets and engineering jobs…' : cached.size ? 'Cached data — waiting for a live connection' : 'Live updates · All assets and engineering jobs synced';
  }
  function render() {
    if (!root) return;
    if (!access()) { root.innerHTML = '<p>Back Office is locked.</p>';  return; }
    const rows = buildRows(data.machines, data.liveJobs);
    paint(root, rows); root.dispatchEvent(new Event('asset-painted'));
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
        root = document.getElementById('assetStatusBoard'); root.classList.add('asset-status'); if(options.wall){root.classList.add('as-wall');root.dataset.wallDisplay='true';} root.innerHTML = shell(!!options.wall);
        if(!options.wall)root.querySelector('[data-as-popout]').addEventListener('click', popout);
        root.addEventListener('asset-layout', render);
        installDisplay(root, window);
        window.addEventListener('online', render); window.addEventListener('offline', render);
      }
      startListeners();
      render();
    }
  };
}());
