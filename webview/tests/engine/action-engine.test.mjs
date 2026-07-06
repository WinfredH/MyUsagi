import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createActionEngine,
  createAudioMock,
  createCharacterMock,
  createMinimalPet,
  createSpeechMock,
} from './setup-vitest.mjs';

describe('ActionEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hop runs when idle and marks procedural busy briefly', () => {
    var hopCalled = false;
    var character = createCharacterMock({
      triggerHop: function () { hopCalled = true; }
    });
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());

    expect(engine.handleIntent({ kind: 'action.play', name: 'hop' })).toBe(true);
    expect(hopCalled).toBe(true);
    expect(engine.isProceduralBusy()).toBe(true);
    expect(engine.isBusy()).toBe(true);
  });

  it('blocks hop while overlay action is active', () => {
    var hopCalled = false;
    var character = createCharacterMock({
      triggerHop: function () { hopCalled = true; }
    });
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());

    expect(engine.handleIntent({ kind: 'action.play', name: 'roll' })).toBe(true);
    expect(engine.isBusy()).toBe(true);
    expect(engine.handleIntent({ kind: 'action.play', name: 'hop' })).toBe(false);
    expect(hopCalled).toBe(false);
  });

  it('walk marks engine busy and blocks hop until preempted', () => {
    var hopCalled = false;
    var walkCleared = false;
    var character = createCharacterMock({
      triggerHop: function () { hopCalled = true; },
      setWalkState: function (state) {
        if (!state.active) walkCleared = true;
      },
    });
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());

    expect(engine.handleIntent({ kind: 'action.play', name: 'walk' })).toBe(true);
    expect(engine.isBusy()).toBe(true);
    expect(engine.isWalking()).toBe(true);
    expect(engine.getCurrentAction()).toBe('walk');
    expect(engine.handleIntent({ kind: 'action.play', name: 'hop' })).toBe(true);
    expect(hopCalled).toBe(true);
    expect(walkCleared).toBe(true);
    expect(engine.isWalking()).toBe(false);
    expect(engine.isProceduralBusy()).toBe(true);
  });

  it('blocks walk while hop is active', () => {
    var character = createCharacterMock();
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());

    expect(engine.handleIntent({ kind: 'action.play', name: 'hop' })).toBe(true);
    expect(engine.isProceduralBusy()).toBe(true);
    expect(engine.handleIntent({ kind: 'action.play', name: 'walk' })).toBe(false);
  });

  it('starting roll stops walk sustained action and clears walk motion', () => {
    var walkCleared = false;
    var character = createCharacterMock({
      setWalkState: function (state) {
        if (!state.active) walkCleared = true;
      },
    });
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());

    expect(engine.handleIntent({ kind: 'action.play', name: 'walk' })).toBe(true);
    expect(engine.getCurrentAction()).toBe('walk');

    expect(engine.handleIntent({ kind: 'action.play', name: 'roll' })).toBe(true);
    expect(engine.getCurrentAction()).toBe('roll');
    expect(engine.isBusy()).toBe(true);
    expect(walkCleared).toBe(true);
  });

  it('action.stop walk clears sustained walk', () => {
    var character = createCharacterMock();
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());

    engine.handleIntent({ kind: 'action.play', name: 'walk' });
    expect(engine.getCurrentAction()).toBe('walk');

    expect(engine.handleIntent({ kind: 'action.stop', name: 'walk' })).toBe(true);
    expect(engine.getCurrentAction()).toBe(null);
  });

  it('dance stops active speech on start', () => {
    var speechStopped = false;
    var character = createCharacterMock();
    var speechEngine = createSpeechMock({
      stop: function () {
        speechStopped = true;
      },
    });
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock(), speechEngine);

    expect(engine.handleIntent({ kind: 'action.play', name: 'dance' })).toBe(true);
    expect(speechStopped).toBe(true);
  });

  it('dance falls back to loop playback when audio is unavailable', () => {
    var frames = [];
    var character = createCharacterMock({
      setOverlayFrame: function (_layer, src) { frames.push(src); }
    });
    var engine = createActionEngine(
      createMinimalPet(),
      character,
      createAudioMock(function () { return null; })
    );

    expect(engine.handleIntent({ kind: 'action.play', name: 'dance' })).toBe(true);
    expect(frames.length).toBeGreaterThan(0);

    vi.advanceTimersByTime(1000);
    expect(frames.length).toBeGreaterThan(1);
  });

  it('dance falls back to loops when audio play rejects', () => {
    var frames = [];
    var character = createCharacterMock({
      setOverlayFrame: function (_layer, src) { frames.push(src); }
    });
    var engine = createActionEngine(
      createMinimalPet(),
      character,
      createAudioMock(function () {
        return {
          onEnded: function () {},
          onError: function () {},
          play: function () { return Promise.reject(new Error('no audio')); },
          stop: function () {}
        };
      })
    );

    expect(engine.handleIntent({ kind: 'action.play', name: 'dance' })).toBe(true);
    vi.advanceTimersByTime(500);
    expect(frames.length).toBeGreaterThan(0);
  });
});
