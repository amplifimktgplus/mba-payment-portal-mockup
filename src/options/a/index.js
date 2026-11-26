// Option A · Midnight: direction and copy for the options page (2026-11-26).
import { borrowerPhone, borrowerDesktop } from './borrower.js';
import { mbaDesktop, mbaPhone } from './mba.js';

export default {
  id: 'a',
  key: 'A',
  tabLabel: 'Midnight',
  short: 'Option A · Midnight',
  eyebrow: 'Option A',
  name: 'Midnight',
  tagline: 'A private bank at night. Deep navy, slow aurora light in MBA purple and light blue behind frosted glass, and the numbers that matter as the heroes.',
  points: [
    'Dark, immersive canvas that keeps every figure crisp and high-contrast.',
    'The amount due sits on a glass card with the next installments stacked behind it.',
    'One bright pill button per screen for the main action; everything else stays quiet.',
    'Selected and important items get a thin glowing edge in the brand gradient.',
  ],
  effects: ['Aurora light', 'Count-up figures', 'Stacked cards', 'Glow edges', 'Pointer spotlight', 'Keypad press', 'Receipt print', 'Drawn charts', 'Staggered lists'],
  statusBar: 'light',
  sections: { borrowerPhone, borrowerDesktop, mbaDesktop, mbaPhone },
};
