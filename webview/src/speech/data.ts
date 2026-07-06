import type { Dialogue } from '../types';

/**
 * PetEngine.SpeechData — 默认对话数据（与 SpeechEngine 实现分离）。
 *
 * 对话数据模型（Dialogue）：
 *   { name, textZh, textEn, textJa, audio?, duration? }
 *   - name            唯一标识，可用于 presentByName / Intent.name 精准触发
 *   - textZh/textEn/textJa   三语文案，运行时按当前 lang 取用
 *   - audio           引用的音频路径；存在时气泡时长跟随音频
 *   - duration        对话持续时间（ms），应与音频时长保持一致；音频缺失时作为兜底
 */
export const DEFAULT_DURATION_MS = 1700;

export const DEFAULT_SPEECH: readonly Dialogue[] = [
  {
    name: 'ha',
    textZh: '哈？',
    textEn: 'Ha?',
    textJa: 'ハァ？',
    audio: 'audio/usagi_haah.mp3',
    duration: 888,
  },
  { name: 'yaha', textZh: '呀哈', textEn: 'Yaha', textJa: 'ヤハ' },
  {
    name: 'ura',
    textZh: '乌拉！',
    textEn: 'Ura!',
    textJa: 'ウラ！',
    audio: 'audio/usagi_ura.mp3',
    duration: 522,
  },
  {
    name: 'ura-long',
    textZh: '乌拉呀哈呀啦呜哈～',
    textEn: 'Ura yaha yara wuha~',
    textJa: 'ウラヤハヤラウハ～',
    audio: 'audio/usagi_urayala.mp3',
    duration: 3161,
  },
  { name: 'yaha-yaha', textZh: '呀哈呀哈', textEn: 'Yaha yaha', textJa: 'ヤハヤハ' },
  { name: 'ha-bang', textZh: '哈！', textEn: 'Ha!', textJa: 'ハッ！' },
  {
    name: 'wulili',
    textZh: '乌哩哩',
    textEn: 'Wulili',
    textJa: 'ウリリ',
    audio: 'audio/usagi_wulili.mp3',
    duration: 2400,
  },
];

export const DEFAULT_ROLL_DIALOGUE: Dialogue = {
  name: 'roll',
  textZh: '噜噜噜噜噜！',
  textEn: 'Rurururu!',
  textJa: 'ルルルルル！',
};
