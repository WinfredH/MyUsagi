/**
 * Shared types for the PetEngine TypeScript port.
 *
 * All cross-module contracts (Intent protocol, Dialogue data model, PetConfig,
 * PetrAPI bridge surface) live here so engine modules can depend on types
 * without forming runtime cycles.
 */

export type Lang = 'zh' | 'en' | 'ja';

export type ActionKind = 'procedural' | 'overlay-frames' | 'sequence-inplace' | 'sustained-overlay';

export type VisualMode = 'idle' | 'acting' | 'running';

export type Region = 'ear-l' | 'ear-r' | 'hand-l' | 'hand-r' | 'face' | 'body';

export type PetKind = 'image-layered' | 'image-sequence' | 'image';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Origin {
  x: number;
  y: number;
}

export interface EarSpec {
  src: string;
  side: 'l' | 'r';
  box: Box;
  origin: Origin;
}

export interface EyeSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutPad {
  top: number;
  bottom: number;
  side: number;
  aspect: number | null;
}

export interface FrameSpec {
  base: string;
  count: number;
  pad?: number;
  ext: string;
  start?: number;
  fps?: number;
  loops?: number;
  loopUntil?: 'audio';
  audio?: string;
  layoutPad?: Partial<LayoutPad>;
}

export interface Dialogue {
  name: string;
  textZh: string;
  textEn: string;
  textJa: string;
  audio?: string | null;
  duration?: number;
}

export interface PetConfig {
  id: string;
  name?: string;
  nameZh?: string;
  nameJa?: string;
  kind: PetKind;
  aspect: number;
  natural: { w: number; h: number };
  articulated?: boolean;
  body?: string;
  src?: string;
  ears?: EarSpec[];
  eyes?: EyeSpec[];
  lid?: string;
  actions?: Record<string, FrameSpec>;
  walk?: FrameSpec;
  frames?: FrameSpec;
  idle?: number;
  renderScale?: number;
  speech?: Dialogue[];
  rollSpeech?: Dialogue;
}

export type IntentKind =
  | 'action.play'
  | 'action.stop'
  | 'character.look'
  | 'character.walk'
  | 'character.scale'
  | 'character.lang'
  | 'character.part'
  | 'character.blink'
  | 'character.wobble'
  | 'character.speech';

export interface Intent {
  kind: IntentKind;
  name?: string;
  source?: string;
  dx?: number;
  dy?: number;
  active?: boolean;
  dir?: number;
  // Vertical component for `character.walk` (-1 up, 0 horizontal, 1 down).
  walkDy?: number;
  facing?: number;
  height?: number;
  code?: Lang;
  region?: Region;
  text?: string;
  audio?: string;
  duration?: number;
  amp?: number;
}

export type AssetURLFn = (p: string) => string;

export interface CharacterDom {
  moveEl: HTMLElement;
  tiltEl: HTMLElement;
  contentEl: HTMLElement;
  speechEl: HTMLElement | null;
}

export interface PetBox {
  left: number;
  top: number;
  w: number;
  h: number;
  winW: number;
  winH: number;
}

export type AudioChannel = 'action' | 'speech';

/** Structural contract satisfied by AudioEngine.AudioHandle instances. */
export interface AudioHandleLike {
  play(): Promise<void>;
  stop(): void;
  onEnded(cb: () => void): void;
  onError(cb: () => void): void;
  onLoadedMetadata(cb: (ms: number | null) => void): void;
  getDurationMs(): number | null;
}

/** Structural contract satisfied by AudioEngine instances. */
export interface AudioEngineLike {
  play(path: string, channel?: AudioChannel): AudioHandleLike | null;
  playAction(path: string): AudioHandleLike | null;
  playSpeech(path: string): AudioHandleLike | null;
  stopAll(): void;
  stopAction(): void;
  stopSpeech(): void;
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  canPlay(path: string): boolean;
}

