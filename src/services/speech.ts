import { NativeModules, Platform } from 'react-native';
import { cleanText } from './materials';

type LocalSpeechNativeModule = {
  speak: (text: string) => Promise<void>;
  stop: () => Promise<void>;
};

export class SpeechError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechError';
  }
}

const localSpeech = NativeModules.LocalSpeech as LocalSpeechNativeModule | undefined;

export function buildSpeechText(prompt: string, answer?: string): string {
  const chunks = [prompt, answer ? `参考答案。${answer}` : ''].map((item) => cleanText(item)).filter(Boolean);
  return chunks.join('\n\n').slice(0, 900);
}

export function canUseReviewSpeech(): boolean {
  return Platform.OS === 'android' && Boolean(localSpeech?.speak);
}

export async function speakReviewText(text: string): Promise<void> {
  const cleaned = cleanText(text);
  if (!cleaned) throw new SpeechError('朗读内容为空。');
  if (Platform.OS !== 'android') throw new SpeechError('当前版本先支持 Android 本机朗读。');
  if (!localSpeech?.speak) throw new SpeechError('当前设备暂时无法朗读，请检查系统朗读设置后再试。');
  await localSpeech.speak(cleaned.slice(0, 900));
}

export async function stopReviewSpeech(): Promise<void> {
  if (Platform.OS !== 'android' || !localSpeech?.stop) return;
  await localSpeech.stop();
}
