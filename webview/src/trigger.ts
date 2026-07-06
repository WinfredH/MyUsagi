import { Util } from './util';
import type {
  ActionEngineLike,
  AudioEngineLike,
  CharacterEngineLike,
  Intent,
  Lang,
  PetConfig,
  PetrAPI,
  Region,
  SpeechEngineLike,
} from './types';

const HOVER_DANCE_MS = 3000;

interface DragState {
  active: boolean;
  moved: boolean;
  sx: number;
  sy: number;
  lastX: number;
  lastT: number;
  vx: number;
}

interface TriggerHubOpts {
  character: CharacterEngineLike;
  actionEngine: ActionEngineLike;
  speechEngine: SpeechEngineLike;
  audio: AudioEngineLike;
  petAPI: PetrAPI | null;
  pet: PetConfig;
  followEnabled?: boolean;
}

/**
 * TriggerHub — input sources, idle timers, intent dispatch with guards.
 *
 * Sole dispatcher of Intents. Consumes: pointer events (move/down/up/blur/
 * dblclick/contextmenu), idle timers (action + speech), hover-3s → dance,
 * and IPC events routed through PetrAPI. Enforces IntentGuard mutex via
 * `canDispatch`.
 */
export class TriggerHub {
  public static canDispatch(
    intent: Intent,
    actionEngine: ActionEngineLike,
    character: CharacterEngineLike,
    followEnabled = false,
  ): boolean {
    if (character.isDragging()) {
      if (intent.kind === 'character.look') return true;
      if (intent.kind === 'character.walk') return true;
      if (intent.kind === 'character.scale') return true;
      if (intent.kind === 'character.lang') return true;
      return false;
    }
    if (followEnabled) {
      if (intent.kind === 'character.look') return true;
      if (intent.kind === 'character.walk') return true;
      if (intent.kind === 'character.scale') return true;
      if (intent.kind === 'character.lang') return true;
      if (intent.kind === 'character.blink') return true;
      if (intent.kind === 'character.wobble') return true;
      if (intent.kind === 'action.stop') return true;
      if (intent.kind === 'action.play' && intent.name === 'walk') {
        if (actionEngine.isWalking()) return true;
        return !actionEngine.isOverlayBusy() && !actionEngine.isProceduralBusy();
      }
      if (
        intent.kind === 'action.play' ||
        intent.kind === 'character.part' ||
        intent.kind === 'character.speech'
      ) {
        return false;
      }
    }
    if (intent.kind === 'action.play') {
      if (intent.name === 'walk') {
        if (actionEngine.isWalking()) return true;
        return !actionEngine.isBusy();
      }
      if (actionEngine.isOverlayBusy()) return false;
      if (actionEngine.isProceduralBusy()) return false;
      return true;
    }
    if (intent.kind === 'character.part') {
      if (actionEngine.isOverlayBusy()) return false;
      if (actionEngine.isProceduralBusy()) return false;
      return true;
    }
    if (intent.kind === 'character.speech') {
      return !actionEngine.isDancing();
    }
    return true;
  }

  private _character: CharacterEngineLike;
  private _actionEngine: ActionEngineLike;
  private _speechEngine: SpeechEngineLike;
  private _audio: AudioEngineLike;
  private _petAPI: PetrAPI | null;
  private _pet: PetConfig;

  private _ignoring = true;
  private _ignoreBusy = false;
  private _drag: DragState = {
    active: false,
    moved: false,
    sx: 0,
    sy: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
  };
  private _pendingHop: ReturnType<typeof setTimeout> | null = null;
  private _hoverDanceTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverDanceLast = { x: -1, y: -1 };
  private _followEnabled: boolean;

  public constructor(opts: TriggerHubOpts) {
    this._character = opts.character;
    this._actionEngine = opts.actionEngine;
    this._speechEngine = opts.speechEngine;
    this._audio = opts.audio;
    this._petAPI = opts.petAPI;
    this._pet = opts.pet;
    this._followEnabled = opts.followEnabled ?? true;
  }

  private _clearHoverDanceTimer(): void {
    if (this._hoverDanceTimer) {
      clearTimeout(this._hoverDanceTimer);
      this._hoverDanceTimer = null;
    }
  }

  private _canArmHoverDance(): boolean {
    return (
      !!this._pet.actions &&
      !!this._pet.actions.dance &&
      !this._followEnabled &&
      !this._drag.active &&
      !this._character.isDragging() &&
      !this._actionEngine.isBusy()
    );
  }

