// Option B · Daylight: direction and copy for the options page (2026-11-26).
import { borrowerPhone, borrowerDesktop } from './borrower.js';
import { mbaDesktop, mbaPhone } from './mba.js';

export default {
  id: 'b',
  key: 'B',
  tabLabel: 'Daylight',
  short: 'Option B · Daylight',
  eyebrow: 'Option B',
  name: 'Daylight',
  tagline: 'Bright, confident and friendly. A light canvas, big editorial type, chunky rounded tiles, and one vivid MBA-gradient block per screen carrying the key number.',
  points: [
    'Light, airy layout that reads well outdoors on a phone.',
    'One bold gradient block per screen holds the number that matters most.',
    'Dark ink pill buttons and rounded quick-action tiles you can hit with a thumb.',
    'Bento tiles in the back office, so each metric gets its own space.',
  ],
  effects: ['Moving gradient block', 'Count-up figures', 'Pull-tab reveal', 'Springy presses', 'Growing bars', 'Segmented progress', 'Stamp check', 'Staggered tiles'],
  statusBar: 'dark',
  sections: { borrowerPhone, borrowerDesktop, mbaDesktop, mbaPhone },
};
