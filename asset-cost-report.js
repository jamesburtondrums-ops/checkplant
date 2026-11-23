'use strict';

const assetCostReport = (() => {
  const dayMs = 86400000;
  const chartLimit = 10;
  const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' });
  const sterling = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const decimals = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const cash = pennies => sterling.format(pennies / 100);
  const hours = value => decimals.format(value) + ' h';
  const byId = id => document.getElementById(id);
  const state = { machines: 'loading', costs: 'loading', history: 'loading' };
  let history = [];
  let listening = false;
  let report;

  function today() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London' }).format(new Date());
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

  function build(assets, entries, register, { from, to, asOf }) {
    const first = from ? day(from) : -Infinity;
    const afterLast = to ? day(to) + 1 : Infinity;
    const tomorrow = day(asOf) + 1;
    const rows = new Map();
    const names = new Map();

    function addRow(key, name, branch) {
      if (!rows.has(key)) {
        rows.set(key, { key, name, branch, spend: 0, loggedHours: 0, missing: 0,
          pending: 0, entries: 0, intervals: [] });
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

    for (const entry of entries) {
      if (entry.workSource === 'external') continue;
      const date = day(entry.date);
      if (!Number.isFinite(date) || date < first || date >= afterLast) continue;
      const row = findRow(entry.machineId, entry.machineName, entry.branch);
      const duration = number(entry.downtimeHours);
      row.entries++;
      if (duration === null || duration < 0) row.missing++;
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

    return [...rows.values()].map(row => ({ ...row, days: downtimeDays(row.intervals) }))
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
    const rows = build(machines, costEntries, history, { from, to, asOf });
    const select = byId('assetCostAsset');
    const selected = select.value;
    select.replaceChildren(new Option('All assets', ''), ...[...rows]
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
      .map(row => new Option(row.name + (row.branch ? ' · ' + row.branch : ''), row.key)));
    select.value = rows.some(row => row.key === selected) ? selected : '';
    const visible = select.value ? rows.filter(row => row.key === select.value) : rows;
    const totals = { spend: 0, loggedHours: 0, days: 0, pending: 0, missing: 0 };
    for (const row of visible) {
      for (const metric of Object.keys(totals)) totals[metric] += row[metric];
    }

    const period = from && to ? displayDate(from) + ' to ' + displayDate(to)
      : from ? 'From ' + displayDate(from) : to ? 'Through ' + displayDate(to) : 'All dates';
    const scope = period + ' | ' + select.selectedOptions[0].textContent + ' | Run ' + displayDate(asOf);
    const notes = [
      'Spend includes recorded labour, parts and other costs on company assets, including servicing. Customer work and costs awaiting final sign-off are excluded.',
      'Logged downtime uses the downtime field on cost entries. Out-of-service days come from the register and count calendar days up to the return date, excluding that date. The two measures may overlap.',
      'A dash means downtime was not entered. Older entries saved with zero hours can include blank downtime fields.',
    ];
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
    report = { visible, scope, notes, metrics, columns, cells, from, to, downtimeChart };

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
      ${notes.map(note => `<p class="progress-note">${escapeHtml(note)}</p>`).join('')}`;
    status('');
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
    if (!data.visible.length) doc.text('No assets found.', margin + 5, y + 14);
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
