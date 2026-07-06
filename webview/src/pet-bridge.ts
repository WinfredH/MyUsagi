import type { AssetBundle, Lang, PetrAPI } from './types';

interface TauriCore {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}
interface TauriEvent {
  listen: (
    name: string,
    handler: (e: { payload: unknown }) => void,
  ) => Promise<unknown> | unknown;
}
interface TauriGlobal {
  core: TauriCore;
  event: TauriEvent;
}

/**
 * Tauri bridge — replaces Electron preload.js `window.petAPI`.
 *
 * On construction it subscribes to the Tauri event channels the TriggerHub
 * consumes (pet_react, pet_look, ...). `init()` loads the asset bundle once
 * (data URLs for every encrypted resource) so `asset()` can answer
 * synchronously during rendering.
 *
 * Requires `withGlobalTauri: true` in tauri.conf.json.
 */
export class PetBridge implements PetrAPI {
  private _invoke: TauriCore['invoke'];
  private _listen: TauriEvent['listen'];
  private _bundle: AssetBundle | null = null;
  private _ready: Promise<AssetBundle> | null = null;

  // Callback registry — set by TriggerHub via the on* methods.
  private _onReact: ((type: string) => void) | null = null;
  private _onLook: ((p: { dx: number; dy: number }) => void) | null = null;
  private _onWalk: ((p: { dir: number; dy: number }) => void) | null = null;
  private _onWalkStop: (() => void) | null = null;
  private _onScale: ((h: number) => void) | null = null;
  private _onLang: ((code: Lang) => void) | null = null;
  private _onAudioEnabled: ((on: boolean) => void) | null = null;
  private _onFollowEnabled: ((on: boolean) => void) | null = null;
  private _onCursorMove: ((p: { x: number; y: number }) => void) | null = null;

  public constructor() {
    const tauri = (typeof window !== 'undefined' ? (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ : undefined);
    if (!tauri || !tauri.core || !tauri.event) {
      throw new Error('PetBridge requires window.__TAURI__ (withGlobalTauri: true)');
    }
    this._invoke = tauri.core.invoke;
    this._listen = tauri.event.listen;
    this._subscribeAll();
  }

  private _subscribeAll(): void {
    this._listen('pet_react', (e) => {
      if (this._onReact) this._onReact(e.payload as string);
    });
    this._listen('pet_look', (e) => {
      if (this._onLook) this._onLook(e.payload as { dx: number; dy: number });
    });
    this._listen('pet_walk', (e) => {
      if (this._onWalk) this._onWalk(e.payload as { dir: number; dy: number });
    });
    this._listen('pet_walk_stop', () => {
      if (this._onWalkStop) this._onWalkStop();
    });
    this._listen('scale_set', (e) => {
      if (this._onScale) this._onScale(e.payload as number);
    });
    this._listen('pet_lang', (e) => {
      const code = e.payload as Lang;
      if (this._onLang) this._onLang(code === 'en' || code === 'ja' ? code : 'zh');
    });
    this._listen('audio_enabled', (e) => {
      if (this._onAudioEnabled) this._onAudioEnabled(!!e.payload);
    });
    this._listen('follow_enabled', (e) => {
      if (this._onFollowEnabled) this._onFollowEnabled(!!e.payload);
    });
    this._listen('cursor_move', (e) => {
      if (this._onCursorMove) this._onCursorMove(e.payload as { x: number; y: number });
    });
  }

  public init(): Promise<AssetBundle> {
    if (!this._ready) {
      this._ready = this._invoke('get_asset_bundle').then((b) => {
        const bundle = (b || {}) as AssetBundle;
        this._bundle = bundle;
        return bundle;
      });
    }
    return this._ready;
  }

  public asset(p: string): string | null {
    return (this._bundle && this._bundle[p]) || null;
  }

  public fit(w: number, h: number): Promise<unknown> {
    return this._invoke('fit_window', { w, h });
  }

  public dragStart(x: number, y: number): Promise<unknown> {
    return this._invoke('drag_start', { x, y });
  }

  public dragMove(x: number, y: number): Promise<unknown> {
    return this._invoke('drag_move', { x, y });
  }

  public dragEnd(): Promise<unknown> {
    return this._invoke('drag_end');
  }

  public setIgnore(ignore: boolean): Promise<unknown> {
    return this._invoke('set_ignore_cursor', { ignore });
  }

  public openMenu(): Promise<unknown> {
    return this._invoke('open_menu');
  }

  public quit(): Promise<unknown> {
    return this._invoke('quit_app');
  }

  public onReact(cb: (type: string) => void): void {
    this._onReact = cb;
  }
  public onLook(cb: (p: { dx: number; dy: number }) => void): void {
    this._onLook = cb;
  }
  public onWalk(cb: (p: { dir: number; dy: number }) => void): void {
    this._onWalk = cb;
  }
  public onWalkStop(cb: () => void): void {
    this._onWalkStop = cb;
  }
  public onScale(cb: (h: number) => void): void {
    this._onScale = cb;
  }
  public onLang(cb: (code: Lang) => void): void {
    this._onLang = cb;
  }
  public onAudioEnabled(cb: (on: boolean) => void): void {
    this._onAudioEnabled = cb;
  }
  public onFollowEnabled(cb: (on: boolean) => void): void {
    this._onFollowEnabled = cb;
  }
  public onCursorMove(cb: (p: { x: number; y: number }) => void): void {
    this._onCursorMove = cb;
  }
}

/** Install a PetBridge onto `window.petAPI` (called by renderer). */
export function installPetBridge(bridge: PetBridge): void {
  (window as unknown as { petAPI?: PetrAPI }).petAPI = bridge;
}
