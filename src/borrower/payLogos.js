// Payment-method marks for the B4 "Choose how to pay" tiles. The product owner asked for the real
// logos on 2026-11-26. That replaces the earlier "no provider logos" rule, but PayMongo's own logo
// is still never shown. Sources and licences are in src/assets/pay/CREDITS.md. Marks are drawn only
// through <img> data URLs, so an SVG can't run script or fetch anything.
import gcashSvg from '../assets/pay/gcash.svg';
import mayaSvg from '../assets/pay/maya.svg';
import qrphSvg from '../assets/pay/qrph.svg';
import visaSvg from '../assets/pay/visa.svg';
import mastercardSvg from '../assets/pay/mastercard.svg';
import maribankPng from '../assets/pay/maribank.png'; // build.mjs inlines .png as a data URL

const svgUrl = (text) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

/** Method label (as in POLICIES.methods) → its marks, in display order. */
export const METHOD_MARKS = Object.freeze({
  GCash: [{ src: svgUrl(gcashSvg), name: 'GCash' }],
  Maya: [{ src: svgUrl(mayaSvg), name: 'Maya' }],
  'QR Ph': [{ src: svgUrl(qrphSvg), name: 'QR Ph' }],
  Card: [{ src: svgUrl(visaSvg), name: 'Visa' }, { src: svgUrl(mastercardSvg), name: 'Mastercard' }],
  MariBank: [{ src: maribankPng, name: 'MariBank' }],
});

/** Methods that are a category rather than a single brand get a line icon instead of a logo. */
export const METHOD_ICONS = Object.freeze({ 'Online banking': 'bank' });