  private _updateHoverDance(cx: number, cy: number): void {
    if (!this._canArmHoverDance()) {
      this._clearHoverDanceTimer();
      this._hoverDanceLast.x = -1;
      this._hoverDanceLast.y = -1;
      return;
    }
    if (!this._character.overPet(cx, cy)) {
      this._clearHoverDanceTimer();
      this._hoverDanceLast.x = -1;
      this._hoverDanceLast.y = -1;
      return;
    }
    if (this._hoverDanceTimer) return;
    this._hoverDanceLast.x = cx;
    this._hoverDanceLast.y = cy;
    this._hoverDanceTimer = setTimeout(() => {
      this._hoverDanceTimer = null;
      const lx = this._hoverDanceLast.x;
      const ly = this._hoverDanceLast.y;
      if (!this._canArmHoverDance()) return;
      if (lx < 0 || !this._character.overPet(lx, ly)) return;
      this.dispatch({ kind: 'action.play', name: 'dance', source: 'hover' });
    }, HOVER_DANCE_MS);
  }

  public dispatch(intent: Intent): boolean {
    if (!TriggerHub.canDispatch(intent, this._actionEngine, this._character, this._followEnabled)) {
      return false;
    }

    if (intent.kind === 'action.play' || intent.kind === 'action.stop') {
      return this._actionEngine.handleIntent(intent);
    }

    if (intent.kind === 'character.part') {
      const region = intent.region as Region;
      if (region === 'hand-l' || region === 'hand-r') {
        return this._actionEngine.handleIntent({
          kind: 'action.play',
          name: 'roll',
          source: intent.source || 'click-hand',
        });
      }
      if (region === 'body') {
        this._actionEngine.handleIntent({
          kind: 'action.play',
          name: 'hop',
          source: intent.source || 'click-body',
        });
        // Speech is fired synchronously on mouseup (click-action) to keep user activation.
        if (intent.source !== 'click-action' && !this._actionEngine.isDancing() && !this._followEnabled) {
          this._speechEngine.handleIntent({
            kind: 'character.speech',
            source: intent.source || 'click-body',
          });
        }
        return true;
      }
      return this._character.handleIntent(intent);
    }

    if (intent.kind === 'character.speech') {
      return this._speechEngine.handleIntent(intent);
    }

    if (intent.kind === 'character.lang') {
      this._character.handleIntent(intent);
      if (intent.code) this._speechEngine.setLang(intent.code);
      return true;
    }

    return this._character.handleIntent(intent);
  }

  private _setIgnore(ig: boolean): void {
    if (ig === this._ignoring || this._ignoreBusy) return;
    if (!this._petAPI) return;
    this._ignoreBusy = true;
    this._petAPI
      .setIgnore(ig)
      .then(() => {
        this._ignoring = ig;
      })
      .catch(() => {
        /* keep prior state on IPC failure */
      })
      .finally(() => {
        this._ignoreBusy = false;
      });
  }

  private _onMouseMove = (e: MouseEvent): void => {
    if (this._drag.active) {
      if (Math.abs(e.screenX - this._drag.sx) + Math.abs(e.screenY - this._drag.sy) > 4)
        this._drag.moved = true;
      const t = Util.now();
      if (t > this._drag.lastT)
        this._drag.vx = ((e.screenX - this._drag.lastX) / (t - this._drag.lastT)) * 16;
      this._drag.lastX = e.screenX;
      this._drag.lastT = t;
      this._character.setDragVelocity(this._drag.vx);
      if (this._petAPI) this._petAPI.dragMove(e.screenX, e.screenY);
      return;
    }
    this._setIgnore(!this._character.overPet(e.clientX, e.clientY));
    this._updateHoverDance(e.clientX, e.clientY);
  };

  private _onMouseDown = (e: MouseEvent): void => {
    this._clearHoverDanceTimer();
    if (e.button !== 0 || !this._character.overPet(e.clientX, e.clientY)) return;
    this._drag.active = true;
    this._drag.moved = false;
    this._drag.sx = e.screenX;
    this._drag.sy = e.screenY;
    this._drag.lastX = e.screenX;
    this._drag.lastT = Util.now();
    this._drag.vx = 0;
    this._character.setDragging(true, 0);
    if (this._petAPI) this._petAPI.dragStart(e.screenX, e.screenY);
    e.preventDefault();
  };

  private _onMouseUp = (e: MouseEvent): void => {
    if (!this._drag.active) return;
    this._drag.active = false;
    this._character.setDragging(false, this._drag.vx);
    if (this._petAPI) this._petAPI.dragEnd();
    if (this._drag.moved) {
      this.dispatch({
        kind: 'character.wobble',
        amp: 0.7 * Util.clamp(Math.abs(this._drag.vx) / 12, 0.3, 1),
        source: 'drag',
      });
    } else {
      if (this._pendingHop) clearTimeout(this._pendingHop);
      const reg = this._character.regionAt(e.clientX, e.clientY);
      if (reg === 'face' || reg === 'ear-l' || reg === 'ear-r' || reg === 'body') {
        if (!this._actionEngine.isDancing() && !this._followEnabled) {
          this._speechEngine.handleIntent({ kind: 'character.speech', source: 'click' });
        }
      }
      this._pendingHop = setTimeout(() => {
        this.dispatch({
          kind: 'character.part',
          region: reg || undefined,
          source: 'click-action',
        });
      }, 240);
    }
    this._setIgnore(!this._character.overPet(e.clientX, e.clientY));
  };

