import { Util } from './util';
import type {
  ActionContext,
  ActionDefinition,
  ActionEngineLike,
  AssetURLFn,
  AudioEngineLike,
  AudioHandleLike,
  CharacterEngineLike,
  FrameSpec,
  Intent,
  PetConfig,
  SpeechEngineLike,
} from './types';

interface ActionEngineOpts {
  pet: PetConfig;
  character: CharacterEngineLike;
  audio: AudioEngineLike;
  speechEngine: SpeechEngineLike;
  assetURL?: AssetURLFn;
}

const HOP_BUSY_MS = 640;

/**
 * ActionEngine — action registry, frame playback, sustained walk, audio sync.
 *
 * Walk, overlay actions (roll/dance), and procedural hop are fully mutually
 * exclusive. Starting a non-walk action preempts walk; walk cannot start while
 * any other action is active. All audio playback goes through AudioEngine.
 */
export class ActionEngine implements ActionEngineLike {
  private _pet: PetConfig;
  private _character: CharacterEngineLike;
  private _audio: AudioEngineLike;
  private _speechEngine: SpeechEngineLike;
  private _assetURL: AssetURLFn;

  private _isSeq: boolean;
  private _registry: Record<string, ActionDefinition> = {};
  private _actionFrames: Record<string, HTMLImageElement[]> = {};
  private _runFrames: HTMLImageElement[] = [];
  private _overlayAction: string | null = null;
  private _sustainedAction: string | null = null;
  private _actTimer: ReturnType<typeof setTimeout> | null = null;
  private _audioHandle: AudioHandleLike | null = null;
  private _sustainedTimer: ReturnType<typeof setTimeout> | null = null;
  private _sustainedIdx = 0;
  private _sustainedActive = false;
  private _proceduralBusy = false;
  private _proceduralTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(opts: ActionEngineOpts) {
    this._pet = opts.pet;
    this._character = opts.character;
    this._audio = opts.audio;
    this._speechEngine = opts.speechEngine;
    this._assetURL = opts.assetURL || Util.assetURL;

    this._isSeq = this._character.isSeq;

    this._buildBuiltinRoll();
    this._buildBuiltinDance();
    this._buildBuiltinHop();
    this._buildBuiltinWalk();
    this._autoRegisterFromPet();

    if (this._pet.actions && !this._isSeq) {
      Object.keys(this._pet.actions).forEach((name) => {
        const def = this._registry[name];
        if (def && def.resolveConfig) {
          this._preloadOverlayFrames(name, def.resolveConfig(this._pet));
        }
      });
    }

    if (this._pet.walk) {
      this._runFrames = Util.loadFrameSequence(this._pet.walk, this._assetURL);
    }
  }

  private _ctx(): ActionContext {
    return {
      pet: this._pet,
      character: this._character,
      audio: this._audio,
      speechEngine: this._speechEngine,
    };
  }

  private _clearActTimer(): void {
    if (this._actTimer) {
      clearTimeout(this._actTimer);
      this._actTimer = null;
    }
  }

  private _clearSustainedTimer(): void {
    if (this._sustainedTimer) {
      clearTimeout(this._sustainedTimer);
      this._sustainedTimer = null;
    }
  }

  private _clearProceduralTimer(): void {
    if (this._proceduralTimer) {
      clearTimeout(this._proceduralTimer);
      this._proceduralTimer = null;
    }
  }

  private _beginProceduralBusy(ms: number): void {
    this._clearProceduralTimer();
    this._proceduralBusy = true;
    this._proceduralTimer = setTimeout(() => {
      this._proceduralBusy = false;
      this._proceduralTimer = null;
    }, ms);
  }

  private _applyActionLayout(name: string): void {
    const def = this._registry[name];
    if (!def || !def.resolveConfig) return;
    const config = def.resolveConfig(this._pet);
    if (config && config.layoutPad) this._character.setLayoutPad(config.layoutPad);
  }

  private _stopOverlayAction(): void {
    this._clearActTimer();
    if (this._audioHandle) {
      this._audioHandle.stop();
      this._audioHandle = null;
    }
    this._audio.stopAction();

    const stopping = this._overlayAction;
    this._character.setLayoutPad(null);

    if (stopping) {
      const def = this._registry[stopping];
      if (def && def.onStop) def.onStop(this._ctx());
    }

    if (this._isSeq) {
      this._character.resetSequenceIdle();
    } else if (stopping) {
      this._character.setVisualMode(this._sustainedAction ? 'running' : 'idle');
    }

    this._overlayAction = null;
  }

  private _stopSustainedInternal(): void {
    this._clearSustainedTimer();
    this._sustainedActive = false;
    if (this._sustainedAction) {
      const stopping = this._sustainedAction;
      const def = this._registry[stopping];
      if (def && def.onStop) def.onStop(this._ctx());
      if (stopping === 'walk') {
        this._character.setWalkState({ active: false });
      }
      this._sustainedAction = null;
      if (!this._overlayAction) this._character.setVisualMode('idle');
    }
  }

