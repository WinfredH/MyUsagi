import { Util } from '../../src/util';
import { RegionUtil } from '../../src/region';
import { AudioEngine } from '../../src/audio';
import { CharacterEngine } from '../../src/character';
import { SpeechEngine } from '../../src/speech/index';
import { ActionEngine } from '../../src/action';
import { TriggerHub } from '../../src/trigger';
import { PetRegistry } from '../../src/pets/registry';
import usagi from '../../src/pets/usagi';

// Register the default pet so region/layout tests can look it up.
PetRegistry.register(usagi);

// Stub loadFrameSequence so ActionEngine/CharacterEngine construction does not
// create real HTMLImageElement instances (which would try to load data URLs).
Util.loadFrameSequence = function (spec) {
  var arr = [];
  for (var i = 0; i < spec.count; i++) {
    arr.push({
      src: spec.base + String(i + (spec.start || 0)).padStart(spec.pad || 2, '0') + (spec.ext || '.png')
    });
  }
  return arr;
};

// Minimal bridge stub — tests that need petAPI read from globalThis.
globalThis.petAPI = {
  asset: function (p) {
    return 'data:test/' + p;
  },
  setIgnore: function () {
    return Promise.resolve();
  }
};

export function createCharacterMock(overrides) {
  var base = {
    isDragging: function () {
      return false;
    },
    setVisualMode: function () {},
    setOverlayFrame: function () {},
    setLayoutPad: function () {},
    triggerHop: function () {},
    triggerHappy: function () {},
    canBlink: function () {
      return true;
    },
    clearBlinkForAction: function () {},
    say: function () {},
    showBubble: function () {},
    hideBubble: function () {},
    bindPartSpeech: function () {},
    isSeq: false,
    seqFrames: [],
    setSequenceFrame: function () {},
    resetSequenceIdle: function () {},
    handleIntent: function () {
      return true;
    },
    overPet: function () {
      return true;
    },
    regionAt: function () {
      return 'body';
    },
    setDragging: function () {},
    setDragVelocity: function () {},
    setWalkState: function () {}
  };
  return Object.assign(base, overrides || {});
}

export function createAudioMock(playImpl) {
  return {
    play: playImpl || function () {
      return null;
    },
    playAction: playImpl || function () {
      return null;
    },
    playSpeech: function () {
      return null;
    },
    stopAll: function () {},
    stopAction: function () {},
    stopSpeech: function () {},
    setEnabled: function () {},
    isEnabled: function () {
      return true;
    },
    canPlay: function () {
      return true;
    }
  };
}

export function createMinimalPet(overrides) {
  return Object.assign(
    {
      id: 'usagi',
      kind: 'image-layered',
      aspect: 0.66,
      natural: { w: 600, h: 910 },
      actions: {
        roll: { base: 'images/roll/roll_', count: 3, pad: 2, ext: '.png', start: 1, fps: 10, loops: 1 },
        dance: {
          base: 'images/dance/dance_',
          count: 3,
          pad: 2,
          ext: '.png',
          start: 1,
          fps: 10,
          loops: 2,
          loopUntil: 'audio',
          audio: 'audio/dance.mp3'
        }
      },
      walk: { base: 'images/run/run_', count: 2, pad: 2, ext: '.png', start: 1, fps: 9 }
    },
    overrides || {}
  );
}

export function createSpeechMock(overrides) {
  var base = {
    handleIntent: function () {
      return true;
    },
    presentRandom: function () {},
    presentRollLine: function () {},
    stop: function () {},
    setLang: function () {}
  };
  return Object.assign(base, overrides || {});
}

export function createActionEngine(pet, character, audio, speechEngine) {
  return new ActionEngine({
    pet: pet,
    character: character,
    audio: audio,
    speechEngine: speechEngine || createSpeechMock(),
    assetURL: function (p) {
      return 'data:test/' + p;
    }
  });
}

export function createTriggerHub(pet, character, actionEngine, speechEngine, opts) {
  opts = opts || {};
  return new TriggerHub({
    pet: pet,
    character: character,
    actionEngine: actionEngine,
    speechEngine: speechEngine || createSpeechMock(),
    audio: createAudioMock(),
    petAPI: globalThis.petAPI,
    followEnabled: opts.followEnabled === true,
  });
}

export { Util, RegionUtil, AudioEngine, CharacterEngine, SpeechEngine, ActionEngine, TriggerHub, PetRegistry };