  private _onBlur = (): void => {
    if (!this._drag.active) return;
    this._drag.active = false;
    this._character.setDragging(false, 0);
    if (this._petAPI) this._petAPI.dragEnd();
  };

  private _onDblClick = (e: MouseEvent): void => {
    if (!this._character.overPet(e.clientX, e.clientY)) return;
    if (this._pendingHop) clearTimeout(this._pendingHop);
    this.dispatch({ kind: 'action.play', name: 'roll', source: 'dblclick' });
  };

  private _onContextMenu = (e: MouseEvent): void => {
    if (!this._character.overPet(e.clientX, e.clientY)) return;
    e.preventDefault();
    if (this._petAPI) this._petAPI.openMenu();
  };

  private _idleLoop = (): void => {
    const wait = 2600 + Math.random() * 3200;
    setTimeout(() => {
      if (!this._character.isDragging() && !this._followEnabled && !this._actionEngine.isBusy()) {
        if (this._pet.actions && this._pet.actions.roll && Math.random() < 0.12) {
          this.dispatch({ kind: 'action.play', name: 'roll', source: 'idle' });
        } else if (this._character.canBlink() && Math.random() < 0.82) {
          this.dispatch({ kind: 'character.blink', source: 'idle' });
        } else if (Math.random() < 0.25) {
          this.dispatch({ kind: 'character.wobble', amp: 0.4, source: 'idle' });
        }
      }
      this._idleLoop();
    }, wait);
  };

  private _speechLoop = (): void => {
    const wait = 8000 + Math.random() * 14000;
    setTimeout(() => {
      if (
        !this._character.isDragging() &&
        !this._followEnabled &&
        !this._actionEngine.isBusy() &&
        !this._actionEngine.isDancing() &&
        document.visibilityState !== 'hidden'
      ) {
        this.dispatch({ kind: 'character.speech', source: 'idle-chatter' });
      }
      this._speechLoop();
    }, wait);
  };

  private _bindIPC(): void {
    const petAPI = this._petAPI;
    if (!petAPI) return;

    petAPI.onCursorMove((p) => {
      if (!this._drag.active) {
        this._setIgnore(!this._character.overPet(p.x, p.y));
        this._updateHoverDance(p.x, p.y);
      }
    });

    petAPI.onReact((type) => {
      this.dispatch({ kind: 'action.play', name: type, source: 'menu' });
    });

    petAPI.onLook((v) => {
      this.dispatch({ kind: 'character.look', dx: v.dx, dy: v.dy, source: 'rust' });
    });

    petAPI.onWalk((v) => {
      if (this._actionEngine.isOverlayBusy() || this._actionEngine.isProceduralBusy()) return;
      const facing = v.dir < 0 ? 1 : -1;
      this.dispatch({
        kind: 'character.walk',
        active: true,
        dir: v.dir,
        walkDy: v.dy,
        facing,
        source: 'rust',
      });
      this.dispatch({ kind: 'action.play', name: 'walk', source: 'rust-walk' });
    });

    petAPI.onWalkStop(() => {
      this.dispatch({ kind: 'action.stop', name: 'walk', source: 'rust' });
      this.dispatch({ kind: 'character.walk', active: false, facing: 1, source: 'rust' });
    });

    petAPI.onScale((h) => {
      this.dispatch({ kind: 'character.scale', height: h, source: 'menu' });
    });

    petAPI.onLang((l) => {
      const code: Lang = l === 'en' || l === 'ja' ? l : 'zh';
      this.dispatch({ kind: 'character.lang', code, source: 'menu' });
    });

    petAPI.onFollowEnabled((on) => {
      this._followEnabled = on;
      if (on) {
        this._clearHoverDanceTimer();
        if (this._actionEngine.isOverlayBusy() || this._actionEngine.isProceduralBusy()) {
          this._actionEngine.stopInterruptibleActions();
        }
        this._speechEngine.stop();
      }
    });

    petAPI.onAudioEnabled((on) => {
      this._audio.setEnabled(on);
    });
  }

  public start(): void {
    window.addEventListener('mousemove', this._onMouseMove, true);
    window.addEventListener('mousedown', this._onMouseDown, true);
    window.addEventListener('mouseup', this._onMouseUp, true);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('dblclick', this._onDblClick, true);
    window.addEventListener('contextmenu', this._onContextMenu, true);
    this._bindIPC();
    this._idleLoop();
    this._speechLoop();
  }

  public stop(): void {
    /* reserved for teardown */
  }
}