/** Structural contract satisfied by CharacterEngine instances. */
export interface CharacterEngineLike {
  pet: PetConfig;
  isSeq: boolean;
  isLayered: boolean;
  seqFrames: HTMLImageElement[];
  setVisualMode(mode: VisualMode): void;
  setOverlayFrame(layer: 'action' | 'run', src: string): void;
  setSequenceFrame(src: string): void;
  resetSequenceIdle(): void;
  triggerHop(): void;
  triggerWobble(amp: number): void;
  triggerHappy(ms?: number): void;
  triggerBlink(): void;
  triggerEarKick(index: number): void;
  triggerNod(): void;
  setLook(dx: number, dy: number): void;
  setWalkState(state: { active: boolean; dir?: number; dy?: number; facing?: number }): void;
  setDragging(active: boolean, vx?: number): void;
  setDragVelocity(vx: number): void;
  setLayoutPad(pad: Partial<LayoutPad> | null): void;
  layout(newScaleH?: number): void;
  getBox(): PetBox;
  overPet(cx: number, cy: number): boolean;
  regionAt(cx: number, cy: number): Region | null;
  setLang(code: Lang): void;
  showBubble(text: string): void;
  hideBubble(): void;
  bindPartSpeech(fn: (() => void) | null): void;
  say(text: string, ms?: number): void;
  getVisualMode(): VisualMode;
  isDragging(): boolean;
  canBlink(): boolean;
  handleIntent(intent: Intent): boolean;
  handlePart(region: Region, source?: string): boolean;
  start(): void;
  destroy(): void;
  clearBlinkForAction(): void;
}

/** Structural contract satisfied by SpeechEngine instances. */
export interface SpeechEngineLike {
  registerDialogue(def: Dialogue): unknown;
  getDialogue(name: string): unknown;
  present(lineOrEntry: Dialogue | { text?: string; audio?: string; duration?: number }): boolean;
  presentByName(name: string): boolean;
  presentRandom(): boolean;
  presentRollLine(): boolean;
  handleIntent(intent: Intent): boolean;
  setLang(code: Lang): void;
  stop(): void;
}

export interface ActionContext {
  pet: PetConfig;
  character: CharacterEngineLike;
  audio: AudioEngineLike;
  speechEngine: SpeechEngineLike;
}

export interface ActionDefinition {
  kind: ActionKind;
  isBlocking: boolean;
  resolveConfig?: (pet: PetConfig) => FrameSpec | null | undefined;
  duration?: { type: 'audio'; pathKey: string } | { type: 'loops' };
  onStart?: (ctx: ActionContext) => void;
  onStop?: (ctx: ActionContext) => void;
  run?: (ctx: ActionContext) => void;
}

/** Structural contract satisfied by ActionEngine instances. */
export interface ActionEngineLike {
  handleIntent(intent: Intent): boolean;
  /** True when any action (overlay, walk, or procedural hop) is active. */
  isBusy(): boolean;
  isOverlayBusy(): boolean;
  isWalking(): boolean;
  isProceduralBusy(): boolean;
  isDancing(): boolean;
  getCurrentAction(): string | null;
  register(name: string, definition: ActionDefinition): void;
  unregister(name: string): void;
  stopCurrentAction(): void;
  stopInterruptibleActions(): void;
}

export type AssetBundle = Record<string, string>;

/** Bridge surface exposed by PetBridge to renderer / TriggerHub. */
export interface PetrAPI {
  init(): Promise<AssetBundle>;
  asset(p: string): string | null;
  fit(w: number, h: number): Promise<unknown>;
  dragStart(x: number, y: number): Promise<unknown>;
  dragMove(x: number, y: number): Promise<unknown>;
  dragEnd(): Promise<unknown>;
  setIgnore(ignore: boolean): Promise<unknown>;
  openMenu(): Promise<unknown>;
  quit(): Promise<unknown>;
  onReact(cb: (type: string) => void): void;
  onLook(cb: (p: { dx: number; dy: number }) => void): void;
  onWalk(cb: (p: { dir: number; dy: number }) => void): void;
  onWalkStop(cb: () => void): void;
  onScale(cb: (h: number) => void): void;
  onLang(cb: (code: Lang) => void): void;
  onAudioEnabled(cb: (on: boolean) => void): void;
  onFollowEnabled(cb: (on: boolean) => void): void;
  onCursorMove(cb: (p: { x: number; y: number }) => void): void;
}
