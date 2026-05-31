import { NativeModules, Platform } from 'react-native';
import { cleanText } from './materials';

export const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;

type LocalOcrNativeModule = {
  recognizeText: (imageUri: string) => Promise<string>;
};

export class OcrImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrImportError';
  }
}

const localOcr = NativeModules.LocalOcr as LocalOcrNativeModule | undefined;

export async function recognizeImageText(imageUri: string): Promise<string> {
  if (!imageUri.trim()) {
    throw new OcrImportError('图片地址为空。');
  }
  if (Platform.OS !== 'android') {
    throw new OcrImportError('当前版本先支持 Android 图片识别。');
  }
  if (!localOcr?.recognizeText) {
    throw new OcrImportError('当前版本暂时无法识别图片，请更新到最新版后再试。');
  }

  const text = await localOcr.recognizeText(imageUri);
  const cleaned = cleanText(String(text ?? ''));
  if (!cleaned) {
    throw new OcrImportError('未识别到文字，请换一张更清晰的图片。');
  }
  return cleaned;
}
