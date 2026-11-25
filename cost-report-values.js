'use strict';

function costNumber(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function entryCostPence(entry) {
  const total = costNumber(entry.totalCost);
  if (entry.workSource !== 'external') return Math.round((total ?? 0) * 100);
  const knownCost = costNumber(entry.internalCost);
  const supplier = costNumber(entry.supplierCost);
  const other = costNumber(entry.internalOtherCost);
  const expenses = supplier === null && other === null ? null : (supplier ?? 0) + (other ?? 0);
  return Math.round((knownCost ?? expenses ?? total ?? 0) * 100);
}

function customerChargePence(entry) {
  const recorded = costNumber(entry.customerCharge);
  if (recorded !== null) return Math.round(recorded * 100);
  const items = [entry.labourCharge, entry.partsCharge, entry.calloutCharge, entry.otherCharge].map(costNumber);
  if (items.every(item => item === null)) return null;
  return Math.round(items.reduce((sum, item) => sum + (item ?? 0), 0) * 100);
}
