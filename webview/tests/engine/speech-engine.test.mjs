import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechLine, SpeechEngine } from '../../src/speech/index';

function createCharacterStub() {
  return {
    showBubble: vi.fn(),
    hideBubble: vi.fn(),
    bindPartSpeech: vi.fn()
  };
}

function createAudioStub() {
  return {
    playSpeech: vi.fn(function () {
      var ended = null;
      return {
        play: vi.fn(function () {
          return Promise.resolve();
        }),
        onEnded: function (cb) {
          ended = cb;
          this._fire = function () {
            if (ended) ended();
          };
        },
        onError: function () {},
        stop: vi.fn()
      };
    })
  };
}

describe('SpeechLine', () => {
  it('parses plain string entries', () => {
    var line = SpeechLine.parse('乌拉！');
    expect(line.text).toBe('乌拉！');
    expect(line.hasAudio()).toBe(false);
    expect(line.duration).toBe(1700);
  });

  it('parses object entries with audio', () => {
    var line = SpeechLine.parse({
      text: '呀哈',
      audio: 'audio/yaha.mp3',
      duration: 900
    });
    expect(line.text).toBe('呀哈');
    expect(line.audio).toBe('audio/yaha.mp3');
    expect(line.duration).toBe(900);
    expect(line.hasAudio()).toBe(true);
  });
});

describe('SpeechEngine sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows bubble for text-only lines with configured duration', () => {
    var character = createCharacterStub();
    var audio = createAudioStub();
    var engine = new SpeechEngine({
      pet: { speech: { zh: ['test line'] } },
      character: character,
      audio: audio,
      lang: 'zh'
    });

    engine.present({ text: 'hello', duration: 500 });
    expect(character.showBubble).toHaveBeenCalledWith('hello');
    expect(audio.playSpeech).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(character.hideBubble).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(character.hideBubble).toHaveBeenCalled();
  });

  it('plays speech audio and hides bubble when audio ends', () => {
    var character = createCharacterStub();
    var audio = createAudioStub();
    var engine = new SpeechEngine({
      pet: {},
      character: character,
      audio: audio,
      lang: 'zh'
    });

    engine.present({ text: 'voice line', audio: 'audio/voice.mp3' });
    expect(character.showBubble).toHaveBeenCalledWith('voice line');
    expect(audio.playSpeech).toHaveBeenCalledWith('audio/voice.mp3');

    var handle = audio.playSpeech.mock.results[0].value;
    handle._fire();
    expect(character.hideBubble).toHaveBeenCalled();
  });

  it('replaces an active session when a new line is presented', () => {
    var character = createCharacterStub();
    var audio = createAudioStub();
    var engine = new SpeechEngine({
      pet: {},
      character: character,
      audio: audio,
      lang: 'zh'
    });

    engine.present({ text: 'first', duration: 5000 });
    engine.present({ text: 'second', duration: 800 });
    expect(character.showBubble).toHaveBeenLastCalledWith('second');
    vi.advanceTimersByTime(800);
    expect(character.hideBubble).toHaveBeenCalled();
  });
});