  private _preemptWalk(): void {
    if (this._sustainedAction !== 'walk') return;
    this._stopSustainedInternal();
  }

  public stopCurrentAction(): void {
    this._stopOverlayAction();
    this._stopSustainedInternal();
    this._clearProceduralTimer();
    this._proceduralBusy = false;
  }

  public stopInterruptibleActions(): void {
    this._stopOverlayAction();
    this._clearProceduralTimer();
    this._proceduralBusy = false;
  }

  public isOverlayBusy(): boolean {
    return this._overlayAction != null;
  }

  public isWalking(): boolean {
    return this._sustainedAction != null;
  }

  public isProceduralBusy(): boolean {
    return this._proceduralBusy;
  }

  public isDancing(): boolean {
    return this._overlayAction === 'dance';
  }

  public isBusy(): boolean {
    return this.isOverlayBusy() || this.isWalking() || this.isProceduralBusy();
  }

  public getCurrentAction(): string | null {
    return this._overlayAction || this._sustainedAction;
  }

  public register(name: string, definition: ActionDefinition): void {
    this._registry[name] = definition;
  }

  public unregister(name: string): void {
    delete this._registry[name];
  }

  private _preloadOverlayFrames(name: string, config: FrameSpec | null | undefined): void {
    if (!config || !config.count) return;
    this._actionFrames[name] = Util.loadFrameSequence(config, this._assetURL);
  }

  private _buildBuiltinRoll(): void {
    this.register('roll', {
      kind: 'overlay-frames',
      isBlocking: true,
      resolveConfig: (p) => p.actions && p.actions.roll,
      onStart: (c) => {
        c.character.setVisualMode('acting');
        c.character.clearBlinkForAction();
        if (c.speechEngine) c.speechEngine.presentRollLine();
        else c.character.say('…', 2000);
      },
      onStop: () => {
        this._character.setVisualMode('idle');
      },
    });
  }

  private _buildBuiltinDance(): void {
    this.register('dance', {
      kind: 'overlay-frames',
      isBlocking: true,
      resolveConfig: (p) => p.actions && p.actions.dance,
      duration: { type: 'audio', pathKey: 'audio' },
      onStart: (c) => {
        this._character.setVisualMode('acting');
        this._character.clearBlinkForAction();
        c.speechEngine.stop();
      },
      onStop: () => {
        this._character.setVisualMode('idle');
      },
    });
  }

  private _buildBuiltinHop(): void {
    this.register('hop', {
      kind: 'procedural',
      isBlocking: false,
      run: (c) => {
        c.character.triggerHop();
        if (c.character.canBlink()) c.character.triggerHappy(520);
      },
    });
  }

  private _buildBuiltinWalk(): void {
    this.register('walk', {
      kind: 'sustained-overlay',
      isBlocking: true,
      resolveConfig: (p) => p.walk,
      onStart: () => {
        this._character.setVisualMode('running');
      },
      onStop: () => {
        this._character.setVisualMode('idle');
      },
    });
  }

  private _autoRegisterFromPet(): void {
    const actions = this._pet.actions || {};
    Object.keys(actions).forEach((name) => {
      if (this._registry[name]) return;
      const config = actions[name];
      this.register(name, {
        kind: this._isSeq ? 'sequence-inplace' : 'overlay-frames',
        isBlocking: true,
        resolveConfig: () => config,
        duration:
          config.loopUntil === 'audio' ? { type: 'audio', pathKey: 'audio' } : { type: 'loops' },
        onStart: () => {
          this._character.setVisualMode('acting');
          this._character.clearBlinkForAction();
        },
        onStop: () => {
          this._character.setVisualMode('idle');
        },
      });
    });
  }

  private _playOverlayLoop(name: string, config: FrameSpec, frameLimit?: number): void {
    const frames = this._actionFrames[name];
    if (!frames || !frames.length) {
      this._stopOverlayAction();
      return;
    }

    let j = 0;
    const fps = config.fps || 10;
    const total = frameLimit != null ? frameLimit : config.count * (config.loops || 1);

    const step = (): void => {
      if (this._overlayAction !== name) return;
      this._character.setOverlayFrame('action', frames[j % config.count].src);
      j++;
      if (j >= total) {
        this._stopOverlayAction();
        return;
      }
      this._actTimer = setTimeout(step, 1000 / fps);
    };
    step();
  }

