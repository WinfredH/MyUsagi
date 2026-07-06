import { describe, it, expect } from 'vitest';
import { RegionUtil } from '../../src/region';
import usagi from '../../src/pets/usagi';

var usagiPet = usagi;

describe('regionAtNormalized', () => {
  it('detects ear, face, hand, and body regions', () => {
    expect(RegionUtil.regionAtNormalized(0.4, 0.15, usagiPet)).toBe('ear-l');
    expect(RegionUtil.regionAtNormalized(0.6, 0.15, usagiPet)).toBe('ear-r');
    expect(RegionUtil.regionAtNormalized(0.5, 0.5, usagiPet)).toBe('face');
    expect(RegionUtil.regionAtNormalized(0.1, 0.74, usagiPet)).toBe('hand-l');
    expect(RegionUtil.regionAtNormalized(0.9, 0.74, usagiPet)).toBe('hand-r');
    expect(RegionUtil.regionAtNormalized(0.5, 0.9, usagiPet)).toBe('body');
  });

  it('returns null outside normalized bounds', () => {
    expect(RegionUtil.regionAtNormalized(-0.1, 0.5, usagiPet)).toBe(null);
    expect(RegionUtil.regionAtNormalized(1.1, 0.5, usagiPet)).toBe(null);
  });

  it('returns body when pet has no ears', () => {
    expect(RegionUtil.regionAtNormalized(0.5, 0.5, { ears: null })).toBe('body');
  });
});
