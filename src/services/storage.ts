import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, Material, PurchaseState, ReviewCard } from '../types';
import { createInitialData } from '../data/seed';
import { normalizeExamType } from './exam';
import { analyzeStudyPoint, isUsableReviewCard } from './materials';

const STORAGE_KEY = 'yantu-daibei:v1';

function normalizePurchase(raw: Partial<PurchaseState> | undefined, fallback: PurchaseState): PurchaseState {
  const source = raw?.source === 'store' || raw?.source === 'local' || raw?.source === 'none'
    ? raw.source
    : fallback.source;
  return {
    ...fallback,
    ...raw,
    source,
    isPremium: Boolean(raw?.isPremium ?? fallback.isPremium),
  };
}

function normalizeCard(raw: ReviewCard): ReviewCard {
  const quality = analyzeStudyPoint(raw.sourceText || raw.cloze || raw.prompt || '', raw.subject);
  return {
    ...raw,
    sourceText: raw.sourceText,
    cloze: raw.cloze,
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    qualityStatus: raw.qualityStatus ?? quality.status,
    rejectedReasons: Array.isArray(raw.rejectedReasons) ? raw.rejectedReasons : quality.reasons,
  };
}

function stripKnownExtension(name: string): string {
  return name.replace(/\.(txt|md|markdown|docx|pdf|png|jpg|jpeg|webp|heic)$/i, '').trim();
}

function isNumericImportTitle(title: string): boolean {
  return /^[\d_\-\s]{6,}$/.test(title.trim());
}

function firstValidTitleLine(text: string): string {
  const lines = (text || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim().replace(/^#+\s*/, ''))
    .filter((line) => line.length >= 4 && line.length <= 32 && !isNumericImportTitle(line));
  return lines[0] ?? '';
}

function normalizeMaterialTitle(title: string | undefined, rawText: string | undefined): string {
  const cleanedTitle = stripKnownExtension(title ?? '');
  if (cleanedTitle && !isNumericImportTitle(cleanedTitle)) return cleanedTitle;
  return firstValidTitleLine(rawText ?? '') || '未命名资料';
}

function normalizeMaterial(raw: Material): Material {
  const quality = analyzeStudyPoint(raw.rawText || raw.title || '', raw.subject);
  return {
    ...raw,
    title: normalizeMaterialTitle(raw.title, raw.rawText),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    qualityStatus: raw.qualityStatus ?? (quality.status === 'rejected' ? 'needs_review' : 'usable'),
    rejectedReasons: Array.isArray(raw.rejectedReasons) ? raw.rejectedReasons : quality.reasons,
    sourceType: raw.sourceType || '粘贴文本',
    lastOpenedAt: raw.lastOpenedAt,
    archivedAt: raw.archivedAt,
  };
}

function isUsableCard(card: ReviewCard): boolean {
  return isUsableReviewCard(card);
}

function createLegacyMaterials(cards: ReviewCard[]): Material[] {
  const groups = new Map<string, ReviewCard[]>();
  cards.forEach((card) => {
    const key = card.subject || '专业课';
    groups.set(key, [...(groups.get(key) ?? []), card]);
  });
  return [...groups.entries()].map(([subject, group], index) => ({
    id: `material_legacy_${index + 1}`,
    title: subject === '英语' ? '复试英语带背资料' : `${subject}带背资料集`,
    subject: group[0]?.subject ?? '专业课',
    rawText: group.map((card) => card.sourceText || card.prompt).join('\n'),
    tags: ['已入库', '复盘'],
    sourceType: subject === '英语' ? 'TXT / Markdown' : '粘贴文本',
    lastOpenedAt: new Date().toISOString(),
    createdAt: group[0]?.createdAt ?? new Date().toISOString(),
  }));
}

function normalizeAppData(raw: Partial<AppData>): AppData {
  const base = createInitialData();
  const rawCards = (Array.isArray(raw.cards) ? raw.cards.map(normalizeCard) : base.cards).filter(isUsableCard);
  const rawMaterials = Array.isArray(raw.materials) ? raw.materials.map(normalizeMaterial) : base.materials;
  const shouldRepairOrphanCards = rawMaterials.length === 0 && rawCards.length > 0 && rawCards.some((card) => !card.materialId);
  const uniqueCardSubjects = new Set(rawCards.map((card) => card.subject));
  const shouldSplitLegacyMaterial = rawMaterials.length === 1
    && rawMaterials[0].id.startsWith('material_legacy')
    && uniqueCardSubjects.size > 1;
  const repairedMaterials = shouldRepairOrphanCards || shouldSplitLegacyMaterial ? createLegacyMaterials(rawCards) : [];
  const cards = repairedMaterials.length
    ? rawCards.map((card) => {
      const targetIndex = repairedMaterials.findIndex((material) => material.subject === card.subject);
      return { ...card, materialId: repairedMaterials[Math.max(0, targetIndex)]?.id };
    })
    : rawCards;
  const materials = repairedMaterials.length ? repairedMaterials : rawMaterials;
  return {
    ...base,
    ...raw,
    profile: { ...base.profile, ...raw.profile, examType: normalizeExamType(raw.profile?.examType ?? base.profile.examType) },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : base.tasks,
    materials,
    cards,
    focusSessions: Array.isArray(raw.focusSessions) ? raw.focusSessions : base.focusSessions,
    decisions: Array.isArray(raw.decisions) ? raw.decisions : base.decisions,
    purchase: normalizePurchase(raw.purchase, base.purchase),
  };
}

export async function loadAppData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return normalizeAppData(parsed);
  } catch (error) {
    console.warn('Failed to load app data', error);
    return createInitialData();
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  const normalized = normalizeAppData(data);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...normalized, lastOpenedAt: new Date().toISOString() }));
}

export async function resetAppData(): Promise<AppData> {
  const next = createInitialData();
  await saveAppData(next);
  return next;
}

export async function exportAppData(data: AppData): Promise<string> {
  return JSON.stringify(normalizeAppData(data), null, 2);
}

export async function importAppData(raw: string): Promise<AppData> {
  const parsed = normalizeAppData(JSON.parse(raw) as Partial<AppData>);
  await saveAppData(parsed);
  return parsed;
}
