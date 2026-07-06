import { Util } from './util';
import type { AssetURLFn, AudioChannel, AudioHandleLike } from './types';

const DEFAULT_CHANNEL: AudioChannel = 'action';

/**
 * AudioEngine — 音频播放能力的统一管理者。
 *
 * 无论是 ActionEngine（动作 BGM）还是 SpeechEngine（对话配音），
 * 播放音频都必须经由 AudioEngine，由其统一负责：
 *   - 资源解析（assetURL → data URL）
 *   - 通道隔离（action / speech 双通道，互不抢占）
 *   - 播放开关（setEnabled / isEnabled，关闭时静音并阻止后续播放）
 *   - 句柄生命周期（AudioHandle 的创建与通道回收）
 */
export class AudioHandle implements AudioHandleLike {
  public id: string;
  public channel: AudioChannel;
  private _el: HTMLAudioElement;
  private _engine: AudioEngine;
  private _ended: ((...args: unknown[]) => void) | null = null;
  private _error: ((...args: unknown[]) => void) | null = null;
  private _metadata: ((ms: number | null) => void) | null = null;

  public constructor(el: HTMLAudioElement, channel: AudioChannel, engine: AudioEngine) {
    this.id = 'audio-' + ++engine._nextId;
    this.channel = channel;
    this._el = el;
    this._engine = engine;
  }

  public play(): Promise<void> {
    return this._el.play();
  }

  public stop(): void {
    if (this._ended) {
      this._el.onended = null;
      this._ended = null;
    }
    if (this._error) {
      this._el.onerror = null;
      this._error = null;
    }
    if (this._metadata) {
      this._el.onloadedmetadata = null;
      this._metadata = null;
    }
    this._el.pause();
    this._engine._clearChannel(this.channel, this);
  }

  public onEnded(cb: () => void): void {
    this._ended = cb as (...args: unknown[]) => void;
    const self = this;
    this._el.onended = function () {
      self._engine._clearChannel(self.channel, self);
      cb();
    };
  }

  public onError(cb: () => void): void {
    this._error = cb as (...args: unknown[]) => void;
    const self = this;
    this._el.onerror = function () {
      self._engine._clearChannel(self.channel, self);
      cb();
    };
  }

  public onLoadedMetadata(cb: (ms: number | null) => void): void {
    this._metadata = cb;
    const el = this._el;
    this._el.onloadedmetadata = function () {
      const ms = isFinite(el.duration) ? el.duration * 1000 : null;
      cb(ms);
    };
    if (this._el.readyState >= 1 && isFinite(this._el.duration)) {
      cb(this._el.duration * 1000);
    }
  }

  public getDurationMs(): number | null {
    return isFinite(this._el.duration) ? this._el.duration * 1000 : null;
  }
}

export class AudioEngine {
  private _assetURL: AssetURLFn;
  public _channels: { action: AudioHandle | null; speech: AudioHandle | null };
  public _nextId: number;
  private _enabled: boolean;

  public constructor(opts?: { assetURL?: AssetURLFn }) {
    opts = opts || {};
    this._assetURL = opts.assetURL || Util.assetURL;
    this._channels = { action: null, speech: null };
    this._nextId = 0;
    this._enabled = true;
  }

  /** 通道槽位回收（仅当当前槽位仍指向该 handle 时清理）。 */
  public _clearChannel(name: AudioChannel, handle: AudioHandle): void {
    if (this._channels[name] === handle) this._channels[name] = null;
  }

  private _stopChannel(name: AudioChannel): void {
    const handle = this._channels[name];
    if (!handle) return;
    handle.stop();
    this._channels[name] = null;
  }

  /**
   * 播放指定路径的音频到指定通道。
   * 关闭状态（!isEnabled）或资源缺失时返回 null，由上层走兜底逻辑
   * （对话回退到 duration 计时、动作回退到帧循环）。
   */
  public play(path: string, channel?: AudioChannel): AudioHandle | null {
    if (!this._enabled) return null;
    const ch = channel || DEFAULT_CHANNEL;
    const src = this._assetURL(path);
    if (!src) return null;

    this._stopChannel(ch);

    const el = new Audio(src);
    const handle = new AudioHandle(el, ch, this);
    this._channels[ch] = handle;
    return handle;
  }

  public playAction(path: string): AudioHandle | null {
    return this.play(path, 'action');
  }

  public playSpeech(path: string): AudioHandle | null {
    return this.play(path, 'speech');
  }

  public stopAll(): void {
    this._stopChannel('action');
    this._stopChannel('speech');
  }

  public stopAction(): void {
    this._stopChannel('action');
  }

  public stopSpeech(): void {
    this._stopChannel('speech');
  }

  /** 关闭音频播放能力：立即静音当前所有通道，并阻止后续 play。 */
  public setEnabled(on: boolean): void {
    this._enabled = !!on;
    if (!this._enabled) this.stopAll();
  }

  public isEnabled(): boolean {
    return this._enabled;
  }

  /** True when assetURL resolves to a loadable src (typically a data URL from pak). */
  public canPlay(path: string): boolean {
    return !!this._assetURL(path);
  }
}
