import type { PetConfig, Region } from './types';

/**
 * Pure hit-region math from normalized pet coordinates (0–1).
 *
 * Stateless: all inputs come from the `pet` config (ears boxes) and the
 * normalized pointer (u, v). Returns the region under the pointer or `null`
 * when the pointer is outside the unit square.
 */
export class RegionUtil {
  public static regionAtNormalized(u: number, v: number, pet: PetConfig): Region | null {
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    if (!pet.ears) return 'body';
    for (let i = 0; i < pet.ears.length; i++) {
      const b = pet.ears[i].box;
      if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) {
        return pet.ears[i].side === 'l' ? 'ear-l' : 'ear-r';
      }
    }
    if (v >= 0.64 && v <= 0.84) {
      if (u <= 0.22) return 'hand-l';
      if (u >= 0.78) return 'hand-r';
    }
    if (v >= 0.34 && v <= 0.62 && u >= 0.2 && u <= 0.8) return 'face';
    return 'body';
  }
}
