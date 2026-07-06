import type { PetConfig } from '../types';

/**
 * Usagi (roll) — a seamless image-sequence pet whose resting pose is frame 1 of
 * the hand-rolling sequence (paws up in front). Idle holds that frame and the
 * roll plays from/to it, so the main (breathing) animation and the roll share
 * the same artwork → the transition is seamless with no pop.
 *
 * Internal animation variant, not a separate user-facing character.
 */
const PET: PetConfig = {
  id: 'usagi-roll',
  name: 'Usagi (roll)',
  nameZh: '乌萨奇（转手版）',
  nameJa: 'うさぎ（手回し版）',
  kind: 'image-sequence',
  aspect: 600 / 910, // re-canvased to match body.png
  natural: { w: 600, h: 910 },
  frames: {
    base: 'images/usagi_roll/usagi_roll_',
    count: 11,
    pad: 2,
    ext: '.webp',
    start: 1,
  },
  idle: 0, // frame 1 (usagi_roll_01) is the resting pose
  eyes: [
    // measured from normalized usagi_roll_01 pupils
    { x: 0.284, y: 0.481, w: 0.1, h: 0.076 },
    { x: 0.511, y: 0.495, w: 0.1, h: 0.076 },
  ],
  lid: 'rgb(252,244,231)', // matches the face fill in the new art
  actions: {
    roll: { fps: 11, loops: 2, base: '', count: 11, pad: 2, ext: '.webp', start: 1 },
  },
};

export default PET;
