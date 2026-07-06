import type { PetConfig } from '../types';

/**
 * Minimal pet registry shared across the renderer.
 *
 * Pets self-register via `PetRegistry.register` (or are registered by the
 * renderer entry). Static singleton — no instances.
 */
export class PetRegistry {
  private static _pets: Record<string, PetConfig> = {};

  public static register(p: PetConfig): PetConfig {
    this._pets[p.id] = p;
    return p;
  }

  public static get(id: string): PetConfig | undefined {
    return this._pets[id];
  }

  public static ids(): string[] {
    return Object.keys(this._pets);
  }
}
