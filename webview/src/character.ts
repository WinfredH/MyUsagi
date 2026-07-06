import { Util } from './util';
import { RegionUtil } from './region';
import type {
  AssetURLFn,
  CharacterDom,
  CharacterEngineLike,
  Intent,
  Lang,
  LayoutPad,
  PetBox,
  PetConfig,
  Region,
  VisualMode,
} from './types';

const PAD = { top: 0.3, bottom: 0.06, side: 0.24 };

interface EarRuntime {
  el: HTMLImageElement;
  sign: number;
}

interface Motion {
  dragging: boolean;
  dragRot: number;
  hopStart: number;
  wobStart: number;
  wobAmp: number;
  earKick: number[];
  nodStart: number;
  look: { dx: number; dy: number };
  lookCur: { x: number; y: number };
  walking: boolean;
  walkDir: number;
  walkDy: number;
  walkPhase: number;
  facing: number;
}

function pct(n: number): string {
  return n * 100 + '%';
}

/**
 * CharacterEngine — layer composition, visual modes, motion RAF, hit-test,
 * speech bubble view.
 *
 * Owns: visual mode (idle/acting/running), motion state (look/hop/walk/drag/ears),
 * the single `#layer-move` transform, and the alpha hit-test canvas. Does not
 * know about actions, speech data, or menus — those reach it via Intent or
 * public methods.
 */
export class CharacterEngine implements CharacterEngineLike {
  public static readonly SCALES: { small: number; medium: number; large: number } = {
    small: 150,
    medium: 200,
    large: 270,
  };

  public pet: PetConfig;
  public isSeq: boolean;
  public isLayered: boolean;
  public seqFrames: HTMLImageElement[] = [];

  private _scaleH: number;
  private _lang: Lang;
  private _assetURL: AssetURLFn;
  private _onFit: (w: number, h: number) => void;

  private _moveEl: HTMLElement;
  private _tiltEl: HTMLElement;
  private _contentEl: HTMLElement;
  private _speechEl: HTMLElement | null;
  private _speechTextEl: HTMLElement | null;

  private _canBlinkFlag: boolean;

  private _visualMode: VisualMode = 'idle';
  private _ears: EarRuntime[] = [];
  private _seqImg: HTMLImageElement | null = null;
  private _actionImg: HTMLImageElement;
  private _runImg: HTMLImageElement;
  private _hitCtx: CanvasRenderingContext2D | null = null;
  private _hitOK = false;
  private _natW = 1;
  private _natH = 1;
  private _box: PetBox = { left: 0, top: 0, w: 0, h: 0, winW: 0, winH: 0 };
  private _layoutPadOverride: Partial<LayoutPad> | null = null;
  private _partSpeechFn: (() => void) | null = null;
  private _dragVx = 0;
  private _rafId: number | null = null;
  private _motion: Motion;

  private _happyTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(opts: {
    pet: PetConfig;
    scaleH?: number;
    lang?: Lang;
    dom: CharacterDom;
    assetURL?: AssetURLFn;
    onFit?: (w: number, h: number) => void;
  }) {
    this.pet = opts.pet;
    this._scaleH = opts.scaleH || CharacterEngine.SCALES.medium;
    this._lang = opts.lang || 'zh';
    this._assetURL = opts.assetURL || Util.assetURL;
    this._onFit = opts.onFit || function () {};

    this._moveEl = opts.dom.moveEl;
    this._tiltEl = opts.dom.tiltEl;
    this._contentEl = opts.dom.contentEl;
    this._speechEl = opts.dom.speechEl;
    this._speechTextEl = this._speechEl ? this._speechEl.querySelector('.speech-text') : null;

    this.isLayered = this.pet.kind === 'image-layered';
    this.isSeq = this.pet.kind === 'image-sequence';
    this._canBlinkFlag = this.isLayered || this.isSeq;

    this._motion = {
      dragging: false,
      dragRot: 0,
      hopStart: -1,
      wobStart: -1,
      wobAmp: 0,
      earKick: [-1, -1],
      nodStart: -1,
      look: { dx: 0, dy: 0 },
      lookCur: { x: 0, y: 0 },
      walking: false,
      walkDir: 1,
      walkDy: 0,
      walkPhase: 0,
      facing: 1,
    };

    document.body.classList.add('kind-image');
    this._applyLang(this._lang);

    if (this.isLayered) this._buildLayered();
    else if (this.isSeq) this._buildSequence();
    else this._buildFlat();

    this._actionImg = this._mkOverlayImg('action-img');
    this._contentEl.appendChild(this._actionImg);
    this._runImg = this._mkOverlayImg('run-img');
    this._contentEl.appendChild(this._runImg);

    this.layout();
  }

