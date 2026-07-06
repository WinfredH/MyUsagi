import type { PetConfig } from '../types';

/**
 * Usagi (default) — the front-standing pose: a body layer plus separate ear
 * layers and CSS eyelids, so it can blink and wiggle each ear on its own.
 * Artwork ships encrypted in webview/assets.pak (rebuild with `myusagi pack`).
 *
 * Double-click (or click the paws) plays the hand-rolling action as an overlay;
 * the roll frames share this same 600x910 framing so the rabbit keeps its
 * on-screen size through the switch. The image-sequence variant is internal and
 * only exists to keep the hand-rolling transition seamless.
 */
const PET: PetConfig = {
  id: 'usagi',
  name: 'Usagi',
  nameZh: '乌萨奇',
  nameJa: 'うさぎ',
  kind: 'image-layered',
  aspect: 600 / 910,
  natural: { w: 600, h: 910 },
  articulated: true,
  body: 'images/usagi/body.webp',
  ears: [
    {
      src: 'images/usagi/ear-left.webp',
      side: 'l',
      box: { x: 0.30333, y: 0.04945, w: 0.19833, h: 0.25824 },
      origin: { x: 0.48319, y: 1.0 },
    },
    {
      src: 'images/usagi/ear-right.webp',
      side: 'r',
      box: { x: 0.50167, y: 0.04176, w: 0.21333, h: 0.26593 },
      origin: { x: 0.50781, y: 1.0 },
    },
  ],
  eyes: [
    { x: 0.27667, y: 0.48681, w: 0.10667, h: 0.07143 },
    { x: 0.545, y: 0.48242, w: 0.11333, h: 0.07143 },
  ],
  lid: 'rgb(254,243,219)',
  actions: {
    // 11 roll frames re-canvased to 600x910; 11 fps x 2 loops = 2.0s.
    roll: {
      base: 'images/usagi_roll/usagi_roll_',
      count: 11,
      pad: 2,
      ext: '.webp',
      start: 1,
      fps: 11,
      loops: 2,
    },
    // 33 baked frames loop until BGM ends; loops is fallback.
    dance: {
      base: 'images/usagi_dance/usagi_dance_',
      count: 33,
      pad: 2,
      ext: '.webp',
      start: 1,
      fps: 7,
      loops: 2,
      loopUntil: 'audio',
      audio: 'audio/usagi_dance.mp3',
      // Wider canvas (840x910) + matching container aspect — no CSS scaleX stretch.
      layoutPad: { aspect: 840 / 910 },
    },
  },
  // Run cycle: 6 frames re-canvased to 735x960. Facing flipped by renderer.
  walk: {
    base: 'images/usagi_run/usagi_run_',
    count: 6,
    pad: 2,
    ext: '.webp',
    start: 1,
    fps: 9,
  },
};

export default PET;