  private _playWithAudio(name: string, config: FrameSpec): void {
    const def = this._registry[name];
    const pathKey = def && def.duration && def.duration.type === 'audio' ? def.duration.pathKey : 'audio';
    const path = (config as unknown as Record<string, string | undefined>)[pathKey] || config.audio;
    if (!path) {
      this._playOverlayLoop(name, config);
      return;
    }
    const handle = this._audio.play(path);
    if (!handle) {
      this._playOverlayLoop(name, config);
      return;
    }

    this._audioHandle = handle;
    let j = 0;
    const fps = config.fps || 10;

    const stepAudio = (): void => {
      if (this._overlayAction !== name) return;
      const frames = this._actionFrames[name];
      this._character.setOverlayFrame('action', frames[j % config.count].src);
      j++;
      this._actTimer = setTimeout(stepAudio, 1000 / fps);
    };

    const fallbackLoops = (): void => {
      this._audioHandle = null;
      this._clearActTimer();
      this._playOverlayLoop(name, config);
    };

    handle.onEnded(() => this._stopOverlayAction());
    handle.onError(fallbackLoops);
    const playPromise = handle.play();
    if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
      (playPromise as Promise<void>).catch(fallbackLoops);
    }
    stepAudio();
  }

  private _playSequenceInplace(name: string, config: FrameSpec): void {
    const framesSpec = this._pet.frames;
    if (!framesSpec) return;
    const n = framesSpec.count;
    const total = n * (config.loops || 1);
    let i = 0;
    const fps = config.fps || 10;
    const idleIdx = this._pet.idle || 0;
    const frames = this._character.seqFrames;

    this._character.clearBlinkForAction();

    const step = (): void => {
      if (this._overlayAction !== name) return;
      this._character.setSequenceFrame(frames[i % n].src);
      i++;
      if (i >= total) {
        this._character.setSequenceFrame(frames[idleIdx].src);
        this._stopOverlayAction();
        return;
      }
      this._actTimer = setTimeout(step, 1000 / fps);
    };
    step();
  }

  private _startSustained(name: string): boolean {
    const def = this._registry[name];
    if (!def || !def.resolveConfig) return false;
    const config = def.resolveConfig(this._pet);
    if (!config || !this._runFrames.length) return false;

    if (def.onStart) def.onStart(this._ctx());
    this._sustainedActive = true;
    this._sustainedIdx = 0;
    const fps = config.fps || 9;

    const step = (): void => {
      if (!this._sustainedActive || this._sustainedAction !== name) return;
      this._character.setOverlayFrame('run', this._runFrames[this._sustainedIdx % config.count].src);
      this._sustainedIdx++;
      this._sustainedTimer = setTimeout(step, 1000 / fps);
    };
    step();
    return true;
  }

  private _stopSustained(name: string): void {
    if (this._sustainedAction !== name) return;
    this._stopSustainedInternal();
  }

  private _playBlocking(name: string): boolean {
    const def = this._registry[name];
    if (!def) return false;

    const config = def.resolveConfig ? def.resolveConfig(this._pet) : null;
    if (def.kind !== 'procedural' && def.kind !== 'sustained-overlay' && !config) return false;

    if (def.kind === 'procedural') {
      if (def.run) def.run(this._ctx());
      this._beginProceduralBusy(HOP_BUSY_MS);
      return true;
    }

    if (def.kind === 'sustained-overlay') {
      if (this.isOverlayBusy() || this.isProceduralBusy()) return false;
      if (this._sustainedAction === name) return true;
      this._stopSustainedInternal();
      this._sustainedAction = name;
      return this._startSustained(name);
    }

    if (this._overlayAction) this._stopOverlayAction();
    this._preemptWalk();

    this._overlayAction = name;

    this._applyActionLayout(name);
    if (def.onStart) def.onStart(this._ctx());

    if (def.kind === 'sequence-inplace' && config) {
      this._playSequenceInplace(name, config);
      return true;
    }

    if (
      config &&
      def.duration &&
      def.duration.type === 'audio' &&
      config.loopUntil === 'audio' &&
      config.audio
    ) {
      this._playWithAudio(name, config);
      return true;
    }

    if (config) this._playOverlayLoop(name, config);
    return true;
  }

  public handleIntent(intent: Intent): boolean {
    if (intent.kind === 'action.stop') {
      if (intent.name === 'walk') this._stopSustained('walk');
      else this._stopOverlayAction();
      return true;
    }

    if (intent.kind !== 'action.play') return false;

    const name = intent.name;
    if (!name) return false;
    const def = this._registry[name];
    if (!def) return false;

    if (this._character.isDragging()) return false;

    if (def.kind === 'sustained-overlay') {
      if (this.isOverlayBusy() || this.isProceduralBusy()) return false;
      return this._playBlocking(name);
    }

    this._preemptWalk();

    if (def.kind === 'procedural') {
      if (this.isOverlayBusy()) return false;
      return this._playBlocking(name);
    }

    if (this.isOverlayBusy()) return false;
    return this._playBlocking(name);
  }
}
