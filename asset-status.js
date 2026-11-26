/* Read-only asset display, launched from the existing Back Office PIN gate. */
(function () {
  'use strict';
  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reading = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  function serviceAlert(hours, next, last, invalid) {
    if (invalid || hours == null || hours === 999999 || next == null || next <= 0 || next === 999999 || (last != null && (last === 999999 || next <= last || hours < last))) return { state: 'invalid', label: 'Check hours' };
    // An order-of-magnitude mismatch is a suspected entry error (e.g. an extra zero),
    // not evidence of a genuinely overdue service. Preserve the saved readings.
    if (next >= 1000 && hours >= next * 10) return { state: 'invalid', field: 'current', label: 'Check hours: current reading is at least ten times the next-service reading' };
    const remaining = next - hours;
    if (remaining <= 0) return { state: 'overdue', label: remaining === 0 ? 'Service due now' : 'Service overdue by ' + Math.abs(remaining).toLocaleString('en-GB') + ' hours' };
    if (remaining <= 50) return { state: 'soon', label: 'Service due in ' + remaining.toLocaleString('en-GB') + ' hours' };
    return { state: 'ok', label: 'Next service due at ' + next.toLocaleString('en-GB') + ' hours' };
  }
  function buildRows(machines, liveJobs, services = []) {
    const jobs = new Map(), latestServices = new Map();
    function serviceDate(record) { return Date.parse(record.date || record.signDate || '') || noteTime(record.completedAt) || noteTime(record.createdAt); }
    services.forEach(record => {
      if (record.type !== 'service' || !record.machineId) return;
      const previous = latestServices.get(record.machineId);
      if (!previous || serviceDate(record) > serviceDate(previous) || (serviceDate(record) === serviceDate(previous) && noteTime(record.completedAt || record.createdAt) >= noteTime(previous.completedAt || previous.createdAt))) latestServices.set(record.machineId, record);
    });
    liveJobs.forEach(job => {
      if (!['active','paused','assigned','planned'].includes(job.status)) return;
      if (!jobs.has(job.machineId)) jobs.set(job.machineId, []);
      jobs.get(job.machineId).push(job);
    });
    return machines.map(machine => {
      const related = jobs.get(machine.id) || [], active = related.filter(j => j.status === 'active'), outstanding = related.filter(j => j.status !== 'active');
      const hours = reading(machine.currentHours), storedLast = reading(machine.lastServiceHours);
      const record = latestServices.get(machine.id), recordedLast = record ? reading(record.hoursReading) : null;
      const useRecord = recordedLast != null && recordedLast !== 999999;
      const lastService = useRecord ? recordedLast : storedLast;
      const suppliedNext = machine.nextServiceDueHours != null && String(machine.nextServiceDueHours).trim() !== '';
      const suppliedLast = machine.lastServiceHours != null && String(machine.lastServiceHours).trim() !== '';
      const nextServiceHours = useRecord ? recordedLast + 500 : suppliedNext ? reading(machine.nextServiceDueHours) : (lastService == null ? null : lastService + 500);
      const alert = serviceAlert(hours, nextServiceHours, lastService, !useRecord && ((suppliedNext && reading(machine.nextServiceDueHours) == null) || (suppliedLast && lastService == null)));
      return { machine, hours, nextServiceHours, serviceAlert: alert, active, outstanding,
        status: machine.outOfService ? 'Out of service' : 'In service',
        statusClass: machine.outOfService ? 'danger' : 'good' };
    }).sort((a, b) => String(a.machine.name || a.machine.id).localeCompare(String(b.machine.name || b.machine.id), 'en-GB', { numeric: true, sensitivity: 'base' }));
  }
  const jobStates = { active: 'In progress', paused: 'Paused', assigned: 'Assigned', planned: 'Planned' };
  function eligibleJobs(jobs) { return jobs.filter(job => Object.hasOwn(jobStates, job.status)); }
  function tvLayout(assetCount, jobCount, width, height, mode) {
    // Fire TV/Silk can report a 960px viewport even on a 1080p television.
    const font = width >= 1600 ? 18 : width >= 1100 ? 16 : 14;
    const jobColumns = width >= 900 ? 3 : 2;
    const available = Math.max(100, height - 145);
    const rowsPerColumn = Math.max(1, Math.floor(available / (font * 1.15 + 4)));
    const maxColumns = width >= 1600 ? 4 : width >= 780 ? 3 : 2;
    const columns = Math.min(maxColumns, Math.max(assetCount > 1 ? 2 : 1, Math.ceil(assetCount / rowsPerColumn)));
    return { columns, jobColumns, font };
  }
  function table(rows) {
    return '<div class="as-table-wrap"><table aria-label="Asset status list"><colgroup><col style="width:37%"><col style="width:21%"><col style="width:20%"><col style="width:22%"></colgroup><thead><tr><th>Asset</th><th>Status / jobs</th><th class="as-hours">Current hours</th><th class="as-hours">Next service hours</th></tr></thead><tbody>' + rows.map(row => {
      const m = row.machine;
      const jobSummary = [row.active.length ? row.active.length + ' active' : '', row.outstanding.length ? row.outstanding.length + ' outstanding' : ''].filter(Boolean).join(' · ');
      return '<tr class="as-service-' + row.serviceAlert.state + '" title="' + h(row.serviceAlert.label) + '"><td><span class="as-name" title="' + h(m.name) + '">' + h(m.name || 'Unnamed asset') + '</span><span class="as-sub">' + h(m.branch || 'No branch') + (m.serialNumber ? ' · ' + h(m.serialNumber) : '') + '</span></td><td><span class="as-badge ' + row.statusClass + '">' + h(row.status) + '</span>' + (jobSummary ? '<span class="as-sub">' + jobSummary + '</span>' : '') + '</td><td class="as-hours"><span class="as-hour-value">' + (row.serviceAlert.field === 'current' ? '<span class="as-check-hours">Check hours</span>' : row.hours == null ? '<span title="No current hours recorded">—</span>' : row.hours.toLocaleString('en-GB', { maximumFractionDigits: 1 })) + '</span></td><td class="as-hours"><span class="as-hour-value">' + (row.serviceAlert.state === 'invalid' && row.serviceAlert.field !== 'current' ? '<span class="as-check-hours" title="No service hours recorded or inconsistent meter readings">Check hours</span>' : row.nextServiceHours.toLocaleString('en-GB', { maximumFractionDigits: 1 })) + '</span></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function noteTime(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const ms = Date.parse(value); return Number.isFinite(ms) ? ms : 0;
  }
  function progressNotesHTML(job, expanded) {
    const notes = (Array.isArray(job.progressNotes) ? job.progressNotes : []).map((note,index) => ({ note: typeof note === 'string' ? {text:note} : note || {}, index })).filter(entry => String(entry.note.text || '').trim()).sort((a,b) => noteTime(b.note.at) - noteTime(a.note.at) || b.index - a.index);
    function entryHTML(entry) {
      const note = entry.note, time = noteTime(note.at);
      const stamp = time ? new Date(time).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      return '<div class="as-progress-entry"><div class="as-progress-text">' + h(note.text) + '</div><div class="as-progress-by">' + h([note.by || '', stamp].filter(Boolean).join(' · ')) + '</div></div>';
    }
    const key = String(job.id || job.jobId || '');
    return '<section class="as-progress"><h4>Progress notes</h4>' + (notes.length ? notes.slice(0,2).map(entryHTML).join('') + (notes.length > 2 ? '<details class="as-note-history" data-note-history="' + h(key) + '" ' + (expanded.has(key) ? 'open' : '') + '><summary>Earlier notes (' + (notes.length - 2) + ')</summary>' + notes.slice(2).map(entryHTML).join('') + '</details>' : '') : '<div class="as-no-progress">No progress notes recorded yet.</div>') + '</section>';
  }
  function orderedPartsHTML(job, parts) {
    const related = parts.filter(p => p.jobDocId === job.id && p.requestType !== 'service_kit_replenishment' && p.requestType !== 'consumables_tools' && ['ordered','received','requested'].includes(p.status));
    if (!related.length) return '';
    const rank = {ordered:0,requested:1,received:2};
    const labels = {ordered:'On order',requested:'Requested — awaiting order',received:'Received'};
    related.sort((a,b)=>rank[a.status]-rank[b.status]||String(a.partName||'').localeCompare(String(b.partName||'')));
    return '<section class="as-parts"><h4>Parts required / ordered</h4>' + related.flatMap(p=>(Array.isArray(p.lines)&&p.lines.length?p.lines:[p]).map(l=>({...p,...l,status:p.status}))).map(p=>'<div class="as-part-row"><span class="as-part-name">'+h(p.partName||'Part')+(Number(p.quantity)>0?' × '+h(p.quantity):'')+(p.partNumber?' <small>('+h(p.partNumber)+')</small>':'')+'</span><span class="as-part-status as-part-'+p.status+'">'+labels[p.status]+'</span></div>').join('')+'</section>';
  }
  function jobList(rows, jobs, expanded = new Set(), parts = []) {
    const machines = new Map(rows.map(row => [row.machine.id, row.machine]));
    const priority = { active: 0, paused: 1, assigned: 2, planned: 3 };
    return eligibleJobs(jobs).slice().sort((a,b) => priority[a.status] - priority[b.status] || String(a.machineName || '').localeCompare(String(b.machineName || ''), 'en-GB', { numeric: true })).map(job => {
      const machine = machines.get(job.machineId);
      const description = job.jobDescription || job.jobCategory || (job.jobType === 'service' ? 'Service' : 'Engineering job');
      const external = job.externalWork === true || job.jobType === 'external' || job.assignmentType === 'external';
      const externalBadge = external ? '<span class="as-badge" style="background:#6d28d9;color:#fff;margin-left:6px">EXTERNAL</span>' : '';
      const externalLocation = external && job.externalLocation ? '<div class="as-job-meta"><strong>Location:</strong> ' + h(job.externalLocation) + '</div>' : '';
      return '<article class="as-job ' + (job.status === 'active' ? 'active' : 'waiting') + '"><div class="as-job-head"><strong>' + h(machine ? machine.name : job.machineName || 'Unassigned asset') + '</strong>' + externalBadge + '<span class="as-badge ' + (job.status === 'active' ? 'blue' : 'warning') + '">' + jobStates[job.status] + '</span></div><div class="as-job-title" title="' + h(description) + '">' + h(description) + '</div>' + externalLocation + '<div class="as-job-meta">' + h([job.jobId || job.id, job.jobCategory || '', job.engineerName || 'Unassigned engineer', job.plannedDate || job.date || ''].filter(Boolean).join(' · ')) + '</div>' + ((job.notes || job.finalNotes) ? '<div class="as-work-notes"><h4>Work notes</h4>' + h(job.finalNotes || job.notes) + '</div>' : '') + orderedPartsHTML(job, parts) + progressNotesHTML(job, expanded) + '</article>';
    }).join('') || '<div class="as-empty">No current or outstanding jobs.</div>';
  }
  function shell(popout) {
    return '<div class="as-canvas" data-as-canvas><div class="as-head"><div><div class="as-eyebrow">CheckPlant / KCM Waste Management</div><h2>Asset Status</h2></div><div class="as-clock"><strong data-as-time>--:--:--</strong><span data-as-date></span></div></div><div class="as-controls"><button type="button" data-as-mode="assets" aria-pressed="true">Assets</button><button type="button" data-as-mode="jobs" aria-pressed="false">Jobs</button><button type="button" data-as-fullscreen>Full screen</button>' + (popout ? '' : '<button type="button" data-as-popout>Pop out to another screen</button>') + '</div><p class="as-message" data-as-message role="status"></p><div class="as-stats" data-as-stats></div><div class="as-sync" data-as-sync data-state="warning" role="status"><span class="as-dot"></span><span data-as-sync-text>Loading asset status…</span></div><div class="as-content"><section class="as-assets-panel"><h3>All assets</h3><div class="as-grid" data-as-grid><div class="as-empty">Loading all assets…</div></div></section><aside class="as-jobs-panel"><h3>Current &amp; outstanding jobs</h3><div data-as-jobs></div></aside></div><div class="as-footer"><span data-as-count>All assets</span><span>Live jobs: in progress, paused, assigned and planned · Amber: due within 50 hours · Red: due / overdue · Check hours: invalid reading</span></div></div>';
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { buildRows, table, shell, jobList, eligibleJobs, tvLayout, serviceAlert }; return; }
  function installDisplay(root, displayWindow) {
    let timer, lastFitKey = '';
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
    root.addEventListener('toggle', () => { lastFitKey = ''; fit(); }, true);
    function fit() {
      function fitHourValues() {
        root.querySelectorAll('.as-hour-value').forEach(value => {
          value.style.fontSize = '';
          if (!value.clientWidth || value.scrollWidth <= value.clientWidth) return;
          const base = parseFloat(displayWindow.getComputedStyle(value).fontSize);
          const size = Math.floor(base * value.clientWidth / value.scrollWidth * 10) / 10;
          if (size > 0) value.style.fontSize = size + 'px';
        });
      }
      const canvas = root.querySelector('[data-as-canvas]');
      if (!canvas || !canvas.style) return;
      if (!root.classList.contains('as-wall')) { canvas.style.removeProperty('width'); canvas.style.removeProperty('transform'); root.style.removeProperty('height'); lastFitKey = ''; fitHourValues(); return; }
      root.style.height = displayWindow.innerHeight + 'px';
      const width = Math.max(1, root.clientWidth * .95), height = Math.max(1, displayWindow.innerHeight * .95);
      const key = [width, height, root.dataset.mode, root.dataset.layoutRevision].join('|');
      if (key === lastFitKey) return;
      canvas.style.transform = 'none';
      function measure(scale) {
        canvas.style.width = (width / scale) + 'px';
        return canvas.scrollHeight * scale;
      }
      let scale = 1;
      if (measure(1) > height) {
        let low = .01, high = 1;
        // Find the largest readable scale that fits, while preserving the full screen width.
        for (let pass = 0; pass < 12; pass++) {
          const middle = (low + high) / 2;
          if (measure(middle) <= height) low = middle; else high = middle;
        }
        scale = low;
      }
      canvas.style.width = (width / scale) + 'px';
      fitHourValues();
      canvas.style.transform = 'scale(' + scale + ')';
      lastFitKey = key;
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
  let data = { machines: [], liveJobs: [], services: [], partRequests: [] }, loaded = new Set(), cached = new Set(), failed = new Set();
  const scriptURL = document.currentScript.src;
  const cssURL = new URL('asset-status.css?v=20261125-parts-status', scriptURL).href;
  function paint(target, rows) {
    target.dataset.layoutRevision = String((Number(target.dataset.layoutRevision) || 0) + 1);
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
    target.querySelector('[data-as-jobs]').style.columnCount = String(wall ? plan.jobColumns : 2);
    const size = Math.ceil(rows.length / columns), tables = [];
    for (let start = 0; start < rows.length; start += size) tables.push(table(rows.slice(start, start + size)));
    grid.innerHTML = rows.length ? tables.join('') : '<div class="as-empty">' + (loaded.size === Object.keys(data).length ? 'No assets recorded.' : 'Loading all assets…') + '</div>';
    const expandedNotes = new Set(Array.from(target.querySelectorAll('[data-note-history][open]')).map(detail => detail.getAttribute('data-note-history')));
    target.querySelector('[data-as-jobs]').innerHTML = jobList(rows, data.liveJobs, expandedNotes, data.partRequests);
    target.querySelector('[data-as-count]').textContent = 'Showing all ' + rows.length + ' assets · No pagination';
    const live = loaded.size === Object.keys(data).length && !cached.size && !failed.size && navigator.onLine;
    target.dataset.live = String(live);
    target.dataset.connection = failed.size ? 'Updates unavailable for ' + [...failed].join(', ') + ' — showing last received data. Reopen Asset Status to retry.' : !navigator.onLine ? 'Offline — showing last received data' : loaded.size < Object.keys(data).length ? 'Loading assets, jobs, parts and service history…' : cached.size ? 'Cached data — waiting for a live connection' : 'Live updates · Assets, jobs, parts and service history synced';
  }
  function render() {
    if (!root) return;
    if (!access()) { root.innerHTML = '<p>Back Office is locked.</p>';  return; }
    const rows = buildRows(data.machines, data.liveJobs, data.services);
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
    Object.keys(data).forEach(name => {
      const query = name === 'services' ? database.collection('records').where('type', '==', 'service') : database.collection(name);
      subscriptions.push(query.onSnapshot({ includeMetadataChanges: true }, snapshot => {
      data[name] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); loaded.add(name); failed.delete(name);
      if (snapshot.metadata.fromCache) cached.add(name); else cached.delete(name);
      render();
    }, () => { failed.add(name); render(); }));
    });
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
