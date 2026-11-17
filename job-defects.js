/* Shared job/defect review for CostLog and ManagerDash. */
(function () {
  'use strict';
  const ids = row => Array.isArray(row.defectRefIds) ? [...new Set(row.defectRefIds.filter(Boolean))] : (row.defectRefId ? [row.defectRefId] : []);
  function jobsFrom(data) {
    const groups = [], byLive = new Map(), byRecord = new Map();
    const add = (collection, row, group) => {
      if (!group) { group = { refs: [], row, finished: collection !== 'liveJobs' || row.status === 'completed' }; groups.push(group); }
      group.refs.push({ collection, id: row.id, row });
      if (collection !== 'liveJobs') { group.finished = true; group.row = { ...group.row, ...row }; }
      return group;
    };
    data.liveJobs.filter(r => r.status !== 'cancelled').forEach(r => byLive.set(r.id, add('liveJobs', r)));
    data.records.filter(r => r.type === 'adhoc' || r.type === 'service').forEach(r => {
      const live = byLive.get(r.liveJobId) || groups.find(g => g.refs.some(x => x.collection === 'liveJobs' && x.row.jobId && x.row.jobId === r.recordId && x.row.machineId === r.machineId));
      byRecord.set(r.id, add('records', r, live));
    });
    data.costEntries.filter(r => r.workSource !== 'external').forEach(r => {
      const group = byRecord.get(r.linkedRecordId) || byLive.get(r.liveJobId);
      add('costEntries', r, group);
    });
    return groups.map(g => ({ ...g, key: g.refs[0].collection + '/' + g.refs[0].id, defectIds: [...new Set(g.refs.flatMap(x => ids(x.row)))] }));
  }
  async function persist(database, group, selected, firestore) {
    return database.runTransaction(async tx => {
      const snapshots = await Promise.all(group.refs.map(r => tx.get(database.collection(r.collection).doc(r.id))));
      if (snapshots.some(s => !s.exists)) throw Error('This job has changed. Close it and open it again.');
      const rows = snapshots.map(s => s.data());
      if (rows.some(r => r.machineId !== group.row.machineId)) throw Error('The job machine has changed. Open the job again.');
      if (JSON.stringify([...new Set(rows.flatMap(ids))].sort()) !== JSON.stringify([...group.defectIds].sort())) throw Error('Defect links were changed elsewhere. Close this job and open it again.');
      const defects = await Promise.all(selected.map(id => tx.get(database.collection('defects').doc(id))));
      if (defects.some(s => !s.exists || s.data().machineId !== group.row.machineId)) throw Error('Select only defects belonging to this machine.');
      const patch = { defectRefIds: selected, defectRefId: selected[0] || null, defectId: defects[0] ? defects[0].data().defectId || null : null, defectItemName: defects[0] ? defects[0].data().itemName || '' : '', defectLinksUpdatedAt: firestore.Timestamp.now() };
      group.refs.forEach(r => tx.update(database.collection(r.collection).doc(r.id), patch));
    });
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { ids, jobsFrom, persist }; return; }
  const panel = document.getElementById('jobDefectPanel');
  if (!panel) return;
  const data = { liveJobs: [], records: [], costEntries: [], defects: [] }, loaded = new Set(), failures = new Set();
  const database = firebase.firestore(), h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = document.getElementById('jdList'), message = document.getElementById('jdMessage');
  let groups = [], openGroup = null;
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'width:min(760px,94vw);max-height:90vh;overflow:auto;border:1px solid #ddd;border-radius:14px;padding:22px;color:#1c1f26';
  document.body.append(dialog);
  function render() {
    groups = jobsFrom(data);
    const query = document.getElementById('jdSearch').value.trim().toLowerCase(), status = document.getElementById('jdStatus').value;
    const visible = groups.filter(g => (status === 'all' || g.finished === (status === 'finished')) && [g.row.jobId, g.row.recordId, g.row.jobCardId, g.row.machineName, g.row.engineerName, g.row.technician, g.row.signName].join(' ').toLowerCase().includes(query));
    message.textContent = failures.size ? 'Could not load ' + [...failures].join(', ') + '. Check your connection and refresh.' : loaded.size < 4 ? 'Loading jobs…' : visible.length + ' jobs';
    list.innerHTML = visible.map(g => '<div style="padding:12px 0;border-bottom:1px solid #eee;display:flex;gap:12px;align-items:center;justify-content:space-between"><div><strong>' + h(g.row.jobCardId || g.row.recordId || g.row.jobId || g.row.id) + ' · ' + h(g.row.machineName || 'Asset') + '</strong><div>' + h(g.row.date || g.row.plannedDate || '') + ' · ' + h(g.finished ? 'Finished' : g.row.status || 'Unfinished') + ' · ' + g.defectIds.length + ' linked defect(s)</div></div><button class="btn btn-secondary btn-sm" data-job="' + h(g.key) + '" ' + (loaded.size < 4 || failures.size ? 'disabled' : '') + '>Open job / defects</button></div>').join('') || '<p>No matching jobs.</p>';
  }
  function open(group) {
    openGroup = group;
    const r = group.row, relevant = data.defects.filter(d => d.machineId === r.machineId), missing = group.defectIds.filter(id => !relevant.some(d => d.id === id));
    dialog.innerHTML = '<h2 style="margin-top:0">' + h(r.jobCardId || r.recordId || r.jobId || r.id) + '</h2><p><strong>' + h(r.machineName || 'Asset') + '</strong> · ' + h(group.finished ? 'Finished' : r.status || 'Unfinished') + '</p><p style="white-space:pre-wrap">' + h(r.jobDescription || '') + '</p><p style="white-space:pre-wrap">' + h(r.notes || r.finalNotes || 'No completion notes recorded.') + '</p><h3>Assign machine defects</h3><p>Select all defects related to this job. Saving links keeps the current job and defect statuses.</p><div id="jdChoices">' + (relevant.map(d => '<label style="display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid #eee;padding:12px 0;color:inherit;font-size:.9rem"><input style="width:auto;margin-top:3px" type="checkbox" value="' + h(d.id) + '" ' + (group.defectIds.includes(d.id) ? 'checked' : '') + '><span><strong>' + h(d.defectId || d.id) + '</strong> · ' + h(d.status || 'Unknown status') + ' · ' + h(d.dateRaised || '') + '<br>' + h(d.itemName || d.inspectionItemName || 'Defect') + '<br>' + h(d.lastObservedCondition || d.notes || '') + '</span></label>').join('') || '<p>No defects recorded for this machine.</p>') + missing.map(id => '<label><input style="width:auto" type="checkbox" value="' + h(id) + '" checked disabled> Unavailable defect: ' + h(id) + ' (link preserved)</label>').join('') + '</div><p id="jdSaveMessage" role="status"></p><div style="display:flex;gap:10px"><button class="btn btn-primary" id="jdSave" ' + (!r.machineId ? 'disabled' : '') + '>Save defect links</button><button class="btn btn-secondary" id="jdClose">Close</button></div>';
    document.getElementById('jdClose').onclick = () => dialog.close();
    document.getElementById('jdSave').onclick = async () => {
      const button = document.getElementById('jdSave'), feedback = document.getElementById('jdSaveMessage');
      button.disabled = true; feedback.textContent = 'Saving…';
      try {
        const selected = [...dialog.querySelectorAll('input:checked')].map(el => el.value);
        // Missing historical links must remain untouched until their defect can be loaded.
        if (missing.length) throw Error('Some linked defects are unavailable. Restore access to those defects before editing links.');
        await persist(database, openGroup, selected, firebase.firestore);
        feedback.textContent = 'Defect links saved.';
        openGroup = { ...openGroup, defectIds: selected };
      } catch (error) { feedback.textContent = 'Not saved: ' + error.message; }
      finally { button.disabled = false; }
    };
    dialog.showModal();
  }
  list.addEventListener('click', event => { const button = event.target.closest('[data-job]'); if (button) open(groups.find(g => g.key === button.dataset.job)); });
  document.getElementById('jdSearch').addEventListener('input', render);
  document.getElementById('jdStatus').addEventListener('change', render);
  ['liveJobs', 'records', 'costEntries', 'defects'].forEach(name => database.collection(name).onSnapshot(snapshot => {
    data[name] = snapshot.docs.map(d => ({ ...d.data(), id: d.id })); loaded.add(name); failures.delete(name); render();
  }, () => { failures.add(name); render(); }));
}());
