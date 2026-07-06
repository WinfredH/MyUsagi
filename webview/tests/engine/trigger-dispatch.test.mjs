import { describe, it, expect } from 'vitest';
import {
  createActionEngine,
  createAudioMock,
  createCharacterMock,
  createMinimalPet,
  createSpeechMock,
  createTriggerHub
} from './setup-vitest.mjs';

describe('TriggerHub dispatch routing', () => {
  it('routes hand click to roll action', () => {
    var character = createCharacterMock();
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());
    var hub = createTriggerHub(createMinimalPet(), character, engine);

    hub.dispatch({ kind: 'character.part', region: 'hand-l', source: 'click' });
    expect(engine.isBusy()).toBe(true);
    expect(engine.getCurrentAction()).toBe('roll');
  });

  it('routes body click to hop and speech', () => {
    var hopPlayed = false;
    var speechCalled = false;
    var character = createCharacterMock();
    var speech = createSpeechMock({
      handleIntent: function (intent) {
        if (intent.kind === 'character.speech') speechCalled = true;
        return true;
      }
    });
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock(), speech);
    var originalHandle = engine.handleIntent.bind(engine);
    engine.handleIntent = function (intent) {
      if (intent.kind === 'action.play' && intent.name === 'hop') hopPlayed = true;
      return originalHandle(intent);
    };

    var hub = createTriggerHub(createMinimalPet(), character, engine, speech);
    hub.dispatch({ kind: 'character.part', region: 'body', source: 'click' });

    expect(hopPlayed).toBe(true);
    expect(speechCalled).toBe(true);
  });

  it('maps menu react to action.play via dispatch', () => {
    var character = createCharacterMock();
    var engine = createActionEngine(createMinimalPet(), character, createAudioMock());
    var hub = createTriggerHub(createMinimalPet(), character, engine);

    hub.dispatch({ kind: 'action.play', name: 'dance', source: 'menu' });
    expect(engine.isBusy()).toBe(true);
    expect(engine.getCurrentAction()).toBe('dance');
  });
});
