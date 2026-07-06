import { ActionEngine } from './action';
import { AudioEngine } from './audio';
import { CharacterEngine } from './character';
import { PetBridge, installPetBridge } from './pet-bridge';
import { PetRegistry } from './pets/registry';
import usagi from './pets/usagi';
import usagiRoll from './pets/usagi-roll';
import { SpeechEngine } from './speech/index';
import { TriggerHub } from './trigger';
import { Util } from './util';
import type { Lang, PetrAPI } from './types';

// Register the bundled pets. ESM import replaces the old IIFE self-registration
// side effects in pets/usagi.js + pets/usagi-roll.js.
PetRegistry.register(usagi);
PetRegistry.register(usagiRoll);

async function boot(): Promise<void> {
  // Build the Tauri bridge first so Util.assetURL can resolve data URLs.
  let petAPI: PetrAPI | null = null;
  try {
    const bridge = new PetBridge();
    installPetBridge(bridge);
    petAPI = bridge;
    await bridge.init();
  } catch (e) {
    // Outside Tauri (e.g. open the HTML directly) — fall through; assetURL
    // will degrade to raw file paths and the pet still renders.
    console.warn('PetBridge unavailable, running without Tauri bridge:', e);
  }

  const pet = PetRegistry.get('usagi');
  if (!pet) {
    document.body.textContent = 'No pet registered.';
    return;
  }

  const params = new URLSearchParams(location.search);
  const langParam = params.get('lang');
  const lang: Lang = langParam === 'en' || langParam === 'ja' ? langParam : 'zh';
  const scaleParam = params.get('scale');
  const scaleH =
    (scaleParam && CharacterEngine.SCALES[scaleParam as keyof typeof CharacterEngine.SCALES]) ||
    CharacterEngine.SCALES.medium;
  const assetURL = Util.assetURL;

  const moveEl = document.getElementById('layer-move');
  const tiltEl = document.getElementById('layer-tilt');
  const contentEl = document.getElementById('pet-content');
  const speechEl = document.getElementById('speech');
  if (!moveEl || !tiltEl || !contentEl || !speechEl) {
    document.body.textContent = 'Missing stage DOM.';
    return;
  }

  const character = new CharacterEngine({
    pet,
    scaleH,
    lang,
    dom: { moveEl, tiltEl, contentEl, speechEl },
    assetURL,
    onFit: (w, h) => {
      if (petAPI) petAPI.fit(w, h);
    },
  });

  const audio = new AudioEngine({ assetURL });
  const speech = new SpeechEngine({ pet, character, audio, lang });
  const action = new ActionEngine({
    pet,
    character,
    audio,
    speechEngine: speech,
    assetURL,
  });
  const trigger = new TriggerHub({
    character,
    actionEngine: action,
    speechEngine: speech,
    audio,
    petAPI,
    pet,
  });

  character.start();
  trigger.start();
}

boot().catch((e) => {
  document.body.textContent = 'Failed to load: ' + e;
});
