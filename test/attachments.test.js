// Contract / agreement files behind each transaction (2026-11-26, user request: an "Attachments"
// column on MBA → Transactions holding each borrower's own contract and agreement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../src/data/seed.js';
import { attachmentsFor, attachmentVersions, lineageAttachments, docKind, DOC_LABEL, installmentsOf, installmentPlan } from '../src/core/selectors.js';
import { createStore, STORAGE_KEY, LEGACY_KEYS } from '../src/core/store.js';
import { DEMO_NOW } from '../src/core/clock.js';
import { fmtSize } from '../src/core/format.js';

test('test_every_transaction_has_its_own_contract_and_agreement', () => {
  const s = createSeedState();
  const attempts = Object.values(s.attempts);
  assert.ok(attempts.length > 300, `attempts: ${attempts.length}`);
  for (const a of attempts) {
    const req = s.requests[a.requestId];
    const acc = s.accounts[a.accountId];
    const files = attachmentsFor(s, req.arrangementId);
    const kinds = files.map(docKind);
    assert.ok(kinds.includes('contract') && kinds.includes('agreement'), `${a.id}: ${kinds.join(',')}`);
    // individual: every file is this borrower's, on this account's arrangement lineage
    const lineage = s.arrangements[req.arrangementId].lineageId;
    for (const f of files) {
      assert.ok(f.filename.includes(acc.ref), `${a.id}: ${f.filename} is not ${acc.ref}'s file`);
      assert.equal(s.arrangements[f.arrangementId].lineageId, lineage, `${a.id}: ${f.id} is on another arrangement`);
    }
  }
});

test('test_attachments_latest_version_contract_first', () => {
  const s = createSeedState();
  // a lineage whose agreement was re-uploaded (seed gives ~12% a v2)
  const v2 = Object.values(s.attachments).find((f) => f.version === 2);
  assert.ok(v2, 'seed should include a re-uploaded agreement');
  const files = attachmentsFor(s, v2.arrangementId);
  const sameName = files.filter((f) => f.filename === v2.filename);
  assert.equal(sameName.length, 1, 'only the latest version of a file name is listed');
  assert.equal(sameName[0].version, 2);
  assert.equal(docKind(files[0]), 'contract', 'contract is listed first');
  const versions = attachmentVersions(s, v2.id);
  assert.deepEqual(versions.map((f) => f.version), [2, 1], 'versions newest first');
  assert.ok(lineageAttachments(s, v2.arrangementId).length > files.length, 'older versions are kept, not overwritten');
});

test('test_seeded_files_are_dated_before_the_demo_clock_and_sized', () => {
  const s = createSeedState();
  for (const f of Object.values(s.attachments)) {
    assert.ok(f.at <= DEMO_NOW, `${f.id} dated ${f.at} after the demo clock`);
    assert.ok(f.size >= 80 * 1024 && f.size <= 420 * 1024, `${f.id} size ${f.size}`);
    assert.ok(f.sample === 'contract' || f.sample === 'agreement', `${f.id} sample ${f.sample}`);
    const arr = s.arrangements[f.arrangementId];
    assert.ok(f.at >= arr.createdAt, `${f.id} uploaded before its arrangement was drafted`);
  }
});

test('test_doc_kind_and_labels', () => {
  assert.equal(docKind({ sample: 'contract', filename: 'x.pdf' }), 'contract');
  assert.equal(docKind({ filename: 'Signed agreement Mark V.pdf' }), 'agreement');
  assert.equal(docKind({ filename: 'Loan CONTRACT copy.pdf' }), 'contract');
  assert.equal(docKind({ filename: 'Promissory note.pdf' }), 'agreement');
  assert.equal(docKind({ filename: 'scan-0042.pdf' }), 'file');
  assert.equal(docKind(null), 'file');
  assert.deepEqual(Object.keys(DOC_LABEL), ['contract', 'agreement', 'file']);
  assert.equal(fmtSize(512), '512 B');
  assert.equal(fmtSize(210 * 1024), '210 KB');
  assert.equal(fmtSize(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(fmtSize(undefined), '—');
});

test('test_attachments_for_unknown_arrangement_is_empty', () => {
  const s = createSeedState();
  assert.deepEqual(attachmentsFor(s, 'ar_nope'), []);
  assert.deepEqual(attachmentVersions(s, 'at_nope'), []);
});

test('test_installment_plan_always_adds_up', () => {
  const s = createSeedState();
  const shapes = { equal: 0, final: 0, mixed: 0 };
  for (const arr of Object.values(s.arrangements)) {
    const insts = installmentsOf(s, arr.id);
    const p = installmentPlan(insts);
    shapes[p.shape] += 1;
    if (p.shape === 'equal') assert.equal(p.n * p.per, p.total, `${arr.id} equal`);
    if (p.shape === 'final') assert.equal((p.n - 1) * p.per + p.last, p.total, `${arr.id} final`);
  }
  assert.ok(shapes.final > 0 && shapes.equal > 0, JSON.stringify(shapes));
  // the case that read "10 × ₱8,050.02" for a ₱80,500.25 total
  const p = installmentPlan(installmentsOf(s, 'ar_01212'));
  assert.deepEqual([p.shape, p.n, p.per, p.last, p.total], ['final', 10, 805002, 805007, 8050025]);
  assert.equal(installmentPlan([]).shape, 'mixed');
});

test('test_every_seeded_upload_is_audited', () => {
  const s = createSeedState();
  const rows = s.audit.filter((a) => a.action === 'attachment.upload');
  assert.equal(rows.length, Object.keys(s.attachments).length);
  for (const f of Object.values(s.attachments)) {
    const r = rows.filter((a) => a.target === f.id);
    assert.equal(r.length, 1, `${f.id}: ${r.length} audit rows`);
    assert.equal(r[0].accountId, s.arrangements[f.arrangementId].accountId);
    assert.equal(r[0].at, f.at);
  }
  const ids = s.audit.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'audit ids are unique');
});

test('test_store_drops_the_superseded_v1_copy', () => {
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), has: (k) => m.has(k) };
  };
  const seed = () => createSeedState();
  assert.deepEqual([...LEGACY_KEYS], ['mba-demo-v1']);
  const a = mem();
  a.setItem('mba-demo-v1', '{"version":1}');
  createStore({ storage: a, seed });
  assert.equal(a.has('mba-demo-v1'), false, 'v1 copy removed on load');
  // a store on another key (tests, tools) leaves other entries alone
  const b = mem();
  b.setItem('mba-demo-v1', 'x');
  createStore({ storage: b, key: 'other-key', seed });
  assert.equal(b.has('mba-demo-v1'), true);
  assert.equal(STORAGE_KEY, 'mba-demo-v2');
});
