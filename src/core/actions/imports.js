// Import wizard samples (V3 §5): template, validation, duplicates, accepted / partial / rejected.
import { parsePesos } from '../money.js';
import { stamp, appendAudit, pushNotification, nextObjId, nextSeqId } from '../store.js';
import { toCSV } from '../csv.js';
import { ok, fail, guard } from './util.js';

export const TEMPLATE_HEADERS = ['creditor_account_no', 'full_name', 'mobile', 'placed_balance', 'currency', 'chargeoff_date', 'email'];

const CLEAN = [
  ['Alma Reyes', '+639171110201', '12500.00'], ['Bernard Cruz', '+639181110202', '8400.00'], ['Celia Santos', '+639191110203', '23750.50'],
  ['Dario Lim', '+639201110204', '5600.00'], ['Edna Flores', '+639271110205', '41200.00'], ['Fidel Gomez', '+639471110206', '9900.00'],
  ['Gemma Ramos', '+639561110207', '15000.00'], ['Hilario Tan', '+639661110208', '7350.00'], ['Irene Bautista', '+639771110209', '30500.00'],
  ['Joel Navarro', '+639951110210', '11250.00'], ['Katrina Uy', '+639981110211', '6400.00'], ['Leo Mendoza', '+639171110212', '19800.00'],
];
const ERRS = [
  ['Mario Aquino', '+639171120301', '10400.00'], ['Nora Castillo', '+639181120302', '7200.00'], ['Oscar Dela Rosa', '+639191120303', '26300.00'],
  ['Paz Villanueva', '0917-123', '9100.00'], ['Quintin Ocampo', '+639271120305', '13900.00'], ['Rita Morales', '+639471120306', '4800.00'],
  ['', '+639561120307', '22000.00'], ['Sergio Pascual', '+639661120308', '8750.00'], ['Tess Domingo', '+639771120309', '17600.00'],
  ['Ulysses Garcia', '+639951120310', '-2500.00'], ['Vicky Salazar', '+639981120311', '12100.00'], ['Wendell Yap', '+639171120312', '5300.00'],
];

/** The 12 rows of a sample file ('clean' | 'errors'), as objects keyed by TEMPLATE_HEADERS. */
export function sampleRows(kind = 'clean') {
  const src = kind === 'errors' ? ERRS : CLEAN;
  const tag = kind === 'errors' ? 'E' : 'C';
  return src.map(([name, mobile, bal], i) => {
    const first = name.split(' ')[0]?.toLowerCase();
    const last = name.split(' ').slice(-1)[0]?.charAt(0).toLowerCase();
    return {
      creditor_account_no: `IMP-${tag}-${String(1001 + i)}`,
      full_name: name,
      mobile,
      placed_balance: bal,
      currency: 'PHP',
      chargeoff_date: `2026-0${(i % 6) + 3}-${String(10 + i).padStart(2, '0')}`,
      email: name && i % 4 !== 3 ? `${first}.${last}@example.com` : '',
    };
  });
}

/** The template CSV (header + one example row). */
export function templateCSV() {
  return toCSV([sampleRows('clean')[0]], TEMPLATE_HEADERS.map((h) => ({ key: h, label: h })));
}

/** Field errors for one row: [{field, message}]. */
export function validateRow(row) {
  const errs = [];
  if (!String(row.full_name ?? '').trim()) errs.push({ field: 'full_name', message: 'Borrower full name is required' });
  const mobile = String(row.mobile ?? '').replace(/\s/g, '');
  if (!/^(\+639|09)\d{9}$/.test(mobile)) errs.push({ field: 'mobile', message: 'Mobile number must look like +639XXXXXXXXX' });
  const bal = parsePesos(row.placed_balance);
  if (bal === null || bal <= 0) errs.push({ field: 'placed_balance', message: 'Placed balance must be greater than zero' });
  if (row.currency !== 'PHP') errs.push({ field: 'currency', message: 'Currency must be PHP' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.chargeoff_date ?? ''))) errs.push({ field: 'chargeoff_date', message: 'Charge-off date must be YYYY-MM-DD' });
  if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) errs.push({ field: 'email', message: 'Email address is not valid' });
  return errs;
}

/** Imports a sample file into a portfolio. Valid rows become 'new' accounts in the unassigned queue. */
export function importSample(store, portfolioId, kind = 'clean') {
  const denied = guard(store, 'portfolio.import');
  if (denied) return denied;
  const s = store.get();
  const pf = s.portfolios[portfolioId];
  if (!pf) return fail('not_found', 'Portfolio not found.');
  if (!['clean', 'errors'].includes(kind)) return fail('bad_kind', 'Choose a sample file.');
  const rows = sampleRows(kind);
  const existing = new Set(Object.values(s.accounts).filter((a) => a.creditorId === pf.creditorId).map((a) => a.creditorAccountNo));
  const errors = [];
  const good = [];
  rows.forEach((row, i) => {
    const errs = validateRow(row);
    if (!errs.length && existing.has(row.creditor_account_no)) errs.push({ field: 'creditor_account_no', message: 'Duplicate creditor account number for this creditor' });
    if (errs.length) errors.push({ row: i + 1, field: errs[0].field, message: errs.map((e) => e.message).join('; '), values: row });
    else { good.push(row); existing.add(row.creditor_account_no); }
  });
  const status = errors.length === 0 ? 'accepted' : good.length === 0 ? 'rejected' : 'partial';
  const filename = kind === 'errors' ? 'sample-with-errors.csv' : 'sample-clean.csv';
  return store.set((d) => {
    const at = stamp(d);
    const batchId = nextObjId(d, 'ib');
    for (const row of good) {
      const id = nextObjId(d, 'ac');
      const parts = row.full_name.trim().split(/\s+/);
      const mobile = row.mobile.replace(/\s/g, '').replace(/^09/, '+639');
      d.accounts[id] = {
        id, ref: nextSeqId(d, 'ref'), portfolioId, creditorId: pf.creditorId, creditorAccountNo: row.creditor_account_no,
        borrower: { first: parts[0], lastInitial: parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '', mobile, email: row.email || null },
        placedBalance: parsePesos(row.placed_balance), assigneeId: null, status: 'new', createdAt: at, importBatchId: batchId,
      };
    }
    d.importBatches[batchId] = { id: batchId, portfolioId, filename, status, rows: rows.length, accepted: good.length, errors, at };
    appendAudit(d, { action: 'portfolio.import', target: batchId, detail: `${filename} → ${status}: ${good.length} of ${rows.length} rows accepted (${pf.name})` }, at);
    pushNotification(d, `Import ${status}: ${good.length} of ${rows.length} rows accepted (${pf.name})`, `#/m/portfolios/${portfolioId}`, at);
    return ok({ batchId, status, accepted: good.length, errors });
  });
}

/** CSV of a batch's error rows (original values + the error), for the "download error rows" link. */
export function importErrorsCSV(batch) {
  const rows = (batch?.errors || []).map((e) => ({ row: e.row, error: e.message, ...e.values }));
  return toCSV(rows, [{ key: 'row', label: 'row' }, { key: 'error', label: 'error' }, ...TEMPLATE_HEADERS.map((h) => ({ key: h, label: h }))]);
}
