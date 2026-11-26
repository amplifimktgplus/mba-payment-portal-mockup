// Single in-memory store, persisted to localStorage when available (D§5.1).
// Every mutation clones the state, so a mutator that throws leaves the store untouched.
// The demo clock is fixed (C5); each stamped mutation advances an internal tick by one
// second so audit rows and new records stay ordered: DEMO_NOW + tick seconds.

import { createSeedState } from '../data/seed.js';
import { DEMO_NOW, addSeconds } from './clock.js';
import { seqId } from './format.js';

// v2 (2026-11-26): the seed gained contract files, so a browser holding v1 state starts fresh.
export const STORAGE_KEY = 'mba-demo-v2';
/** Superseded keys, removed on load so an old copy never competes for the storage quota. */
export const LEGACY_KEYS = Object.freeze(['mba-demo-v1']);
const SEQ_PREFIX = { req: 'MBA-REQ', txn: 'MBA-TXN' };

export function initialBorrower() {
  return { token: null, ref: null, verified: false, verifiedAt: null, otp: null, screenOverride: null, error: null, attemptId: null };
}

/** window.localStorage if it can be read and written; otherwise null (private mode, file:// quirks, Node). */
export function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const k = '__mba_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** Current demo time for a state: DEMO_NOW + tick seconds (no tick yet → DEMO_NOW). */
export function nowOf(state) {
  return addSeconds(DEMO_NOW, state?.seq?.tick || 0);
}

/** Advances the demo tick by one second on a draft and returns that timestamp. */
export function stamp(draft) {
  draft.seq.tick = (draft.seq.tick || 0) + 1;
  return addSeconds(DEMO_NOW, draft.seq.tick);
}

/** Next typed ID: 'req' → 'MBA-REQ-000812', 'txn' → 'MBA-TXN-004217', 'evt' → 'evt_9000', 'ref' → 'MBA-REF-2026-005000'. */
export function nextSeqId(draft, kind) {
  const n = draft.seq[kind]++;
  if (kind === 'evt') return `evt_${n}`;
  if (kind === 'ref') return `MBA-REF-2026-${String(n).padStart(6, '0')}`;
  return seqId(SEQ_PREFIX[kind], n);
}

/** Next generic internal id: prefix_00001 (shared counter, never reused). */
export function nextObjId(draft, prefix) {
  const n = draft.seq.obj++;
  return `${prefix}_${String(n).padStart(5, '0')}`;
}

/** Appends an audit row {id, at, role, action, target, ...} to a draft. */
export function appendAudit(draft, entry, at = stamp(draft)) {
  const row = { id: nextObjId(draft, 'au'), at, role: entry.role ?? draft.role, action: entry.action, target: entry.target ?? null };
  for (const k of ['accountId', 'detail', 'before', 'after']) if (entry[k] !== undefined && entry[k] !== null) row[k] = entry[k];
  draft.audit.push(row);
  return row;
}

/** Pushes an in-app notification (newest first). */
export function pushNotification(draft, text, link = null, at = stamp(draft)) {
  const n = { id: nextObjId(draft, 'nt'), at, text, link, read: false };
  draft.notifications.unshift(n);
  return n;
}

function isValidState(s) {
  return !!(s && s.version === 1 && s.seq && s.accounts && s.requests && s.borrower && Array.isArray(s.audit));
}

/** Transient UI state that cannot survive a reload is cleared on load. */
function normalizeLoaded(s) {
  // B5 ("Checking your payment…") is driven by a timer in the page. After a reload no timer runs,
  // so drop it: a still-pending attempt then shows B6, a resolved one shows its own screen.
  if (s.borrower.screenOverride === 'B5') s.borrower.screenOverride = null;
  if (!('attemptId' in s.borrower)) s.borrower.attemptId = null;
  if (!('error' in s.borrower)) s.borrower.error = null;
  return s;
}

/**
 * createStore({storage, key, seed}) → {get, set, subscribe, reset, notify, now, persistent}
 * - storage: a Storage-like object or null (falls back to memory; never throws).
 * - seed: () => State (default createSeedState).
 */
export function createStore({ storage = safeLocalStorage(), key = STORAGE_KEY, seed = createSeedState } = {}) {
  let persistent = false;
  if (storage) {
    try {
      const probe = `${key}.__probe__`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      persistent = true;
      if (key === STORAGE_KEY) for (const old of LEGACY_KEYS) storage.removeItem(old);
    } catch {
      persistent = false;
    }
  }

  let state = null;
  if (persistent) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) state = normalizeLoaded(parsed);
      }
    } catch {
      state = null; // corrupt or unreadable → fresh seed
    }
  }
  if (!state) state = seed();

  const subs = new Set();

  function save() {
    if (!persistent) return;
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch {
      persistent = false; // quota or access error → keep running in memory
    }
  }
  function emit() {
    for (const fn of [...subs]) {
      try { fn(state); } catch (e) { console.error('store subscriber failed', e); }
    }
  }

  const api = {
    get: () => state,
    /**
     * set(mutator, meta?) — clones, mutates, appends an audit row when meta {action, target, ...}
     * is given, persists, then notifies. Returns the mutator's return value.
     */
    set(mutator, meta) {
      const draft = structuredClone(state);
      const result = mutator(draft);
      if (meta) appendAudit(draft, meta);
      state = draft;
      save();
      emit();
      return result;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    reset() {
      state = seed();
      save();
      emit();
    },
    notify(text, link = null) {
      return api.set((d) => pushNotification(d, text, link));
    },
    now: () => nowOf(state),
    get persistent() { return persistent; },
  };
  save(); // a fresh seed is persisted immediately so a reload keeps the same state
  return api;
}
