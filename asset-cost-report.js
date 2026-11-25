'use strict';

const assetCostReport = (() => {
  const dayMs = 86400000;
  const chartLimit = 10;
  const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' });
  const londonDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' });
  const sterling = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const decimals = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const cash = pennies => sterling.format(pennies / 100);
  const hours = value => decimals.format(value) + ' h';
  const byId = id => document.getElementById(id);
  const state = { machines: 'loading', costs: 'loading', history: 'loading', records: 'loading' };
  let history = [];
  let listening = false;
  let report;

  function today() {
    return londonDate.format(new Date());
  }

  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const parsed = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
      ? parsed / dayMs
      : NaN;
  }

  function number(value) {
    if (typeof value === 'number' || (typeof value === 'string' && value.trim())) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  function downtimeDays(intervals) {
    let total = 0;
    let previousEnd = -Infinity;
    intervals.sort((a, b) => a[0] - b[0]);
    for (const [start, end] of intervals) {
      total += Math.max(0, end - Math.max(start, previousEnd));
      previousEnd = Math.max(end, previousEnd);
    }
    return total;
  }

  function completionDate(record) {
    const timestamp = record.completedAt?.toDate?.() ?? record.completedAt;
    const completed = timestamp == null ? NaN : new Date(timestamp).getTime();
    return Number.isFinite(completed) ? londonDate.format(completed) : record.date;
  }

  function partsSummary(entry) {
    const lines = Array.isArray(entry.parts) ? entry.parts.filter(part => part?.name).map(part => {
      const price = number(part.price);
      return part.name + (price ? ' (' + cash(Math.round(price * 100)) + ')' : '');
    }) : [];
    if (lines.length) return lines.join(', ');
    if (entry.partsDesc?.trim()) return entry.partsDesc.trim();
    if (number(entry.partsCost)) return 'Parts cost recorded (' + cash(Math.round(entry.partsCost * 100)) + '), names unavailable';
    return 'No parts recorded';
  }

  function build(assets, entries, register, completedRecords, { from, to, asOf }) {
    const first = from ? day(from) : -Infinity;
    const afterLast = to ? day(to) + 1 : Infinity;
    const tomorrow = day(asOf) + 1;
    const rows = new Map();
    const names = new Map();

    function addRow(key, name, branch) {
      if (!rows.has(key)) {
        rows.set(key, { key, name, branch, spend: 0, loggedHours: 0, missing: 0,
          pending: 0, entries: 0, intervals: [], jobs: [] });
      }
      return rows.get(key);
    }

    function nameKey(name) {
      return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    for (const asset of assets) {
      const row = addRow('id:' + asset.id, asset.name || asset.id, asset.branch || '');
      const key = nameKey(asset.name);
      if (key) {
        if (!names.has(key)) names.set(key, []);
        names.get(key).push(row);
      }
    }

    function findRow(id, name, branch) {
      if (id) return addRow('id:' + id, name || id, branch || '');
      const key = nameKey(name);
      const matches = names.get(key) || [];
      const atBranch = branch ? matches.filter(row => nameKey(row.branch) === nameKey(branch)) : matches;
      if (atBranch.length === 1) return atBranch[0];
      return addRow('name:' + JSON.stringify([key, nameKey(branch)]),
        name ? name + ' (unmatched)' : 'Unassigned asset', branch || '');
    }

    const inRange = value => {
      const date = day(value);
      return Number.isFinite(date) && date >= first && date < afterLast;
    };
    const internalEntries = entries.filter(entry => entry.workSource !== 'external');
    const byCostId = new Map(internalEntries.filter(entry => entry.id).map(entry => [entry.id, entry]));
    const jobKeys = (recordId, liveJobId, machineId, reference) => [
      recordId && 'record:' + recordId,
      liveJobId && 'live:' + liveJobId,
      machineId && reference && 'reference:' + JSON.stringify([machineId, reference]),
    ].filter(Boolean);
    const entryKeys = entry => jobKeys(entry.linkedRecordId, entry.liveJobId, entry.machineId, entry.jobCardId);
    const primaryCosts = new Map();
    for (const entry of internalEntries) {
      for (const key of entryKeys(entry)) {
        const previous = primaryCosts.get(key);
        if (!previous || (entry.costStatus === 'fully_signed_off' && previous.costStatus !== 'fully_signed_off')) {
          primaryCosts.set(key, entry);
        }
      }
    }

    function addJob(row, date, record, entry) {
      if (!inRange(date)) return;
      const type = { service: 'Service', defect: 'Defect resolution', adhoc: 'Ad-hoc job' }[record?.type];
      const title = record?.jobCategory || type || entry.workType || 'Maintenance';
      row.jobs.push({
        date,
        title: title.charAt(0).toUpperCase() + title.slice(1),
        reference: record?.recordId || entry.jobCardId || '',
        person: record?.technician || record?.signName || '',
        outcome: record?.outcome || (record?.type === 'defect' ? 'Resolved' : ''),
        description: record?.jobDescription || '',
        work: record?.notes?.trim() || entry.notes?.trim() || '',
        parts: partsSummary(entry),
        manual: !record && entryKeys(entry).length === 0,
      });
    }

    const completedKeys = new Set();
    const attachedEntries = new Set();
    for (const record of completedRecords) {
      if (!['service', 'adhoc', 'defect'].includes(record.type)) continue;
      const keys = jobKeys(record.id, record.liveJobId, record.machineId, record.recordId);
      keys.forEach(key => completedKeys.add(key));
      const entry = byCostId.get(record.costEntryId) || keys.map(key => primaryCosts.get(key)).find(Boolean);
      if (entry) attachedEntries.add(entry);
      const asset = entry || {};
      const date = completionDate(record);
      if (!inRange(date)) continue;
      const row = findRow(record.machineId || asset.machineId, record.machineName || asset.machineName, record.branch || asset.branch);
      addJob(row, date, record, asset);
    }

    for (const entry of internalEntries) {
      if (!inRange(entry.date)) continue;
      const row = findRow(entry.machineId, entry.machineName, entry.branch);
      if (!attachedEntries.has(entry) && !entryKeys(entry).some(key => completedKeys.has(key))) {
        addJob(row, entry.date, null, entry);
      }
      const duration = costEntryDowntime(entry);
      row.entries++;
      if (duration === null) row.missing++;
      else row.loggedHours += duration;

      if (entry.costStatus === 'hours_authorised') {
        row.pending++;
      } else {
        const amount = number(entry.totalCost) ?? (
          (number(entry.labourCost) ?? (number(entry.labourHours) || 0) * (number(entry.labourRate) || 0)) +
          (number(entry.partsCost) ?? 0) + (number(entry.otherCost) ?? 0));
        row.spend += Math.round(amount * 100);
      }
    }

    function addInterval(id, name, branch, raised, end) {
      const start = Math.max(day(raised), first);
      const stop = Math.min(end, afterLast, tomorrow);
      if (start < stop) findRow(id, name, branch).intervals.push([start, stop]);
    }

    for (const record of register) {
      addInterval(record.machineId, record.machineName, record.branch, record.raisedDate,
        day(record.clearedDate));
    }
    for (const asset of assets) {
      if (asset.outOfService) {
        addInterval(asset.id, asset.name, asset.branch, asset.outOfServiceSince, tomorrow);
      }
    }

    return [...rows.values()].map(row => ({
      ...row, days: downtimeDays(row.intervals),
      jobs: row.jobs.sort((a, b) => b.date.localeCompare(a.date) || a.reference.localeCompare(b.reference))
    }))
      .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name, 'en', { numeric: true }));
  }

  function chartRows(rows, metric) {
    return rows.filter(row => row[metric] !== 0)
      .sort((a, b) => Math.abs(b[metric]) - Math.abs(a[metric])).slice(0, chartLimit);
  }

  function chart(name, rows, metric, format, cssClass) {
    const leaders = chartRows(rows, metric);
    const max = Math.max(1, ...leaders.map(row => Math.abs(row[metric])));
    const body = leaders.map(row => `<div class="asset-report-bar-row">
      <span>${escapeHtml(row.name)}${row.branch ? ' · ' + escapeHtml(row.branch) : ''}</span>
      <svg class="${cssClass}" aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none">
        <rect width="${100 * Math.abs(row[metric]) / max}" height="8" rx="1"></rect>
      </svg>
      <strong>${format(row[metric])}</strong>
    </div>`).join('');
    return `<section><h2>${name}</h2>${body || '<p class="progress-note">No recorded values in this period.</p>'}</section>`;
  }

  function displayDate(iso) {
    return dateLabel.format(new Date(day(iso) * dayMs));
  }

  function status(message) {
    byId('assetCostStatus').textContent = message;
    byId('assetCostPrint').disabled = !report;
    byId('assetCostJobs').disabled = !report;
    byId('assetCostPdf').disabled = !report;
    byId('assetCostResults').hidden = !report;
  }

  function render() {
    if (!document.body.classList.contains('asset-cost-report-open')) return;
    report = null;
    if (state.machines === 'error' || state.costs === 'error') {
      return status('Could not load the asset register or cost entries. Refresh the page to try again.');
    }
    if (Object.values(state).includes('loading')) return status('Loading asset, cost and downtime records…');

    const from = byId('assetCostFrom').value;
    const to = byId('assetCostTo').value;
    if (byId('assetCostFrom').validity.badInput || byId('assetCostTo').validity.badInput ||
        (from && to && from > to)) {
      return status('Enter a valid date range with the start date on or before the end date.');
    }

    const asOf = today();
    const rows = build(machines, costEntries, history, state.records === 'ready' ? records : [], { from, to, asOf });
    const select = byId('assetCostAsset');
    const selected = select.value;
    select.replaceChildren(new Option('All assets', ''), ...[...rows]
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
      .map(row => new Option(row.name + (row.branch ? ' · ' + row.branch : ''), row.key)));
    select.value = rows.some(row => row.key === selected) ? selected : '';
    const visible = select.value ? rows.filter(row => row.key === select.value) : rows;
    const external = costEntries.filter(entry => entry.workSource === 'external' &&
      Number.isFinite(day(entry.date)) && (!from || entry.date >= from) && (!to || entry.date <= to) &&
      (!select.value || (entry.machineId && select.value === 'id:' + entry.machineId)))
      .sort((a, b) => b.date.localeCompare(a.date));
    const externalSpend = external.reduce((sum, entry) => sum + entryCostPence(entry), 0);
    const charges = external.map(customerChargePence).filter(amount => amount !== null);
    const externalCharges = charges.length ? cash(charges.reduce((sum, amount) => sum + amount, 0)) : '—';
    const externalColumns = ['Date', 'Job / Customer', 'Equipment', 'Cost to KCM', 'Customer charge'];
    const externalRows = external.map(entry => {
      const charge = customerChargePence(entry);
      return [
        displayDate(entry.date),
        [entry.externalJobRef || entry.jobCardId, entry.customerName].filter(Boolean).join(' · ') || '—',
        entry.externalMachineDescription || entry.machineName || '—',
        cash(entryCostPence(entry)),
        charge === null ? '—' : cash(charge),
      ];
    });
    const totals = { spend: 0, loggedHours: 0, days: 0, pending: 0, missing: 0 };
    for (const row of visible) {
      for (const metric of Object.keys(totals)) totals[metric] += row[metric];
    }

    const period = from && to ? displayDate(from) + ' to ' + displayDate(to)
      : from ? 'From ' + displayDate(from) : to ? 'Through ' + displayDate(to) : 'All dates';
    const scope = period + ' | ' + select.selectedOptions[0].textContent + ' | Run ' + displayDate(asOf);
    const notes = [
      'Asset spend includes recorded labour, parts and other costs on company assets, including servicing. External work is shown below. Spend totals exclude costs awaiting final sign-off.',
      'Completed job downtime uses authorised hours plus any extra time entered for other resolved defects. Manual cost entries use the downtime entered. Out-of-service days come from the register and count calendar days up to the return date, excluding that date. The two measures may overlap.',
      'A dash means downtime was not entered. Older entries saved with zero hours can include blank downtime fields.',
      'Job summaries use the completion date when available. Spend uses the date on the cost entry.',
    ];
    if (state.records === 'error') notes.push('Completed job cards could not load. The job summary only includes work recorded in CostLog.');
    if (state.history === 'error') notes.push('Out-of-service history could not load. Register figures only cover currently out-of-service assets.');
    if (totals.pending || totals.missing) notes.push(
      `${totals.pending} cost entries awaiting sign-off. ${totals.missing} entries without a downtime value.`);

    const metrics = [
      ['Asset spend', cash(totals.spend)],
      ['Logged downtime', hours(totals.loggedHours)],
      [state.history === 'error' ? 'Current register days' : 'Out-of-service asset-days', String(totals.days)],
    ];
    const columns = ['Asset', 'Branch', 'Asset spend', 'Logged downtime', 'OOS days', 'Entries'];
    const cells = row => [row.name, row.branch || '—', cash(row.spend),
      row.entries > row.missing ? hours(row.loggedHours) : '—', String(row.days), String(row.entries)];
    const downtimeChart = totals.loggedHours
      ? ['Most logged downtime', 'loggedHours', hours]
      : ['Most out-of-service days', 'days', value => decimals.format(value) + ' d'];
    const jobAssets = visible.filter(row => row.jobs.length)
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.branch.localeCompare(b.branch));
    const externalSummary = 'Cost to KCM ' + cash(externalSpend) + ' · Customer charges ' + externalCharges;
    const externalNote = select.value ? 'Select All assets to include external work without a linked asset.' : '';
    report = { visible, scope, notes, metrics, columns, cells, from, to, downtimeChart, jobAssets,
      externalRows, externalColumns, externalSummary, externalNote };

    byId('assetCostResults').innerHTML = `
      <p class="asset-report-scope">KCM Waste Management · ${escapeHtml(scope)}</p>
      <div class="stat-row">${metrics.map(([label, amount]) =>
        `<div class="stat-box"><div class="num">${amount}</div><div class="lbl">${label}</div></div>`).join('')}</div>
      <div class="asset-report-charts">
        ${chart('Highest asset spend', visible, 'spend', cash, '')}
        ${chart(downtimeChart[0], visible, downtimeChart[1], downtimeChart[2], 'downtime')}
      </div>
      <h2>Asset breakdown</h2>
      <div class="table-wrap"><table><thead><tr>${columns.map(label =>
        `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>
        ${visible.map(row => `<tr>${cells(row).map((cell, i) =>
          `<td class="${i >= 2 ? 'num' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
          || '<tr><td colspan="6" class="empty-state">No assets found.</td></tr>'}
      </tbody></table></div>
      ${notes.map(note => `<p class="progress-note">${escapeHtml(note)}</p>`).join('')}
      <section class="asset-job-summary">
        <h2>External work costs</h2>
        <p>${escapeHtml(externalSummary)}</p>
        ${externalNote ? `<p class="progress-note">${escapeHtml(externalNote)}</p>` : ''}
        ${externalRows.length ? `<div class="table-wrap"><table><thead><tr>
          ${externalColumns.map(label => `<th scope="col">${label}</th>`).join('')}
        </tr></thead><tbody>${externalRows.map(row =>
          `<tr>${row.map((cell, i) => `<td class="${i >= 3 ? 'num' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>`
        ).join('')}</tbody></table></div>` : '<p>No external work recorded for this selection.</p>'}
      </section>
      <section class="asset-job-summary" id="assetJobSummary">
        <h2>Jobs carried out and parts used</h2>
        ${jobAssets.map(row => `<section class="asset-job-group">
          <h3>${escapeHtml(jobAssetLabel(row))}</h3>
          ${row.jobs.map(job => `<article class="asset-job-entry">
            <h4>${escapeHtml(jobLabel(job))}</h4>
            ${jobDetails(job).map(line => `<p>${escapeHtml(line)}</p>`).join('')}
          </article>`).join('')}
        </section>`).join('') || '<p>No jobs recorded for the selected assets and dates.</p>'}
      </section>`;
    status('');
  }

  function jobAssetLabel(row) {
    return [row.name, row.branch, row.jobs.length + (row.jobs.length === 1 ? ' job' : ' jobs')].filter(Boolean).join(' · ');
  }

  function jobLabel(job) {
    return [displayDate(job.date), job.title, job.reference, job.manual ? 'Manual cost entry' : ''].filter(Boolean).join(' · ');
  }

  function jobDetails(job) {
    return [
      [job.person, job.outcome].filter(Boolean).join(' · '),
      job.work ? 'Work carried out: ' + job.work : '',
      !job.work && job.description ? 'Job description: ' + job.description : '',
      !job.work && !job.description ? 'No work notes recorded' : '',
      'Parts used: ' + job.parts,
    ].filter(Boolean);
  }

  function makePdf(data, JsPDF) {
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 34;
    const content = width - 2 * margin;
    const colWidths = [155, 85, 91, 89, 60, content - 480];
    let y;

    function heading() {
      doc.setTextColor(46, 46, 143);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text('Asset Cost & Downtime Report', margin, margin + 12);
      doc.setTextColor(52, 60, 74);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const scope = doc.splitTextToSize('KCM Waste Management | ' + data.scope, content);
      doc.text(scope, margin, margin + 29);
      y = margin + 36 + scope.length * 11;
    }

    function drawChart(label, metric, format, left, top, chartWidth, colour) {
      const leaders = chartRows(data.visible, metric);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(label, left, top);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const max = Math.max(1, ...leaders.map(row => Math.abs(row[metric])));
      if (!leaders.length) doc.text('No recorded values in this period.', left, top + 18);
      let lineY = top + 16;
      for (const row of leaders) {
        const name = row.name + (row.branch ? ' / ' + row.branch : '');
        const labels = doc.splitTextToSize(name, chartWidth - 78);
        doc.text(labels, left, lineY);
        doc.text(format(row[metric]), left + chartWidth, lineY, { align: 'right' });
        lineY += labels.length * 9;
        doc.setFillColor(...colour);
        doc.rect(left, lineY - 4, chartWidth * Math.abs(row[metric]) / max, 3, 'F');
        lineY += 8;
      }
      return Math.max(lineY, top + 30);
    }

    function tableHeader() {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(233, 237, 247);
      doc.rect(margin, y, content, 19, 'F');
      let x = margin;
      data.columns.forEach((label, i) => {
        doc.text(label, x + 5, y + 12);
        x += colWidths[i];
      });
      y += 19;
      doc.setFont('helvetica', 'normal');
    }

    doc.setProperties({ title: 'Asset Cost & Downtime Report', subject: data.scope });
    heading();
    for (const [label, amount] of data.metrics) {
      doc.text(label + ': ' + amount, margin, y);
      y += 14;
    }
    y += 12;
    const chartWidth = (content - 24) / 2;
    y = Math.max(
      drawChart('Highest asset spend', 'spend', cash, margin, y, chartWidth, [46, 46, 143]),
      drawChart(...data.downtimeChart, margin + chartWidth + 24, y, chartWidth, [23, 117, 76]),
    ) + 18;
    doc.setFontSize(9);
    for (const note of data.notes) {
      const lines = doc.splitTextToSize(note, content);
      doc.text(lines, margin, y);
      y += lines.length * 11 + 5;
    }
    if (y + 45 > height - margin) {
      doc.addPage();
      heading();
    }
    tableHeader();
    for (const row of data.visible) {
      const cells = data.cells(row).map((cell, i) => doc.splitTextToSize(cell, colWidths[i] - 10));
      const rowHeight = Math.max(...cells.map(lines => lines.length)) * 10 + 6;
      if (y + rowHeight > height - margin) {
        doc.addPage();
        heading();
        tableHeader();
      }
      let x = margin;
      cells.forEach((lines, i) => {
        doc.text(lines, i < 2 ? x + 5 : x + colWidths[i] - 5, y + 11,
          { align: i < 2 ? 'left' : 'right' });
        x += colWidths[i];
      });
      y += rowHeight;
      doc.setDrawColor(224, 229, 237);
      doc.line(margin, y, width - margin, y);
    }
    if (!data.visible.length) {
      doc.text('No assets found.', margin + 5, y + 14);
      y += 20;
    }

    function newPageIfNeeded(space) {
      if (y + space <= height - margin) return false;
      doc.addPage();
      heading();
      return true;
    }

    function jobText(value, size, style, context = '') {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(value, content);
      for (const line of lines) {
        if (newPageIfNeeded(size + 5)) {
          if (context) jobText(context + ' (continued)', 10, 'bold');
          doc.setFont('helvetica', style);
          doc.setFontSize(size);
        }
        y += size + 4;
        doc.text(line, margin, y);
      }
    }

    y += 12;
    newPageIfNeeded(85);
    jobText('External work costs', 13, 'bold');
    jobText(data.externalSummary, 10, 'bold');
    if (data.externalNote) jobText(data.externalNote, 9, 'normal');
    if (!data.externalRows.length) jobText('No external work recorded for this selection.', 9, 'normal');
    for (const [date, customer, equipment, cost, charge] of data.externalRows) {
      y += 5;
      newPageIfNeeded(38);
      jobText([date, customer, equipment].join(' · '), 9, 'bold', 'External work costs');
      jobText('Cost to KCM ' + cost + ' · Customer charge ' + charge, 9, 'normal');
    }

    y += 12;
    newPageIfNeeded(85);
    jobText('Jobs carried out and parts used', 13, 'bold');
    if (!data.jobAssets.length) jobText('No jobs recorded for the selected assets and dates.', 9, 'normal');
    for (const row of data.jobAssets) {
      const assetLabel = jobAssetLabel(row);
      y += 10;
      newPageIfNeeded(63);
      jobText(assetLabel, 11, 'bold');
      for (const job of row.jobs) {
        const label = jobLabel(job);
        y += 5;
        if (newPageIfNeeded(45)) jobText(assetLabel + ' (continued)', 10, 'bold');
        jobText(label, 9, 'bold', row.name);
        for (const detail of jobDetails(job)) jobText(detail, 9, 'normal', row.name + ' · ' + label);
      }
    }
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.text(`${page} / ${doc.getNumberOfPages()}`, width - margin, height - 17, { align: 'right' });
    }
    return doc;
  }

  function init() {
    const asOf = today();
    byId('assetCostFrom').value = asOf.slice(0, 8) + '01';
    byId('assetCostTo').value = asOf;
    for (const id of ['assetCostFrom', 'assetCostTo', 'assetCostAsset']) byId(id).addEventListener('change', render);
    byId('assetCostAllDates').addEventListener('click', () => {
      byId('assetCostFrom').value = '';
      byId('assetCostTo').value = '';
      render();
    });
    byId('assetCostJobs').addEventListener('click', () => byId('assetJobSummary').scrollIntoView());
    byId('assetCostPrint').addEventListener('click', () => {
      render();
      if (report) window.print();
    });
    byId('assetCostPdf').addEventListener('click', () => {
      render();
      if (!report) return;
      try {
        const pdf = makePdf(report, window.jspdf.jsPDF);
        const period = report.from || report.to ? (report.from || 'start') + '_' + (report.to || 'present') : 'all_dates';
        pdf.save('KCM_Asset_Cost_and_Downtime_' + period + '.pdf');
      } catch (error) {
        console.error(error);
        toast('Could not create the PDF. Use Print report to save a PDF from your browser.');
      }
    });
  }

  function loaded(source) {
    state[source] = 'ready';
    render();
  }

  function failed(source) {
    state[source] = 'error';
    render();
  }

  function open() {
    if (!listening) {
      listening = true;
      db.collection('vorHistory').onSnapshot(snapshot => {
        history = snapshot.docs.map(doc => doc.data());
        loaded('history');
      }, () => failed('history'));
    }
    render();
  }

  return { init, open, loaded, failed };
})();
