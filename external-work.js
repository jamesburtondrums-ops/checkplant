/* External workshop assignments: uses the existing Back Office gate and liveJobs collection. */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function refreshExternalWorkForm() {
    const select = el('externalWorkMachine');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Select asset...</option>' + (Array.isArray(machines) ? machines : []).slice().sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'en-GB', {numeric:true})).map(m => '<option value="' + esc(m.id) + '">' + esc(m.name || m.id) + '</option>').join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }
  async function assignExternalWork(event) {
    event.preventDefault();
    if (!backOfficeUnlocked) { toast('Back Office sign-in required'); return; }
    const id = el('externalWorkMachine').value;
    const location = el('externalWorkLocation').value.trim();
    const description = el('externalWorkDescription').value.trim();
    const contractor = el('externalWorkContractor').value.trim();
    const date = el('externalWorkDate').value;
    const m = machines.find(machine => machine.id === id);
    if (!m || !location || !description) { toast('Select an asset and enter the external location and work description'); return; }
    const button = el('externalWorkSubmit');
    button.disabled = true;
    try {
      const jobId = 'EXT-' + Date.now().toString(36).toUpperCase();
      await db.collection('liveJobs').add({
        jobId, jobType:'external', assignmentType:'external', externalWork:true,
        source:'manager_external', status:'assigned',
        machineId:m.id, machineName:m.name || '', serialNumber:m.serialNumber || '',
        branch:m.branch || '', jobCategory:'External work', jobDescription:description,
        externalLocation:location, externalContractor:contractor,
        engineerName:contractor || 'External contractor', engineerId:'',
        plannedDate:date || '', date:date || new Date().toISOString().slice(0,10),
        progressNotes:[], createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      el('externalWorkDescription').value='';
      el('externalWorkLocation').value='';
      el('externalWorkContractor').value='';
      el('externalWorkMachine').value='';
      toast('External work assigned: ' + jobId);
    } catch (error) {
      console.error('External work assignment failed', error);
      toast('Unable to save external work: ' + (error.message || 'Unknown error'));
    } finally { button.disabled = false; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const form = el('externalWorkForm');
    if (!form) return;
    form.addEventListener('submit', assignExternalWork);
    el('externalWorkDate').value = new Date().toISOString().slice(0,10);
    refreshExternalWorkForm();
    db.collection('machines').onSnapshot(refreshExternalWorkForm, err => console.error('External work asset picker:', err));
  });
})();
