import type { AssetURLFn, FrameSpec } from './types';

/**
 * Shared math/resource utilities for PetEngine modules.
 *
 * Pure static methods — no instance state. `assetURL` reads `window.petAPI`
 * lazily so the bundle works both in the Tauri host and in test harnesses
 * that stub the bridge.
 */
export class Util {
  public static clamp(v: number, a: number, b: number): number {
    return v < a ? a : v > b ? b : v;
  }

  public static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  public static easeOut(a: number): number {
    return 1 - Math.pow(1 - a, 3);
  }

  public static now(): number {
    return performance.now();
  }

  public static assetURL(p: string): string {
    const api = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
      petAPI?: { asset?: (p: string) => string | null };
    };
    if (api.petAPI?.asset) {
      const resolved = api.petAPI.asset(p);
      // When the Tauri bundle is loaded, missing keys must not fall back to a
      // relative path (dist/ has no audio/ folder). Callers treat '' as absent.
      return resolved || '';
    }
    return p;
  }

  public static framePath(
    base: string,
    index: number,
    pad: number,
    ext: string,
    start: number,
  ): string {
    return base + String(index + (start || 0)).padStart(pad || 2, '0') + ext;
  }

  public static loadFrameSequence(spec: FrameSpec, assetFn?: AssetURLFn): HTMLImageElement[] {
    const urlFn = assetFn || Util.assetURL;
    const arr: HTMLImageElement[] = [];
    for (let i = 0; i < spec.count; i++) {
      const im = new Image();
      im.src = urlFn(
        Util.framePath(spec.base, i, spec.pad || 2, spec.ext, spec.start || 0),
      );
      arr.push(im);
    }
    return arr;
  }
}
