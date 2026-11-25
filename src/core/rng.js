// Deterministic PRNG for the seed and demo codes. Never Math.random() in domain logic.

/** mulberry32: 32-bit seeded generator → () => float in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
/** Weighted pick from [[value, weight], ...]. */
export function pickWeighted(rng, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[pairs.length - 1][0];
}
/** Fisher–Yates shuffle (returns a new array). */
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Stable 32-bit hash of a string (FNV-1a), for seeding. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const B62 = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** Non-guessable-looking token from a seeded generator (demo only). */
export function tokenFrom(rng, len = 22) {
  let s = '';
  for (let i = 0; i < len; i++) s += B62[Math.floor(rng() * B62.length)];
  return s;
}