  private _mkOverlayImg(cls: string): HTMLImageElement {
    const img = document.createElement('img');
    img.className = cls;
    img.draggable = false;
    return img;
  }

  private _applyLang(code: Lang): void {
    this._lang = code === 'en' || code === 'zh' || code === 'ja' ? code : 'zh';
  }

  public setLang(code: Lang): void {
    this._applyLang(code);
  }

  public bindPartSpeech(fn: (() => void) | null): void {
    this._partSpeechFn = fn;
  }

  private _buildLayered(): void {
    const pet = this.pet;
    this._natW = pet.natural.w;
    this._natH = pet.natural.h;
    const wrap = document.createElement('div');
    wrap.className = 'layered';
    let pending = 0;
    const hitImgs: { img: HTMLImageElement; box: { x: number; y: number; w: number; h: number } | null }[] = [];

    const mkImg = (
      src: string,
      cls: string,
      boxSpec: { x: number; y: number; w: number; h: number } | null,
      origin: { x: number; y: number } | null,
    ): HTMLImageElement => {
      const img = document.createElement('img');
      img.className = cls;
      img.draggable = false;
      img.src = this._assetURL(src);
      if (boxSpec) {
        img.style.left = pct(boxSpec.x);
        img.style.top = pct(boxSpec.y);
        img.style.width = pct(boxSpec.w);
        img.style.height = pct(boxSpec.h);
      } else {
        img.style.left = '0';
        img.style.top = '0';
        img.style.width = '100%';
        img.style.height = '100%';
      }
      if (origin) img.style.transformOrigin = pct(origin.x) + ' ' + pct(origin.y);
      pending++;
      hitImgs.push({ img, box: boxSpec });
      img.onload = () => {
        if (--pending === 0) this._buildHit(hitImgs);
      };
      return img;
    };

    if (!pet.body) throw new Error('image-layered pet requires `body`');
    wrap.appendChild(mkImg(pet.body, 'part body', null, null));

    (pet.ears || []).forEach((e) => {
      const el = mkImg(e.src, 'part ear ear-' + e.side, e.box, e.origin);
      this._ears.push({ el, sign: e.side === 'l' ? 1 : -1 });
      wrap.appendChild(el);
    });

    (pet.eyes || []).forEach((e, i) => {
      wrap.appendChild(this._mkLid(e, i));
    });

    this._contentEl.appendChild(wrap);
  }

  private _mkLid(e: { x: number; y: number; w: number; h: number }, i: number): HTMLDivElement {
    const lid = document.createElement('div');
    lid.className = 'lid lid-' + (i === 0 ? 'l' : 'r');
    lid.style.left = pct(e.x);
    lid.style.top = pct(e.y);
    lid.style.width = pct(e.w);
    lid.style.height = pct(e.h);
    lid.style.background = this.pet.lid || '';
    const lash = document.createElement('span');
    lash.className = 'lash';
    lid.appendChild(lash);
    return lid;
  }

