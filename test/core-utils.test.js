// Task 1 — core utilities. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatPHP, splitInstallments } from '../src/core/money.js';
import { DEMO_NOW, now, addDays, addMonths, daysBetween, fmtDate, fmtDateTime, phtDate } from '../src/core/clock.js';
import { mulberry32 } from '../src/core/rng.js';
import { can, deniedHint, ROLES, ACTIONS } from '../src/core/permissions.js';
import { toCSV } from '../src/core/csv.js';
import { maskMobile, arrangementRef } from '../src/core/format.js';
import { POLICIES, POLICY_META, SUPPORT, QR_BASE, BRAND, LEGAL_NAME } from '../src/core/config.js';

test('test_formatPHP', () => {
  assert.equal(formatPHP(250000), '₱2,500.00');
  assert.equal(formatPHP(0), '₱0.00');
  assert.equal(formatPHP(123456789), '₱1,234,567.89');
  assert.equal(formatPHP(5), '₱0.05');
  assert.equal(formatPHP(-120000), '-₱1,200.00');
});

test('test_splitInstallments', () => {
  assert.deepEqual(splitInstallments(1500000, 6), [250000, 250000, 250000, 250000, 250000, 250000]);
  assert.deepEqual(splitInstallments(1000000, 3), [333333, 333333, 333334]);
  for (const [total, count] of [[1500000, 6], [1000000, 3], [999999, 7], [1, 1], [100001, 12]]) {
    const parts = splitInstallments(total, count);
    assert.equal(parts.length, count);
    assert.equal(parts.reduce((a, b) => a + b, 0), total, `sum for ${total}/${count}`);
    assert.ok(parts.every(Number.isInteger));
  }
});

test('test_clock', () => {
  assert.equal(DEMO_NOW, '2026-11-26T10:00:00+08:00');
  assert.equal(fmtDate(addDays('2026-11-26', 9)), 'Dec 5, 2026');
  assert.equal(now().toISOString(), '2026-11-26T02:00:00.000Z');
  assert.equal(fmtDateTime(DEMO_NOW), 'Nov 26, 2026, 10:00 AM');
  assert.equal(addDays(DEMO_NOW, 5), '2026-12-01T10:00:00+08:00');
  assert.equal(addMonths('2026-10-05', 3), '2027-01-05');
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(daysBetween('2026-11-26', '2026-12-05'), 9);
  // PHT calendar date of a UTC instant late in the day
  assert.equal(phtDate('2026-11-30T17:00:00.000Z'), '2026-12-01');
  // now() never drifts with the real date
  assert.equal(now().getTime(), now().getTime());
});

test('test_rng_deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const xs = Array.from({ length: 5 }, () => a());
  const ys = Array.from({ length: 5 }, () => b());
  assert.deepEqual(xs, ys);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('test_can_matrix', () => {
  assert.equal(can('agent', 'arrangement.approve'), false);
  assert.equal(can('supervisor', 'arrangement.approve'), true);
  assert.equal(can('admin', 'recon.resolve'), false);
  assert.equal(can('finance', 'recon.resolve'), true);
  assert.deepEqual(ROLES, ['admin', 'supervisor', 'agent', 'finance']);
  for (const role of ROLES) {
    assert.equal(can(role, 'request.expireDemo'), true);
    assert.equal(can(role, 'settings.view'), true);
  }
  assert.equal(can('admin', 'creditor.manage'), true);
  assert.equal(can('supervisor', 'creditor.manage'), false);
  assert.equal(can('agent', 'request.send'), true);
  assert.equal(can('finance', 'request.send'), false);
  assert.equal(can('finance', 'payment.refund'), true);
  assert.equal(can('admin', 'nonexistent.action'), false);
  assert.equal(deniedHint('arrangement.approve'), 'Requires Supervisor');
  assert.equal(deniedHint('recon.resolve'), 'Requires Finance');
  assert.equal(deniedHint('creditor.manage'), 'Requires Admin');
  assert.ok(ACTIONS.includes('portfolio.import'));
});

test('test_toCSV', () => {
  const csv = toCSV(
    [{ name: 'Juan "JD" a, b', amt: '₱2,500.00' }, { name: 'plain', amt: 'x' }],
    [{ key: 'name', label: 'Name' }, { key: 'amt', label: 'Amount' }],
  );
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Name,Amount');
  assert.equal(lines[1], '"Juan ""JD"" a, b","₱2,500.00"');
  assert.equal(lines[2], 'plain,x');
});

test('test_maskMobile', () => {
  assert.equal(maskMobile('+639171237310'), '••••7310');
  assert.equal(maskMobile(null), '••••');
});

test('test_arrangementRef', () => {
  assert.equal(arrangementRef('ar_02659'), 'MBA-ARR-02659');
  assert.equal(arrangementRef('ar_123'), 'MBA-ARR-00123');
  // Named seed ids get a stable, distinct 9xxxx number in the same style.
  const named = ['juan', 'maria', 'carlo', 'ana', 'luis', 'nina', 'rosa', 'ben', 'mark'].map((k) => arrangementRef(`ar_${k}`));
  for (const r of named) assert.match(r, /^MBA-ARR-9\d{4}$/);
  assert.equal(new Set(named).size, named.length);
  assert.equal(arrangementRef('ar_juan'), arrangementRef('ar_juan'));
});

test('test_config', () => {
  assert.equal(BRAND, 'MBA CONSULT');
  assert.equal(LEGAL_NAME, 'M.B.A. Consulting Philippines');
  assert.equal(QR_BASE, 'https://pay.example/t/');
  assert.equal(SUPPORT.phone, '+63 998 58 64 100');
  assert.equal(SUPPORT.email, 'info@ph.mbacgroup.com');
  assert.equal(POLICIES.otpMaxAttempts, 5);
  assert.ok(POLICIES.methods.length >= 3);
  const qids = POLICY_META.map((r) => r.qid);
  for (const q of ['§9.2', 'Q-12', 'Q-11', 'Q-23', 'Q-13', '§10.2', 'Q-17', 'Q-14']) assert.ok(qids.includes(q), q);
  assert.ok(POLICY_META.every((r) => r.key && r.label && r.value));
});
