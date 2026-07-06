import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { util } from './setup.mjs';

describe('PetEngine.util', () => {
  it('clamp keeps value within bounds', () => {
    assert.equal(util.clamp(5, 0, 10), 5);
    assert.equal(util.clamp(-1, 0, 10), 0);
    assert.equal(util.clamp(99, 0, 10), 10);
  });

  it('lerp interpolates endpoints and midpoint', () => {
    assert.equal(util.lerp(0, 10, 0), 0);
    assert.equal(util.lerp(0, 10, 1), 10);
    assert.equal(util.lerp(0, 10, 0.5), 5);
  });

  it('easeOut maps 0 and 1 to endpoints', () => {
    assert.equal(util.easeOut(0), 0);
    assert.equal(util.easeOut(1), 1);
    assert.ok(util.easeOut(0.5) > 0.5);
  });

  it('framePath builds padded frame filenames', () => {
    assert.equal(util.framePath('img/x_', 0, 2, '.png', 1), 'img/x_01.png');
    assert.equal(
      util.framePath('images/usagi_roll/usagi_roll_', 10, 2, '.png', 1),
      'images/usagi_roll/usagi_roll_11.png'
    );
  });
});