  private _buildHit(
    hitImgs: { img: HTMLImageElement; box: { x: number; y: number; w: number; h: number } | null }[],
  ): void {
    try {
      const c = document.createElement('canvas');
      c.width = this._natW;
      c.height = this._natH;
      const cx = c.getContext('2d', { willReadFrequently: true });
      if (!cx) return;
      hitImgs.forEach((h) => {
        if (!h.box) cx.drawImage(h.img, 0, 0, this._natW, this._natH);
        else
          cx.drawImage(
            h.img,
            h.box.x * this._natW,
            h.box.y * this._natH,
            h.box.w * this._natW,
            h.box.h * this._natH,
          );
      });
      cx.getImageData(0, 0, 1, 1);
      this._hitCtx = cx;
      this._hitOK = true;
    } catch (_e) {
      this._hitOK = false;
    }
  }

  private _buildSequence(): void {
    const pet = this.pet;
    if (!pet.frames) throw new Error('image-sequence pet requires `frames`');
    this._natW = pet.natural.w;
    this._natH = pet.natural.h;
    const idleIdx = pet.idle || 0;
    this.seqFrames = Util.loadFrameSequence(pet.frames, this._assetURL);
    const seqImg = document.createElement('img');
    seqImg.className = 'pet-main';
    seqImg.draggable = false;
    seqImg.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = this._natW;
        c.height = this._natH;
        const cx = c.getContext('2d', { willReadFrequently: true });
        if (!cx) return;
        cx.drawImage(seqImg, 0, 0);
        cx.getImageData(0, 0, 1, 1);
        this._hitCtx = cx;
        this._hitOK = true;
      } catch (_e) {
        this._hitOK = false;
      }
    };
    seqImg.src = this.seqFrames[idleIdx].src;
    this._seqImg = seqImg;
    this._contentEl.appendChild(seqImg);
    (pet.eyes || []).forEach((e, i) => {
      this._contentEl.appendChild(this._mkLid(e, i));
    });
  }

  private _buildFlat(): void {
    const pet = this.pet;
    if (!pet.src) throw new Error('image pet requires `src`');
    const spriteImg = new Image();
    spriteImg.draggable = false;
    spriteImg.className = 'pet-main';
    spriteImg.onload = () => {
      this._natW = spriteImg.naturalWidth;
      this._natH = spriteImg.naturalHeight;
      try {
        const c = document.createElement('canvas');
        c.width = this._natW;
        c.height = this._natH;
        const cx = c.getContext('2d', { willReadFrequently: true });
        if (!cx) return;
        cx.drawImage(spriteImg, 0, 0);
        cx.getImageData(0, 0, 1, 1);
        this._hitCtx = cx;
        this._hitOK = true;
      } catch (_e) {
        this._hitOK = false;
      }
    };
    spriteImg.src = this._assetURL(pet.src);
    this._contentEl.appendChild(spriteImg);
  }

  public setVisualMode(mode: VisualMode): void {
    this._visualMode = mode;
    this._contentEl.classList.remove('acting', 'running');
    if (mode === 'acting') this._contentEl.classList.add('acting');
    else if (mode === 'running') this._contentEl.classList.add('running');
  }

  public setOverlayFrame(layer: 'action' | 'run', src: string): void {
    if (layer === 'action') this._actionImg.src = src;
    else if (layer === 'run') this._runImg.src = src;
  }

  public setSequenceFrame(src: string): void {
    if (this._seqImg) this._seqImg.src = src;
  }

  public resetSequenceIdle(): void {
    if (!this.isSeq) return;
    const idleIdx = this.pet.idle || 0;
    if (this._seqImg && this.seqFrames[idleIdx]) this._seqImg.src = this.seqFrames[idleIdx].src;
  }

  private _effectivePad(): LayoutPad {
    const o = this._layoutPadOverride;
    if (!o) return { top: PAD.top, bottom: PAD.bottom, side: PAD.side, aspect: null };
    return {
      top: o.top != null ? o.top : PAD.top,
      bottom: o.bottom != null ? o.bottom : PAD.bottom,
      side: o.side != null ? o.side : PAD.side,
      aspect: o.aspect != null ? o.aspect : null,
    };
  }

  public setLayoutPad(pad: Partial<LayoutPad> | null): void {
    this._layoutPadOverride = pad || null;
    this.layout();
  }

  public layout(newScaleH?: number): void {
    if (newScaleH != null) this._scaleH = newScaleH;
    const pad = this._effectivePad();
    const pet = this.pet;
    const basePetH = Math.round(this._scaleH * (pet.renderScale || 1));
    const aspect = pad.aspect != null ? pad.aspect : pet.aspect || 0.66;
    const petH = basePetH;
    const petW = Math.round(petH * aspect);
    const idleW = Math.round(basePetH * (pet.aspect || 0.66));
    const topPad = Math.round(basePetH * pad.top);
    const botPad = Math.round(basePetH * pad.bottom);
    const sidePad = Math.round(idleW * pad.side);
    this._box.w = petW;
    this._box.h = petH;
    this._box.left = sidePad;
    this._box.top = topPad;
    this._box.winW = petW + sidePad * 2;
    this._box.winH = petH + topPad + botPad;
    this._moveEl.style.left = this._box.left + 'px';
    this._moveEl.style.top = this._box.top + 'px';
    this._moveEl.style.width = this._box.w + 'px';
    this._moveEl.style.height = this._box.h + 'px';
    this._onFit(this._box.winW, this._box.winH);
  }

  public getBox(): PetBox {
    return this._box;
  }

  public overPet(cx: number, cy: number): boolean {
    const u = (cx - this._box.left) / this._box.w;
    const v = (cy - this._box.top) / this._box.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    if (this._hitOK && this._hitCtx) {
      const px = Util.clamp(Math.floor(u * this._natW), 0, this._natW - 1);
      const py = Util.clamp(Math.floor(v * this._natH), 0, this._natH - 1);
      try {
        return this._hitCtx.getImageData(px, py, 1, 1).data[3] > 20;
      } catch (_e) {
        return true;
      }
    }
    return true;
  }

  public regionAt(cx: number, cy: number): Region | null {
    if (!this.overPet(cx, cy)) return null;
    if (!this.isLayered || !this.pet.ears) return 'body';
    const u = (cx - this._box.left) / this._box.w;
    const v = (cy - this._box.top) / this._box.h;
    return RegionUtil.regionAtNormalized(u, v, this.pet);
  }

  public showBubble(text: string): void {
    if (!this._speechEl || !this._speechTextEl) return;
    this._speechTextEl.textContent = text || '';
    this._speechEl.classList.add('show');
  }

  public hideBubble(): void {
    if (!this._speechEl) return;
    this._speechEl.classList.remove('show');
  }

  /** @deprecated Use SpeechEngine.present; kept for legacy callers/tests. */
  public say(text: string, ms?: number): void {
    this.showBubble(text);
    if (ms != null) setTimeout(() => this.hideBubble(), ms);
  }

  public triggerHop(): void {
    this._motion.hopStart = Util.now();
  }

  public triggerWobble(amp: number): void {
    this._motion.wobStart = Util.now();
    this._motion.wobAmp = Util.clamp(amp, 0, 1.2);
  }

  public triggerHappy(ms?: number): void {
    document.body.classList.add('is-happy');
    if (this._happyTimer) clearTimeout(this._happyTimer);
    this._happyTimer = setTimeout(() => {
      document.body.classList.remove('is-happy');
    }, ms || 500);
  }

  public triggerBlink(): void {
    if (!this._canBlinkFlag) return;
    document.body.classList.add('is-blink');
    setTimeout(() => document.body.classList.remove('is-blink'), 160);
  }

  public triggerEarKick(index: number): void {
    if (index >= 0 && index < this._motion.earKick.length)
      this._motion.earKick[index] = Util.now();
  }

  public triggerNod(): void {
    this._motion.nodStart = Util.now();
  }

  public setLook(dx: number, dy: number): void {
    this._motion.look.dx = dx;
    this._motion.look.dy = dy;
  }

  public setWalkState(state: { active: boolean; dir?: number; dy?: number; facing?: number }): void {
    this._motion.walking = !!state.active;
    if (state.dir != null) this._motion.walkDir = state.dir;
    if (state.dy != null) this._motion.walkDy = state.dy;
    if (state.facing != null) this._motion.facing = state.facing;
    if (!state.active) this._motion.walkDy = 0;
  }

  public setDragging(active: boolean, vx?: number): void {
    this._motion.dragging = !!active;
    if (vx != null) this._dragVx = vx;
    if (!active) this._motion.dragRot = 0;
  }

  public setDragVelocity(vx: number): void {
    this._dragVx = vx;
  }

  private _hopOffset(age: number, petH: number): { ty: number; sx: number; sy: number } | null {
    const dur = 640;
    const tn = age / dur;
    if (tn >= 1) return null;
    const H = petH * 0.2;
    let ty = 0;
    let sx = 1;
    let sy = 1;
    if (tn < 0.18) {
      const a = tn / 0.18;
      sy = 1 - 0.12 * a;
      sx = 1 + 0.1 * a;
    } else if (tn < 0.5) {
      const b = Util.easeOut((tn - 0.18) / 0.32);
      ty = -H * b;
      sy = 1 + 0.07 * b;
      sx = 1 - 0.05 * b;
    } else if (tn < 0.72) {
      const c = (tn - 0.5) / 0.22;
      ty = -H * (1 - c);
    } else {
      const dd = (tn - 0.72) / 0.28;
      const s = Math.sin(Math.PI * dd);
      sy = 1 - 0.11 * s;
      sx = 1 + 0.08 * s;
    }
    return { ty, sx, sy };
  }

  private _happyNow(): boolean {
    return document.body.classList.contains('is-happy');
  }

  private _frame = (): void => {
    const t = Util.now() / 1000;
    const petH = this._box.h;
    const br = (Math.sin((t * (Math.PI * 2)) / 3.6) + 1) / 2;
    let sx = 1 + 0.016 * br;
    let sy = 1 - 0.02 * br;
    let ty = Math.sin((t * (Math.PI * 2)) / 3.6) * 1.2;
    let rot = 0;
    let txp = 0;

    const m = this._motion;
    m.lookCur.x = Util.lerp(m.lookCur.x, m.look.dx, 0.12);
    m.lookCur.y = Util.lerp(m.lookCur.y, m.look.dy, 0.12);
    if (!m.dragging && !m.walking) {
      rot += m.lookCur.x * 3.2;
      txp += m.lookCur.x * 3.0;
      ty += m.lookCur.y * 2.0;
    }

    if (m.walking && this._visualMode !== 'running') {
      m.walkPhase += 0.28;
      ty += -Math.abs(Math.sin(m.walkPhase)) * (petH * 0.035);
      rot += Math.sin(m.walkPhase) * 2.2 + m.walkDir * 1.5;
      // Diagonal walk leans the body along the vertical axis: walking up
      // (walkDy = -1) tilts backward, walking down (walkDy = 1) tilts forward.
      rot += m.walkDy * 4.0;
    }

    if (m.dragging) {
      m.dragRot = Util.lerp(m.dragRot, Util.clamp(-this._dragVx * 0.6, -13, 13), 0.25);
      rot += m.dragRot;
      sy *= 1.04;
      sx *= 0.99;
    }

    if (m.hopStart >= 0) {
      const h = this._hopOffset(Util.now() - m.hopStart, petH);
      if (h) {
        ty += h.ty;
        sx *= h.sx;
        sy *= h.sy;
      } else {
        m.hopStart = -1;
      }
    }

    if (m.wobStart >= 0) {
      const age = (Util.now() - m.wobStart) / 1000;
      if (age > 0.75) {
        m.wobStart = -1;
      } else {
        rot += Math.exp(-6 * age) * Math.sin(age * 34) * 9 * m.wobAmp;
      }
    }

    this._moveEl.style.transform =
      'translate(' +
      txp.toFixed(2) +
      'px,' +
      ty.toFixed(2) +
      'px) rotate(' +
      rot.toFixed(2) +
      'deg) ' +
      'scale(' +
      (sx * m.facing).toFixed(3) +
      ',' +
      sy.toFixed(3) +
      ')';

    if (m.nodStart >= 0) {
      const ndAge = (Util.now() - m.nodStart) / 1000;
      if (ndAge > 0.62) {
        m.nodStart = -1;
        this._tiltEl.style.transform = '';
      } else {
        const ne = Math.exp(-4.5 * ndAge) * Math.cos(ndAge * 21);
        this._tiltEl.style.transform =
          'scale(' +
          (1 + 0.045 * ne).toFixed(3) +
          ',' +
          (1 - 0.06 * ne).toFixed(3) +
          ')';
      }
    }

    if (this._ears.length) {
      const perk = this._happyNow() ? 1 : 0;
      const wk = m.walking ? Math.sin(m.walkPhase) * 1.5 : 0;
      for (let i = 0; i < this._ears.length; i++) {
        const s = this._ears[i].sign;
        const swayDeg = Math.sin(t * 1.7 + i * 0.7) * 2.6 * s;
        let rotE = swayDeg + perk * 7 * s + wk * s;
        const ek = m.earKick[i];
        if (ek >= 0) {
          const ekAge = (Util.now() - ek) / 1000;
          if (ekAge > 0.7) m.earKick[i] = -1;
          else rotE += Math.exp(-5 * ekAge) * Math.sin(ekAge * 42) * 18 * s;
        }
        this._ears[i].el.style.transform = 'rotate(' + rotE.toFixed(2) + 'deg)';
      }
    }

    this._rafId = requestAnimationFrame(this._frame);
  };

  public start(): void {
    if (this._rafId == null) this._rafId = requestAnimationFrame(this._frame);
  }

  public destroy(): void {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  public handleIntent(intent: Intent): boolean {
    if (intent.kind === 'character.look') {
      this.setLook(intent.dx || 0, intent.dy || 0);
      return true;
    }
    if (intent.kind === 'character.walk') {
      this.setWalkState({
        active: !!intent.active,
        dir: intent.dir,
        dy: intent.walkDy,
        facing: intent.facing,
      });
      return true;
    }
    if (intent.kind === 'character.scale') {
      if (intent.height != null) this.layout(intent.height);
      return true;
    }
    if (intent.kind === 'character.lang') {
      if (intent.code) this._applyLang(intent.code);
      return true;
    }
    if (intent.kind === 'character.wobble') {
      this.triggerWobble(intent.amp || 0);
      return true;
    }
    if (intent.kind === 'character.blink') {
      this.triggerBlink();
      return true;
    }
    if (intent.kind === 'character.part') {
      if (intent.region) return this.handlePart(intent.region, intent.source);
    }
    return false;
  }

  private _triggerPartSpeech(): void {
    if (this._partSpeechFn) this._partSpeechFn();
  }

  public handlePart(reg: Region, source?: string): boolean {
    const skipSpeech = source === 'click-action';
    if (reg === 'ear-l') {
      if (!skipSpeech) this._triggerPartSpeech();
      this.triggerEarKick(0);
      return true;
    }
    if (reg === 'ear-r') {
      if (!skipSpeech) this._triggerPartSpeech();
      this.triggerEarKick(1);
      return true;
    }
    if (reg === 'face') {
      if (!skipSpeech) this._triggerPartSpeech();
      this.triggerNod();
      if (this._canBlinkFlag) {
        this.triggerHappy(560);
        this.triggerBlink();
      }
      return true;
    }
    return false;
  }

  public getVisualMode(): VisualMode {
    return this._visualMode;
  }

  public isDragging(): boolean {
    return this._motion.dragging;
  }

  public canBlink(): boolean {
    return this._canBlinkFlag;
  }

  public clearBlinkForAction(): void {
    document.body.classList.remove('is-blink');
  }
}
