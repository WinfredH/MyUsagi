import type {
  AudioEngineLike,
  CharacterEngineLike,
  Dialogue,
  Intent,
  Lang,
  PetConfig,
  SpeechEngineLike,
} from '../types';
import {
  DEFAULT_DURATION_MS,
  DEFAULT_ROLL_DIALOGUE,
  DEFAULT_SPEECH,
} from './data';

const SUPPORTED_LANGS: readonly Lang[] = ['en', 'zh', 'ja'];

function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'zh' || v === 'ja';
}

/**
 * 多语言对话定义（数据层，不可变值对象）。
 * 仅接受标准字段：{ name, textZh, textEn, textJa, audio?, duration? }。
 */
export class DialogueInstance {
  public name: string;
  public textZh: string;
  public textEn: string;
  public textJa: string;
  public audio: string | null;
  public duration: number;

  public constructor(def: Partial<Dialogue> | null | undefined) {
    def = def || {};
    this.name = def.name || '';
    this.textZh = def.textZh || '';
    this.textEn = def.textEn || '';
    this.textJa = def.textJa || '';
    this.audio = def.audio || null;
    this.duration = def.duration != null ? def.duration : DEFAULT_DURATION_MS;
  }

  public textFor(lang: Lang): string {
    if (lang === 'en') return this.textEn;
    if (lang === 'ja') return this.textJa;
    return this.textZh;
  }

  public hasAudio(): boolean {
    return !!this.audio;
  }

  public static parse(entry: Partial<Dialogue> | null | undefined): DialogueInstance {
    if (entry == null) return new DialogueInstance({});
    return new DialogueInstance(entry);
  }
}

/**
 * 运行时单语台词（由 Dialogue + lang 解析而来，或通过 present 直接传入）。
 * SpeechSession 消费此对象驱动气泡与音频。
 */
export class SpeechLine {
  public text: string;
  public audio: string | null;
  public duration: number;

  public constructor(text: string, opts?: { audio?: string | null; duration?: number }) {
    opts = opts || {};
    this.text = text || '';
    this.audio = opts.audio || null;
    this.duration = opts.duration != null ? opts.duration : DEFAULT_DURATION_MS;
  }

  public hasAudio(): boolean {
    return !!this.audio;
  }

  public static fromDialogue(dialogue: DialogueInstance, lang: Lang): SpeechLine {
    return new SpeechLine(dialogue.textFor(lang), {
      audio: dialogue.audio,
      duration: dialogue.duration,
    });
  }

  public static parse(
    entry: { text?: string; audio?: string; duration?: number } | string | null | undefined,
  ): SpeechLine {
    if (entry == null) return new SpeechLine('');
    if (typeof entry === 'string') return new SpeechLine(entry);
    return new SpeechLine(entry.text || '', {
      audio: entry.audio || null,
      duration: entry.duration != null ? entry.duration : DEFAULT_DURATION_MS,
    });
  }
}

interface EngineRef {
  character: CharacterEngineLike;
  audio: AudioEngineLike;
  activeSession: SpeechSession | null;
}

/** 一次活跃气泡 + 可选配音的生命周期对象。 */
export class SpeechSession {
  private _engine: EngineRef;
  private _line: SpeechLine;
  private _audioHandle: ReturnType<AudioEngineLike['playSpeech']> = null;
  private _hideTimer: ReturnType<typeof setTimeout> | null = null;
  private _done = false;

  public constructor(engine: EngineRef, line: SpeechLine) {
    this._engine = engine;
    this._line = line;
  }

  public start(): void {
    this._engine.character.showBubble(this._line.text);

    if (!this._line.hasAudio()) {
      this._hideTimer = setTimeout(() => this.finish(), this._line.duration);
      return;
    }

    const handle = this._engine.audio.playSpeech(this._line.audio as string);
    if (!handle) {
      this._hideTimer = setTimeout(() => this.finish(), this._line.duration);
      return;
    }

    this._audioHandle = handle;

    handle.onEnded(() => this.finish());
    handle.onError(() => {
      if (this._done) return;
      this._hideTimer = setTimeout(() => this.finish(), this._line.duration);
    });

    const playPromise = handle.play();
    if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
      (playPromise as Promise<void>).catch(() => {
        if (this._done) return;
        clearTimeout(this._hideTimer as ReturnType<typeof setTimeout>);
        this._hideTimer = setTimeout(() => this.finish(), this._line.duration);
      });
    }
  }

  public stop(): void {
    if (this._done) return;
    this._done = true;
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    if (this._audioHandle) {
      this._audioHandle.stop();
      this._audioHandle = null;
    }
    this._engine.character.hideBubble();
  }

  public finish(): void {
    if (this._done) return;
    this._done = true;
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    if (this._audioHandle) {
      this._audioHandle.stop();
      this._audioHandle = null;
    }
    this._engine.character.hideBubble();
    if (this._engine.activeSession === this) this._engine.activeSession = null;
  }
}

