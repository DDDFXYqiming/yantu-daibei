import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export const MAX_DOCX_BYTES = 5 * 1024 * 1024;
const MAX_DOCX_XML_CHARS = 1_500_000;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

export class DocxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxImportError';
  }
}

function getUncompressedSize(entry: JSZip.JSZipObject): number | undefined {
  const data = (entry as any)._data;
  return typeof data?.uncompressedSize === 'number' ? data.uncompressedSize : undefined;
}

function pushTextFromNode(node: unknown, out: string[]) {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) pushTextFromNode(child, out);
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
    if (name === ':@' || name.startsWith('@_')) continue;
    if (name === '#text') {
      if (typeof value === 'string' || typeof value === 'number') out.push(String(value));
      continue;
    }
    if (name === 'w:tab') {
      out.push(' ');
      continue;
    }
    if (name === 'w:br' || name === 'w:cr') {
      out.push('\n');
      continue;
    }
    if (name === 'w:p') {
      pushTextFromNode(value, out);
      const last = out[out.length - 1];
      if (last && last !== '\n') out.push('\n');
      continue;
    }
    if (name === 'w:tc') {
      pushTextFromNode(value, out);
      const last = out[out.length - 1];
      if (last && last !== ' ' && last !== '\n') out.push(' ');
      continue;
    }
    pushTextFromNode(value, out);
  }
}

function normalizeDocxText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  if (arrayBuffer.byteLength > MAX_DOCX_BYTES) {
    throw new DocxImportError('DOCX 文件过大');
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  if (!zip.file('[Content_Types].xml')) {
    throw new DocxImportError('不是有效的 DOCX 文件');
  }

  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    throw new DocxImportError('没有找到正文内容');
  }

  const uncompressedSize = getUncompressedSize(documentEntry);
  if (uncompressedSize && uncompressedSize > MAX_DOCX_XML_CHARS * 2) {
    throw new DocxImportError('DOCX 正文过大');
  }

  const xml = await documentEntry.async('string');
  if (xml.length > MAX_DOCX_XML_CHARS) {
    throw new DocxImportError('DOCX 正文过大');
  }

  const parsed = parser.parse(xml);
  const parts: string[] = [];
  pushTextFromNode(parsed, parts);
  return normalizeDocxText(parts.join(''));
}
