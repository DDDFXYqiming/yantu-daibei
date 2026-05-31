import { NativeModules, Platform } from 'react-native';
import { cleanText } from './materials';

export const PDF_MIME = 'application/pdf';
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

type LocalPdfNativeModule = {
  extractText: (pdfUri: string) => Promise<string>;
};

export class PdfImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfImportError';
  }
}

const localPdf = NativeModules.LocalPdf as LocalPdfNativeModule | undefined;

export async function extractPdfText(pdfUri: string): Promise<string> {
  if (!pdfUri.trim()) {
    throw new PdfImportError('PDF 地址为空。');
  }
  if (Platform.OS !== 'android') {
    throw new PdfImportError('当前版本先支持 Android PDF 导入。');
  }
  if (!localPdf?.extractText) {
    throw new PdfImportError('当前版本暂时无法读取 PDF，请更新到最新版后再试。');
  }

  const text = await localPdf.extractText(pdfUri);
  const cleaned = cleanText(String(text ?? ''));
  if (!cleaned) {
    throw new PdfImportError('这个 PDF 没有识别到可用文字，请换更清晰的文件。');
  }
  return cleaned;
}