export interface SpeechEngineOpts {
  pet: PetConfig;
  character: CharacterEngineLike;
  audio: AudioEngineLike;
  lang?: Lang;
}

export class SpeechEngine implements SpeechEngineLike {
  private _character: CharacterEngineLike;
  private _audio: AudioEngineLike;
  private _pet: PetConfig;
  private _lang: Lang;
  private _pool: DialogueInstance[] = [];
  private _byName: Record<string, DialogueInstance> = {};
  private _rollDialogue: DialogueInstance;
  private _activeSession: SpeechSession | null = null;
  private _engineRef: EngineRef;

  public constructor(opts: SpeechEngineOpts) {
    this._character = opts.character;
    this._audio = opts.audio;
    this._pet = opts.pet;
    this._lang = isLang(opts.lang) ? opts.lang : 'zh';

    this._engineRef = {
      character: this._character,
      audio: this._audio,
      activeSession: null,
    };

    this._pool = this._normalizePool(this._pet.speech);
    if (!this._pool.length) this._pool = DEFAULT_SPEECH.map((d) => new DialogueInstance(d));
    this._rollDialogue = this._normalizeRollDialogue(this._pet.rollSpeech);
    this._rebuildIndex();

    this._character.bindPartSpeech(() => this.presentRandom());
  }

  private _normalizePool(source: Dialogue[] | undefined): DialogueInstance[] {
    if (!source || !Array.isArray(source)) return [];
    return source.map((d) => new DialogueInstance(d));
  }

  private _normalizeRollDialogue(source: Dialogue | undefined): DialogueInstance {
    if (!source) return new DialogueInstance(DEFAULT_ROLL_DIALOGUE);
    return new DialogueInstance({ ...{ name: 'roll' }, ...source });
  }

  private _rebuildIndex(): void {
    this._byName = {};
    for (const d of this._pool) {
      if (d.name) this._byName[d.name] = d;
    }
  }

  private _stopCurrent(): void {
    if (this._activeSession) this._activeSession.stop();
    this._activeSession = null;
    this._engineRef.activeSession = null;
  }

  private _begin(line: SpeechLine): boolean {
    this._stopCurrent();
    const session = new SpeechSession(this._engineRef, line);
    this._activeSession = session;
    this._engineRef.activeSession = session;
    session.start();
    return true;
  }

  private _pickRandom(): SpeechLine {
    const list = this._pool.length ? this._pool : (DEFAULT_SPEECH as readonly Dialogue[]);
    if (!list.length) return new SpeechLine('');
    const dialogues = list.map((d) =>
      d instanceof DialogueInstance ? d : new DialogueInstance(d as Dialogue),
    );
    const withAudio = dialogues.filter(
      (d) => d.hasAudio() && this._audio.canPlay(d.audio as string),
    );
    const pickFrom = withAudio.length ? withAudio : dialogues;
    const dialogue = pickFrom[(Math.random() * pickFrom.length) | 0];
    return SpeechLine.fromDialogue(dialogue, this._lang);
  }

  /** 运行时注册新对话；重复 name 会覆盖索引。 */
  public registerDialogue(def: Dialogue): DialogueInstance {
    const dialogue = new DialogueInstance(def);
    this._pool.push(dialogue);
    if (dialogue.name) this._byName[dialogue.name] = dialogue;
    return dialogue;
  }

  public getDialogue(name: string): DialogueInstance | null {
    return this._byName[name] || null;
  }

  public present(lineOrEntry: Dialogue | { text?: string; audio?: string; duration?: number }): boolean {
    if (lineOrEntry instanceof DialogueInstance) {
      return this._begin(SpeechLine.fromDialogue(lineOrEntry, this._lang));
    }
    return this._begin(SpeechLine.parse(lineOrEntry as { text?: string; audio?: string; duration?: number }));
  }

  public presentByName(name: string): boolean {
    const dialogue = this._byName[name];
    if (!dialogue) return false;
    return this._begin(SpeechLine.fromDialogue(dialogue, this._lang));
  }

  public presentRandom(): boolean {
    return this._begin(this._pickRandom());
  }

  public presentRollLine(): boolean {
    return this._begin(SpeechLine.fromDialogue(this._rollDialogue, this._lang));
  }

  public handleIntent(intent: Intent): boolean {
    if (intent.kind !== 'character.speech') return false;
    if (intent.name) return this.presentByName(intent.name);
    if (intent.text != null || intent.audio) {
      return this.present({
        text: intent.text,
        audio: intent.audio,
        duration: intent.duration,
      });
    }
    return this.presentRandom();
  }

  public setLang(code: Lang): void {
    this._lang = isLang(code) ? code : 'zh';
  }

  public stop(): void {
    this._stopCurrent();
  }

  public get activeSession(): SpeechSession | null {
    return this._activeSession;
  }

  public get pool(): DialogueInstance[] {
    return this._pool;
  }
}
