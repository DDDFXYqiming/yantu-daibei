import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Alert, Animated, Easing, Image, ImageBackground, LayoutAnimation, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { FormSheet } from '../components/FormSheet';
import { MetricTile } from '../components/MetricTile';
import { StatusPill } from '../components/StatusPill';
import { SubjectPicker } from '../components/SubjectPicker';
import { DocxImportError, MAX_DOCX_BYTES, extractDocxText } from '../services/docx';
import { getDefaultSubject, getExamCopy, isSubjectForExam } from '../services/exam';
import {
  MATERIAL_TEXT_LIMIT,
  buildMaterialPreview,
  cardsFromDrafts,
  cleanText,
  createMaterialCardDraft,
  createMaterial,
  isLowQualityStudyPoint,
  isUsableReviewCard,
  type MaterialCardDraft,
  type MaterialPreview,
} from '../services/materials';
import { MAX_OCR_IMAGE_BYTES, OcrImportError, recognizeImageText } from '../services/ocr';
import { MAX_PDF_BYTES, PDF_MIME, PdfImportError, extractPdfText } from '../services/pdf';
import { subjectAccent, subjectSoftBg, subjectTone } from '../services/subjects';
import { confirmAction, showToast } from '../services/ui';
import { colors, styles } from '../styles';
import { AppData, AppTab, Material, ReviewCard, Subject } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void; onNavigate?: (tab: AppTab) => void; onReviewMaterial?: (materialId: string) => void };
type ImportMode = 'paste' | 'manual' | 'text-file' | 'docx-file' | 'pdf-file' | 'image-file' | 'camera';
type ImportIcon = 'paste' | 'camera' | 'image' | 'file';
type LibraryFilter = 'all' | 'recent' | 'active' | 'due' | 'pending' | 'generated' | 'archived';
type LibraryLayout = 'grid' | 'list';
type DocumentPickerModule = typeof import('expo-document-picker');
type ImagePickerModule = typeof import('expo-image-picker');
type FileCtor = typeof import('expo-file-system').File;

const MAX_TEXT_IMPORT_BYTES = 1024 * 1024;
const FREE_MATERIAL_LIMIT = 4;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const libraryHeroImage = require('../../assets/library-hero.png');
const materialCoverBlue = require('../../assets/material-cover-blue.png');
const materialCoverTeal = require('../../assets/material-cover-teal.png');
const materialCoverOrange = require('../../assets/material-cover-orange.png');
declare const require: any;

function sourceLabel(mode: ImportMode): string {
  if (mode === 'manual') return '手动输入';
  if (mode === 'text-file') return 'TXT / Markdown';
  if (mode === 'docx-file') return 'Word / DOCX';
  if (mode === 'pdf-file') return 'PDF 导入';
  if (mode === 'image-file') return '图片识别';
  if (mode === 'camera') return '拍照识别';
  return '粘贴文本';
}

function importBadgeFromSource(sourceType: string): string {
  if (sourceType.includes('PDF')) return 'PDF';
  if (sourceType.includes('DOCX') || sourceType.includes('Word')) return 'DOCX';
  if (sourceType.includes('图片') || sourceType.includes('拍照')) return '图片';
  return 'TXT';
}

function stripExtension(name: string): string {
  return name.replace(/\.(txt|md|markdown|docx|pdf|png|jpg|jpeg|webp|heic)$/i, '').trim();
}

function isNumericImportTitle(title: string): boolean {
  return /^[\d_\-\s]{6,}$/.test(title.trim());
}

function firstValidTitleLine(text: string): string {
  const lines = cleanText(text)
    .split(/\n+/)
    .map((line) => line.trim().replace(/^#+\s*/, ''))
    .filter((line) => line.length >= 4 && line.length <= 32 && !isNumericImportTitle(line));
  return lines[0] ?? '';
}

function deriveImportTitle(fileName: string | undefined, text: string, fallback = '未命名资料'): string {
  const fromFile = stripExtension(fileName ?? '');
  if (fromFile && !isNumericImportTitle(fromFile)) return fromFile;
  return firstValidTitleLine(text) || fallback;
}

function isSupportedTextAsset(name: string, mimeType?: string): boolean {
  const lowerName = name.toLowerCase();
  const allowedName = lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown');
  const allowedMime = mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/x-markdown';
  return allowedName || allowedMime;
}

function isSupportedDocxAsset(name: string, mimeType?: string): boolean {
  return name.toLowerCase().endsWith('.docx') || mimeType === DOCX_MIME;
}

function isSupportedPdfAsset(name: string, mimeType?: string): boolean {
  return name.toLowerCase().endsWith('.pdf') || mimeType === PDF_MIME;
}

function loadDocumentPicker(): DocumentPickerModule | null {
  try {
    return require('expo-document-picker');
  } catch (error) {
    console.warn('Document import module unavailable', error);
    return null;
  }
}

function loadFileCtor(): FileCtor | null {
  try {
    return require('expo-file-system').File;
  } catch (error) {
    console.warn('File reader module unavailable', error);
    return null;
  }
}

function loadImagePicker(): ImagePickerModule | null {
  try {
    return require('expo-image-picker');
  } catch (error) {
    console.warn('Image import module unavailable', error);
    return null;
  }
}

function showImportModuleUnavailable() {
  Alert.alert('需要更新 App', '当前版本暂时无法使用这个导入入口，请更新到最新版后再试。');
}

function ImportGlyph({ icon }: { icon: ImportIcon }) {
  if (icon === 'paste') {
    return (
      <>
        <View style={styles.importGlyphDocFold} />
        <View style={styles.importGlyphLine} />
        <View style={styles.importGlyphLineShort} />
      </>
    );
  }
  if (icon === 'camera') {
    return (
      <>
        <View style={styles.importGlyphCameraBody} />
        <View style={styles.importGlyphCameraLens} />
        <View style={styles.importGlyphCameraTop} />
      </>
    );
  }
  if (icon === 'image') {
    return (
      <>
        <View style={styles.importGlyphImageFrame} />
        <View style={styles.importGlyphImageSun} />
        <View style={styles.importGlyphImageMountain} />
      </>
    );
  }
  return (
    <>
      <View style={styles.importGlyphFolderTab} />
      <View style={styles.importGlyphFolderBody} />
    </>
  );
}

function ImportPrimaryOption({
  title,
  description,
  meta,
  icon,
  tone,
  disabled,
  testID,
  onPress,
}: {
  title: string;
  description: string;
  meta: string;
  icon: ImportIcon;
  tone: 'blue' | 'teal' | 'orange';
  disabled?: boolean;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <Pressable testID={testID} accessibilityLabel={title} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.importPrimary, pressed ? styles.pressedSurface : null, disabled ? styles.importOptionDisabled : null]}>
      <View style={[styles.importPrimaryIcon, styles[`importPrimaryIcon_${tone}`]]}>
        <ImportGlyph icon={icon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.importPrimaryTitle}>{title}</Text>
        <Text style={styles.sub}>{description}</Text>
      </View>
      <View style={styles.importPrimaryRight}>
        <Text style={styles.importPrimaryMeta}>{meta}</Text>
        <Text style={styles.importChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function ImportFileOption({
  title,
  description,
  badge,
  icon,
  onPress,
  disabled,
}: {
  title: string;
  description: string;
  badge: string;
  icon: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.importOption, pressed ? styles.pressedSurface : null, disabled ? styles.importOptionDisabled : null]}>
      <View style={styles.importOptionRow}>
        <Text style={styles.importFileIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.h3}>{title}</Text>
          <Text style={styles.sub}>{description}</Text>
        </View>
        <StatusPill label={badge} tone={disabled ? 'gray' : 'blue'} />
        <Text style={styles.importChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function materialNeedsReview(material: Material): boolean {
  return material.qualityStatus === 'needs_review'
    || material.qualityStatus === 'rejected'
    || isLowQualityStudyPoint(material.rawText || material.title, material.subject);
}

function rejectedReasonLabel(reason: string): string {
  if (reason === 'business_news') return '商业新闻/财报';
  if (reason === 'tech_requirement') return '技术需求/日志';
  if (reason === 'noisy_ocr') return '杂乱 OCR';
  if (reason === 'too_short') return '片段过短';
  return '学习价值不足';
}

function materialStatus(material: Material, cardCount: number, dueCount: number, reviewedCount: number): { label: string; tone: 'blue' | 'teal' | 'orange' | 'gray' } {
  if (material.archivedAt) return { label: '已归档', tone: 'gray' };
  if (materialNeedsReview(material)) return { label: '需检查', tone: 'orange' };
  if (cardCount === 0) return { label: '待拆卡', tone: 'orange' };
  if (dueCount > 0) return { label: '到期复盘', tone: 'orange' };
  if (reviewedCount === 0) return { label: '新导入', tone: 'blue' };
  return { label: '已入库', tone: 'teal' };
}

function latestReviewedAt(cards: ReviewCard[]): string | undefined {
  return cards
    .map((card) => card.lastReviewedAt)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => b.localeCompare(a))[0];
}

function materialReviewLabel(material: Material, cards: ReviewCard[]): string {
  const reviewedAt = latestReviewedAt(cards);
  return reviewedAt ? `最近复盘 ${reviewedAt.slice(0, 10)}` : `新导入 ${material.createdAt.slice(0, 10)}`;
}

function materialProgress(cards: ReviewCard[]): number {
  if (cards.length === 0) return 0;
  return Math.round((cards.filter((card) => Boolean(card.lastReviewedAt)).length / cards.length) * 100);
}

function materialNextAction(cardCount: number, dueCount: number, reviewedCount: number): { label: string; detail: string; tone: 'blue' | 'teal' | 'orange' } {
  if (cardCount === 0) return { label: '检查原文', detail: '生成带背卡', tone: 'orange' };
  if (dueCount > 0) return { label: '清到期卡', detail: `${dueCount} 张待复盘`, tone: 'orange' };
  if (reviewedCount === 0) return { label: '背第一轮', detail: '建立记忆痕迹', tone: 'blue' };
  return { label: '提前巩固', detail: '保持熟悉度', tone: 'teal' };
}

function sourceBadge(material: Material): string {
  const source = material.sourceType ?? '';
  if (source.includes('PDF')) return 'PDF';
  if (source.includes('DOCX') || source.includes('Word')) return 'DOCX';
  if (source.includes('图片') || source.includes('拍照')) return '图片';
  return 'TXT';
}

function sourceGlyph(material: Material): string {
  const badge = sourceBadge(material);
  if (badge === 'PDF') return 'PDF';
  if (badge === 'DOCX') return 'Aa';
  if (badge === '图片') return 'IMG';
  return 'TXT';
}

function materialSourceLabel(material: Material): string {
  const badge = sourceBadge(material);
  if (badge === 'PDF') return 'PDF 文件';
  if (badge === 'DOCX') return 'Word 文档';
  if (badge === '图片') return '图片识别';
  return material.sourceType ?? '文本资料';
}

function materialSubjectLabel(material: Material, examType: AppData['profile']['examType']): string {
  return isSubjectForExam(material.subject, examType) ? material.subject : '历史资料';
}

function materialCoverImage(subject: Subject) {
  if (subject === '英语') return materialCoverTeal;
  if (subject === '政治' || subject === '调剂' || subject === '复试') return materialCoverOrange;
  return materialCoverBlue;
}

function documentStatusTone(statusTone: 'blue' | 'teal' | 'orange' | 'gray') {
  if (statusTone === 'teal') return styles.materialDocMiniStatusTeal;
  if (statusTone === 'orange') return styles.materialDocMiniStatusOrange;
  if (statusTone === 'gray') return styles.materialDocMiniStatusGray;
  return styles.materialDocMiniStatusBlue;
}

function DocumentArtifact({ material, statusLabel, statusTone }: { material: Material; statusLabel: string; statusTone: 'blue' | 'teal' | 'orange' | 'gray' }) {
  const badge = sourceBadge(material);
  const accent = subjectAccent(material.subject);
  return (
    <View style={styles.materialDocArtifactWrap}>
      <Image source={materialCoverImage(material.subject)} style={styles.materialDocArtifactBg} resizeMode="cover" />
      <View style={styles.materialDocArtifactVeil} />
      <View style={[styles.materialDocMiniStatus, documentStatusTone(statusTone)]}>
        <Text style={[styles.materialDocMiniStatusText, statusTone === 'orange' ? styles.materialDocMiniStatusTextOrange : statusTone === 'teal' ? styles.materialDocMiniStatusTextTeal : statusTone === 'gray' ? styles.materialDocMiniStatusTextGray : null]}>
          {statusLabel}
        </Text>
      </View>
      <View style={styles.materialPaperThumb}>
        <View style={styles.materialPaperFold} />
        <Text style={styles.materialPaperSymbol}>{sourceGlyph(material)}</Text>
        <View style={styles.materialPaperLine} />
        <View style={[styles.materialPaperLine, styles.materialPaperLineShort]} />
        <Text style={[styles.materialPaperBadge, { backgroundColor: accent }]}>{badge}</Text>
      </View>
    </View>
  );
}

function MaterialPipelineBadge({ cardCount, reviewedCount }: { cardCount: number; reviewedCount: number }) {
  const steps = [
    { label: '原文', done: true },
    { label: '卡片', done: cardCount > 0 },
    { label: '复盘', done: reviewedCount > 0 },
  ];
  return (
    <View style={styles.materialPipelineBadge}>
      {steps.map((step, index) => (
        <React.Fragment key={step.label}>
          <View style={step.done ? styles.materialPipelineStepDone : styles.materialPipelineStepIdle}>
            <Text style={step.done ? styles.materialPipelineStepTextDone : styles.materialPipelineStepTextIdle}>{step.label}</Text>
          </View>
          {index < steps.length - 1 ? <View style={styles.materialPipelineConnector} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function FreshMaterialFlow({ count, onReview }: { count: number; onReview?: () => void }) {
  return (
    <View style={styles.materialFreshFlow}>
      <View style={styles.materialFreshFlowHeader}>
        <Text style={styles.materialFreshFlowTitle}>入库完成</Text>
        <Text style={styles.materialFreshFlowCount}>{count} 张新卡</Text>
      </View>
      <View style={styles.materialFreshFlowSteps}>
        <View style={styles.materialFreshStepDone}><Text style={styles.materialFreshStepTextDone}>原文</Text></View>
        <View style={styles.materialFreshLine} />
        <View style={styles.materialFreshStepDone}><Text style={styles.materialFreshStepTextDone}>拆卡</Text></View>
        <View style={styles.materialFreshLine} />
        <View style={styles.materialFreshStepNow}><Text style={styles.materialFreshStepTextNow}>复盘</Text></View>
      </View>
      <View style={styles.materialFreshQueue}>
        <View style={styles.materialFreshQueueDot} />
        <Text style={styles.materialFreshQueueText} numberOfLines={1}>已加入今日复盘队列，第一轮从这里开始。</Text>
      </View>
      {onReview ? (
        <Pressable onPress={onReview} style={styles.materialFreshReviewButton}>
          <Text style={styles.materialFreshReviewText}>开始第一轮</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SearchGlyph() {
  return (
    <View style={styles.searchGlyph}>
      <View style={styles.searchGlyphCircle} />
      <View style={styles.searchGlyphHandle} />
    </View>
  );
}

function LibraryLayoutGlyph({ layout }: { layout: LibraryLayout }) {
  if (layout === 'grid') {
    return (
      <View style={styles.layoutGlyphList}>
        <View style={styles.layoutGlyphLine} />
        <View style={styles.layoutGlyphLine} />
        <View style={styles.layoutGlyphLine} />
      </View>
    );
  }
  return (
    <View style={styles.layoutGlyphGrid}>
      <View style={styles.layoutGlyphCell} />
      <View style={styles.layoutGlyphCell} />
      <View style={styles.layoutGlyphCell} />
      <View style={styles.layoutGlyphCell} />
    </View>
  );
}

function PlusGlyph() {
  return (
    <View style={styles.plusGlyph}>
      <View style={styles.plusGlyphVertical} />
      <View style={styles.plusGlyphHorizontal} />
    </View>
  );
}

function FabPlusGlyph() {
  return (
    <View style={styles.plusGlyph}>
      <View style={styles.plusGlyphVerticalLight} />
      <View style={styles.plusGlyphHorizontalLight} />
    </View>
  );
}

export function MaterialsScreen({ data, setData, onNavigate, onReviewMaterial }: Props) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<Subject>(() => getDefaultSubject(data.profile.examType));
  const [tags, setTags] = useState('');
  const [rawText, setRawText] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('paste');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceStep, setSourceStep] = useState<'main' | 'image' | 'file'>('main');
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<MaterialPreview | null>(null);
  const [drafts, setDrafts] = useState<MaterialCardDraft[]>([]);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [imageImporting, setImageImporting] = useState(false);
  const [fileImporting, setFileImporting] = useState<'docx' | 'pdf' | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [libraryLayout, setLibraryLayout] = useState<LibraryLayout>('grid');
  const [query, setQuery] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [actionMaterialId, setActionMaterialId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [detailCardsExpanded, setDetailCardsExpanded] = useState(false);
  const [savedMaterial, setSavedMaterial] = useState<{ id: string; title: string; count: number; subject: Subject; sourceType: string } | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingAnswer, setEditingAnswer] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const importSuccessMotion = useRef(new Animated.Value(0)).current;
  const examCopy = getExamCopy(data.profile);

  useEffect(() => {
    if (!isSubjectForExam(subject, data.profile.examType)) {
      setSubject(getDefaultSubject(data.profile.examType));
    }
  }, [data.profile.examType, subject]);

  useEffect(() => {
    setDetailCardsExpanded(false);
  }, [selectedMaterialId]);

  const materialLimitReached = !data.purchase.isPremium && data.materials.length >= FREE_MATERIAL_LIMIT;
  const usableCards = useMemo(() => data.cards.filter(isUsableReviewCard), [data.cards]);
  const visibleMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    const active = data.materials.filter((item) => !item.archivedAt);
    const sorted = [...data.materials].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const earliestDueTime = (materialId: string) => Math.min(
      ...usableCards
        .filter((card) => card.materialId === materialId && new Date(card.dueAt).getTime() <= now)
        .map((card) => new Date(card.dueAt).getTime()),
    );
    const filtered = libraryFilter === 'recent'
      ? [...active].sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)).slice(0, 6)
      : libraryFilter === 'active'
        ? sorted.filter((item) => !item.archivedAt)
        : libraryFilter === 'due'
          ? sorted
            .filter((item) => !item.archivedAt && usableCards.some((card) => card.materialId === item.id && new Date(card.dueAt).getTime() <= now))
            .sort((a, b) => earliestDueTime(a.id) - earliestDueTime(b.id) || b.createdAt.localeCompare(a.createdAt))
        : libraryFilter === 'pending'
          ? sorted.filter((item) => !item.archivedAt && !usableCards.some((card) => card.materialId === item.id))
        : libraryFilter === 'generated'
          ? sorted.filter((item) => !item.archivedAt && usableCards.some((card) => card.materialId === item.id))
        : libraryFilter === 'archived'
          ? sorted.filter((item) => Boolean(item.archivedAt))
        : sorted;
    const searched = normalizedQuery ? filtered.filter((item) => {
      const haystack = `${item.title} ${item.subject} ${item.tags.join(' ')} ${item.rawText}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    }) : filtered;
    if (!savedMaterial) return searched;
    return [...searched].sort((a, b) => {
      if (a.id === savedMaterial.id) return -1;
      if (b.id === savedMaterial.id) return 1;
      return 0;
    });
  }, [data.materials, libraryFilter, query, savedMaterial, usableCards]);
  const activeMaterials = data.materials.filter((item) => !item.archivedAt);
  const archivedMaterials = data.materials.filter((item) => item.archivedAt);
  const reviewReadyMaterials = activeMaterials.filter((item) => (
    !materialNeedsReview(item)
    && usableCards.some((card) => card.materialId === item.id)
  ));
  const latestOpenedMaterial = [...(reviewReadyMaterials.length ? reviewReadyMaterials : activeMaterials)]
    .sort((a, b) => (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt))[0];
  const pendingMaterials = activeMaterials.filter((item) => !usableCards.some((card) => card.materialId === item.id));
  const generatedCount = activeMaterials.filter((item) => usableCards.some((card) => card.materialId === item.id)).length;
  const dueMaterialCount = activeMaterials.filter((item) => usableCards.some((card) => card.materialId === item.id && new Date(card.dueAt).getTime() <= Date.now())).length;
  const selectedMaterial = data.materials.find((item) => item.id === selectedMaterialId) ?? null;
  const actionMaterial = data.materials.find((item) => item.id === actionMaterialId) ?? null;
  const selectedCards = selectedMaterial ? usableCards.filter((card) => card.materialId === selectedMaterial.id) : [];
  const selectedDueCards = selectedCards
    .filter((card) => new Date(card.dueAt).getTime() <= Date.now())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const selectedCardQueue = selectedDueCards.length ? selectedDueCards : [...selectedCards].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const selectedPreviewCards = detailCardsExpanded ? selectedCardQueue : selectedCardQueue.slice(0, 3);
  const selectedReviewedCount = selectedCards.filter((card) => Boolean(card.lastReviewedAt)).length;
  const selectedProgress = materialProgress(selectedCards);
  const importingLabel = imageImporting
    ? '正在识别图片资料'
    : fileImporting === 'docx'
      ? '正在解析 Word 文档'
      : fileImporting === 'pdf'
        ? '正在解析 PDF 文件'
        : '';
  const hasSearch = query.trim().length > 0;
  const emptyLibraryTitle = hasSearch
    ? '没有找到匹配资料'
    : libraryFilter === 'due'
      ? '到期资料已清空'
      : libraryFilter === 'pending'
        ? '没有待处理资料'
      : libraryFilter === 'archived'
        ? '还没有归档资料'
      : libraryFilter === 'generated'
        ? '还没有生成卡片'
        : libraryFilter === 'recent'
          ? '最近还没有打开资料'
          : '这里暂时为空';
  const emptyLibraryDescription = hasSearch
    ? '换一个关键词，或者清空搜索后查看全部资料。'
    : libraryFilter === 'due'
      ? '当前没有需要立即复盘的资料，可以回全部资料继续整理或提前巩固。'
      : libraryFilter === 'pending'
        ? '所有资料都已经生成了带背卡，可以从到期或最近继续复盘。'
      : libraryFilter === 'archived'
        ? '归档后的资料会收在这里，需要时可以打开详情移出归档。'
      : libraryFilter === 'generated'
        ? '导入资料并保存带背卡后，这里会显示可复盘内容。'
        : libraryFilter === 'recent'
          ? '打开任意资料后，它会出现在最近列表。'
          : '换一个分类，或者导入一份新资料。';
  const emptyLibraryActionTitle = hasSearch ? '清空搜索' : libraryFilter === 'all' ? '导入资料' : '查看全部';
  const emptyLibraryAction = hasSearch ? () => setQuery('') : libraryFilter === 'all' ? openSourceSheet : () => setLibraryFilter('all');
  const librarySectionTitle = hasSearch
    ? '搜索结果'
    : libraryFilter === 'all'
      ? '资料文档'
      : libraryFilter === 'recent'
        ? '最近打开'
      : libraryFilter === 'due'
        ? '到期复盘'
      : libraryFilter === 'pending'
        ? '待拆卡资料'
      : libraryFilter === 'generated'
        ? '已生成卡片'
        : '归档资料';
  const librarySectionHint = hasSearch
    ? `匹配 ${visibleMaterials.length} 份资料`
    : libraryFilter === 'all'
      ? `${activeMaterials.length} 份未归档 · ${archivedMaterials.length} 份归档`
      : `${visibleMaterials.length} 份资料`;

  useEffect(() => {
    if (!savedMaterial) return;
    importSuccessMotion.setValue(0);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    Animated.sequence([
      Animated.timing(importSuccessMotion, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(importSuccessMotion, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [importSuccessMotion, savedMaterial]);

  function canStartImport(): boolean {
    if (materialLimitReached) {
      Alert.alert('免费版限制', `免费版最多保存 ${FREE_MATERIAL_LIMIT} 份资料。请删除旧资料或解锁 Pro。`);
      return false;
    }
    if (fileImporting || imageImporting) {
      Alert.alert('正在处理', '当前资料还在解析，请稍后再试。');
      return false;
    }
    return true;
  }

  function openSourceSheet() {
    setSourceOpen(true);
    setSourceStep('main');
  }

  function closeSourceSheet() {
    if (sourceStep !== 'main') {
      setSourceStep('main');
      return;
    }
    setSourceOpen(false);
    setSourceStep('main');
  }

  function openTextEditor(mode: ImportMode, nextTitle = '', nextText = '', nextTags = '') {
    setImportMode(mode);
    setTitle(nextTitle);
    setRawText(nextText);
    setTags(nextTags);
    setPreview(null);
    setDrafts([]);
    setSavingMaterial(false);
    setSourceOpen(false);
    setEditorOpen(true);
  }

  function fillSampleMaterial() {
    const isCivil = data.profile.examType === '考公';
    setTitle(isCivil ? '申论对策示例资料' : '民法总则带背示例资料');
    setSubject(isCivil ? '申论' : '专业课');
    setTags(isCivil ? '申论 示例' : '专业课 示例');
    setRawText(isCivil
      ? '申论归纳概括题要先锁定问题、原因、影响和对策，再用材料原词压缩表达。综合分析题需要先亮明观点，再解释材料逻辑，最后回到治理启示。提出对策题要区分政府、基层组织、企业和群众等责任主体。基层治理材料可以从群众需求、部门协同、数字工具和长效评估展开。公文写作要先判断文种、对象和目的，再安排标题、称谓、正文和结尾。大作文立意要围绕材料主题，避免脱离材料写空泛口号。论证段落要有观点句、解释句、例证句和回扣句。材料中的数字和案例可作为论据，但不能堆砌摘抄。面试衔接申论时，要把政策理解转成可执行表达。复盘申论错题要记录审题偏差、要点遗漏和表达冗余。'
      : '民事法律关系是民法调整平等主体之间人身关系和财产关系形成的权利义务关系。意思表示是民事法律行为的核心，成立需要效果意思、表示行为和到达规则。无效民事法律行为自始没有法律约束力，常见原因包括违反强制性规定、恶意串通损害他人权益。可撤销民事法律行为在撤销前有效，撤销事由包括重大误解、欺诈、胁迫和显失公平。代理制度区分有权代理、无权代理和表见代理，复习时要抓住代理权限和相对人信赖。表见代理的构成要件包括无权代理外观、相对人善意无过失、本人原因造成权利外观。物权变动遵循公示原则，不动产登记生效，动产交付生效，但法律另有规定除外。善意取得要求处分人无处分权、受让人善意、合理价格、完成公示。合同成立关注要约和承诺，合同生效还要看主体能力、意思表示真实和内容合法。违约责任的承担方式包括继续履行、采取补救措施、赔偿损失、支付违约金。侵权责任判断要看行为、损害、因果关系和过错，特殊侵权注意举证责任倒置。复试问到民法学习方法时，要结合真题、案例和体系化背诵说明。');
    showToast('已填入一份示例资料');
  }

  async function pickTextFile() {
    if (!canStartImport()) return;
    const DocumentPicker = loadDocumentPicker();
    const File = loadFileCtor();
    if (!DocumentPicker || !File) {
      showImportModuleUnavailable();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/markdown', 'text/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !isSupportedTextAsset(asset.name, asset.mimeType)) {
        Alert.alert('暂不支持此文件', '请选择 TXT 或 Markdown 文本文件。');
        return;
      }
      if (asset.size && asset.size > MAX_TEXT_IMPORT_BYTES) {
        Alert.alert('文件过大', '当前单个文本文件建议不超过 1 MB，请先拆分后导入。');
        return;
      }

      const text = await new File(asset.uri).text();
      if (cleanText(text).length < 20) {
        Alert.alert('资料太短', '文件内容不足 20 个字，暂时无法生成带背卡。');
        return;
      }

      const nextText = text.length > MATERIAL_TEXT_LIMIT ? text.slice(0, MATERIAL_TEXT_LIMIT) : text;
      openTextEditor('text-file', deriveImportTitle(asset.name, nextText), nextText, '文件导入');
      if (text.length > MATERIAL_TEXT_LIMIT) {
        Alert.alert('已截取前半部分', `当前最多处理 ${MATERIAL_TEXT_LIMIT} 个字，超出部分未导入。`);
      }
    } catch (error) {
      Alert.alert('导入失败', '无法读取这个文件，请换一个 TXT 或 Markdown 文件再试。');
    }
  }

  async function pickDocxFile() {
    if (!canStartImport()) return;
    const DocumentPicker = loadDocumentPicker();
    const File = loadFileCtor();
    if (!DocumentPicker || !File) {
      showImportModuleUnavailable();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [DOCX_MIME, 'application/msword', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !isSupportedDocxAsset(asset.name, asset.mimeType)) {
        Alert.alert('暂不支持此文件', '请选择 DOCX 文件。旧版 DOC 可先另存为 DOCX 后导入。');
        return;
      }
      if (asset.size && asset.size > MAX_DOCX_BYTES) {
        Alert.alert('文件过大', '当前单个 DOCX 文件建议不超过 5 MB，请先拆分后导入。');
        return;
      }

      setFileImporting('docx');
      const arrayBuffer = await new File(asset.uri).arrayBuffer();
      const text = await extractDocxText(arrayBuffer);
      if (cleanText(text).length < 20) {
        Alert.alert('资料太短', '这个 DOCX 提取出的正文不足 20 个字，暂时无法生成带背卡。');
        return;
      }

      const nextText = text.length > MATERIAL_TEXT_LIMIT ? text.slice(0, MATERIAL_TEXT_LIMIT) : text;
      openTextEditor('docx-file', deriveImportTitle(asset.name, nextText), nextText, 'Word导入');
      if (text.length > MATERIAL_TEXT_LIMIT) {
        Alert.alert('已截取前半部分', `当前最多处理 ${MATERIAL_TEXT_LIMIT} 个字，超出部分未导入。`);
      }
    } catch (error) {
      const message = error instanceof DocxImportError ? error.message : '无法读取这个 DOCX 文件，请换一个文件再试。';
      Alert.alert('导入失败', message);
    } finally {
      setFileImporting(null);
    }
  }

  async function pickPdfFile() {
    if (!canStartImport()) return;
    const DocumentPicker = loadDocumentPicker();
    if (!DocumentPicker) {
      showImportModuleUnavailable();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [PDF_MIME, '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !isSupportedPdfAsset(asset.name, asset.mimeType)) {
        Alert.alert('暂不支持此文件', '请选择 PDF 文件。');
        return;
      }
      if (asset.size && asset.size > MAX_PDF_BYTES) {
        Alert.alert('文件过大', '当前单个 PDF 文件建议不超过 15 MB，请先拆分后导入。');
        return;
      }

      setFileImporting('pdf');
      const text = await extractPdfText(asset.uri);
      if (cleanText(text).length < 20) {
        Alert.alert('资料太短', '这个 PDF 提取出的文字不足 20 个字，暂时无法生成带背卡。');
        return;
      }

      const nextText = text.length > MATERIAL_TEXT_LIMIT ? text.slice(0, MATERIAL_TEXT_LIMIT) : text;
      openTextEditor('pdf-file', deriveImportTitle(asset.name, nextText), nextText, 'PDF导入');
      if (text.length > MATERIAL_TEXT_LIMIT) {
        Alert.alert('已截取前半部分', `当前最多处理 ${MATERIAL_TEXT_LIMIT} 个字，超出部分未导入。`);
      }
    } catch (error) {
      const message = error instanceof PdfImportError ? error.message : '无法读取这个 PDF 文件，请换一个文件再试。';
      Alert.alert('导入失败', message);
    } finally {
      setFileImporting(null);
    }
  }

  async function pickImageFromLibrary() {
    if (!canStartImport()) return;
    const ImagePicker = loadImagePicker();
    if (!ImagePicker) {
      showImportModuleUnavailable();
      return;
    }
    setSourceOpen(false);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('无法访问相册', '请允许访问相册后再导入图片资料。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;
      await importImageAsset(result.assets[0], 'image-file');
    } catch (error) {
      showImageImportError(error);
    }
  }

  async function takePhotoForOcr() {
    if (!canStartImport()) return;
    const ImagePicker = loadImagePicker();
    if (!ImagePicker) {
      showImportModuleUnavailable();
      return;
    }
    setSourceOpen(false);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('无法使用相机', '请允许使用相机后再拍照识别。');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;
      await importImageAsset(result.assets[0], 'camera');
    } catch (error) {
      showImageImportError(error);
    }
  }

  async function importImageAsset(asset: ImagePickerAsset | undefined, mode: 'image-file' | 'camera') {
    if (!asset?.uri) {
      Alert.alert('导入失败', '没有读取到图片。');
      return;
    }
    if (asset.type && asset.type !== 'image') {
      Alert.alert('暂不支持此文件', '请选择图片文件。');
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_OCR_IMAGE_BYTES) {
      Alert.alert('图片过大', '当前单张图片建议不超过 12 MB，请先压缩或裁剪后再导入。');
      return;
    }

    setImageImporting(true);
    try {
      const text = await recognizeImageText(asset.uri);
      if (cleanText(text).length < 20) {
        Alert.alert('识别文字太少', '这张图片识别出的文字不足 20 个字，请换一张更清晰的图片。');
        return;
      }

      const nextText = text.length > MATERIAL_TEXT_LIMIT ? text.slice(0, MATERIAL_TEXT_LIMIT) : text;
      const fallbackTitle = mode === 'camera' ? '拍照资料' : '图片资料';
      const nextTitle = deriveImportTitle(asset.fileName ?? undefined, nextText, fallbackTitle);
      openTextEditor(mode, nextTitle, nextText, mode === 'camera' ? '拍照识别' : '图片识别');
      if (text.length > MATERIAL_TEXT_LIMIT) {
        Alert.alert('已截取前半部分', `当前最多处理 ${MATERIAL_TEXT_LIMIT} 个字，超出部分未导入。`);
      }
    } catch (error) {
      showImageImportError(error);
    } finally {
      setImageImporting(false);
    }
  }

  function showImageImportError(error: unknown) {
    const message = error instanceof OcrImportError ? error.message : '图片识别失败，请换一张更清晰的图片再试。';
    Alert.alert('识别失败', message);
  }

  function generatePreview() {
    const cleaned = cleanText(rawText);
    if (cleaned.length < 20) {
      Alert.alert('资料太短', `请至少输入 20 个字的${examCopy.materialExamples}。`);
      return;
    }

    const nextPreview = buildMaterialPreview(cleaned, subject, data.purchase.isPremium);
    if (nextPreview.drafts.length === 0) {
      setPreview(nextPreview);
      setDrafts([]);
      setSavingMaterial(false);
      setEditorOpen(false);
      setPreviewOpen(true);
      return;
    }

    setPreview(nextPreview);
    setDrafts(nextPreview.drafts);
    setSavingMaterial(false);
    setEditorOpen(false);
    setPreviewOpen(true);
  }

  function removeDraft(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  function markDraftInvalid(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    removeDraft(id);
    showToast('已标记为无效片段');
  }

  function mergeDraftToPrevious(index: number) {
    if (index <= 0) {
      markDraftInvalid(drafts[index]?.id ?? '');
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDrafts((current) => {
      const target = current[index];
      const previous = current[index - 1];
      if (!target || !previous) return current;
      const merged = createMaterialCardDraft(`${previous.sourceText}\n${target.sourceText}`, subject, index - 1);
      return current.map((draft, draftIndex) => draftIndex === index - 1 ? merged : draft).filter((_, draftIndex) => draftIndex !== index);
    });
    showToast('已合并到上一张卡');
  }

  function restoreDrafts() {
    if (!preview) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDrafts(preview.drafts);
    showToast('已恢复预览卡片');
  }

  function openDraftEditor(draft: MaterialCardDraft) {
    setEditingDraftId(draft.id);
    setEditingPrompt(draft.prompt);
    setEditingAnswer(draft.answer);
  }

  function saveDraftEdit() {
    if (!editingDraftId) return;
    const nextPrompt = editingPrompt.trim();
    const nextAnswer = editingAnswer.trim();
    if (nextPrompt.length < 4 || nextAnswer.length < 4) {
      Alert.alert('内容太短', '题面和答案都至少保留 4 个字。');
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDrafts((current) => current.map((draft) => draft.id === editingDraftId ? { ...draft, prompt: nextPrompt, answer: nextAnswer } : draft));
    setEditingDraftId(null);
    setEditingPrompt('');
    setEditingAnswer('');
    showToast('已更新预览卡');
  }

  function saveMaterialAndCards() {
    if (!preview) return;
    if (savingMaterial) return;
    if (materialLimitReached) {
      Alert.alert('免费版限制', `免费版最多保存 ${FREE_MATERIAL_LIMIT} 份资料。请删除旧资料或解锁 Pro。`);
      return;
    }
    if (drafts.length === 0) {
      Alert.alert('没有可保存卡片', '请至少保留 1 张卡片。');
      return;
    }

    setSavingMaterial(true);
    const sourceType = sourceLabel(importMode);
    const material = {
      ...createMaterial(title, subject, preview.cleanedText, tags, sourceType),
      title: deriveImportTitle(title, preview.cleanedText),
      qualityStatus: drafts.length > 0 ? 'usable' as const : 'needs_review' as const,
      rejectedReasons: preview.rejected.flatMap((item) => item.reasons).filter((reason, index, all) => all.indexOf(reason) === index),
      lastOpenedAt: new Date().toISOString(),
    };
    const cards = cardsFromDrafts(material, drafts);
    if (cards.length === 0) {
      setSavingMaterial(false);
      Alert.alert('资料质量需检查', '保留下来的卡片都被识别为低质量内容，暂不进入复盘。请回到文本检查页修改原文。');
      return;
    }
    setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setData({ ...data, materials: [material, ...data.materials], cards: [...cards, ...data.cards] });
      setPreviewOpen(false);
      setLibraryFilter('all');
      setQuery('');
      setSelectedMaterialId(null);
      setSavedMaterial({ id: material.id, title: material.title, count: cards.length, subject: material.subject, sourceType });
      setPreview(null);
      setDrafts([]);
      setSavingMaterial(false);
      setTitle('');
      setRawText('');
      setTags('');
      showToast(`已生成 ${cards.length} 张带背卡`);
    }, 520);
  }

  function removeMaterial(id: string) {
    const target = data.materials.find((item) => item.id === id);
    const linkedCards = data.cards.filter((card) => card.materialId === id).length;
    confirmAction('删除这份资料？', `「${target?.title ?? '这份资料'}」和关联的 ${linkedCards} 张带背卡都会被删除。`, () => {
      setData({
        ...data,
        materials: data.materials.filter((item) => item.id !== id),
        cards: data.cards.filter((card) => card.materialId !== id),
      });
      if (selectedMaterialId === id) setSelectedMaterialId(null);
      if (actionMaterialId === id) setActionMaterialId(null);
      showToast('资料已删除');
    }, '删除');
  }

  function openMaterialActions(id: string) {
    const target = data.materials.find((item) => item.id === id);
    if (!target) return;
    setActionMaterialId(id);
    setRenameTitle(target.title);
  }

  function renameMaterial() {
    if (!actionMaterial) return;
    const nextTitle = renameTitle.trim();
    if (nextTitle.length < 2) {
      Alert.alert('标题太短', '请至少输入 2 个字。');
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({
      ...data,
      materials: data.materials.map((item) => item.id === actionMaterial.id ? { ...item, title: nextTitle } : item),
    });
    setActionMaterialId(null);
    showToast('资料已重命名');
  }

  function openMaterial(id: string) {
    const openedAt = new Date().toISOString();
    setSelectedMaterialId(id);
    setData({
      ...data,
      materials: data.materials.map((item) => item.id === id ? { ...item, lastOpenedAt: openedAt } : item),
    });
  }

  function startReviewFromMaterial(id: string) {
    const openedAt = new Date().toISOString();
    setData({
      ...data,
      materials: data.materials.map((item) => item.id === id ? { ...item, lastOpenedAt: openedAt } : item),
    });
    onReviewMaterial?.(id);
  }

  function generateCardsForMaterial(material: Material) {
    const nextPreview = buildMaterialPreview(material.rawText, material.subject, data.purchase.isPremium);
    if (nextPreview.drafts.length === 0) {
      Alert.alert('资料质量需检查', `这份资料已过滤 ${nextPreview.rejectedCount} 段噪声，暂时没有可背考点。请编辑成讲义、真题或笔记后再拆卡。`);
      return;
    }
    const cards = cardsFromDrafts(material, nextPreview.drafts);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({
      ...data,
      cards: [...cards, ...data.cards],
      materials: data.materials.map((item) => item.id === material.id ? { ...item, lastOpenedAt: new Date().toISOString() } : item),
    });
    showToast(`已生成 ${cards.length} 张带背卡`);
  }

  function toggleArchiveMaterial(id: string) {
    const target = data.materials.find((item) => item.id === id);
    if (!target) return;
    const archivedAt = target.archivedAt ? undefined : new Date().toISOString();
    setData({
      ...data,
      materials: data.materials.map((item) => item.id === id ? { ...item, archivedAt } : item),
    });
    showToast(archivedAt ? '已归档资料' : '已移出归档');
    setSelectedMaterialId(null);
    if (actionMaterialId === id) setActionMaterialId(null);
  }

  return (
    <View style={[styles.app, styles.materialApp]}>
      <ScrollView ref={scrollRef} style={[styles.app, styles.materialApp]} contentContainerStyle={styles.materialContainer}>
      <View style={styles.materialHeader}>
        <View>
          <Text style={styles.title}>资料库</Text>
          <Text style={styles.sub}>{activeMaterials.length} 份资料 · {usableCards.length} 张可复盘卡</Text>
        </View>
        <View style={styles.materialHeaderActions}>
          <Pressable onPress={openSourceSheet} style={({ pressed }) => [styles.materialHeaderImportButton, pressed ? styles.pressedChip : null]}>
            <Text style={styles.materialHeaderImportText}>导入</Text>
          </Pressable>
          <Pressable onPress={() => setLibraryLayout((current) => current === 'grid' ? 'list' : 'grid')} style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressedChip : null]}>
            <LibraryLayoutGlyph layout={libraryLayout} />
          </Pressable>
        </View>
      </View>

      {savedMaterial ? (
        <Animated.View
          style={[
            styles.importSuccessCard,
            {
              opacity: importSuccessMotion,
              transform: [
                {
                  translateY: importSuccessMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0],
                  }),
                },
                {
                  scale: importSuccessMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.97, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.importSuccessHeader}>
            <ImageBackground
              source={materialCoverImage(savedMaterial.subject)}
              style={[styles.importSuccessDocCover, { borderColor: subjectAccent(savedMaterial.subject) }]}
              imageStyle={styles.importSuccessDocCoverImage}
              resizeMode="cover"
            >
              <Text style={[styles.importSuccessDocBadge, { backgroundColor: subjectAccent(savedMaterial.subject) }]}>{importBadgeFromSource(savedMaterial.sourceType)}</Text>
            </ImageBackground>
            <View style={{ flex: 1 }}>
              <Text style={styles.commandEyebrow}>入库完成</Text>
              <Text style={styles.h3} numberOfLines={1}>{savedMaterial.title}</Text>
              <Text style={styles.sub}>已置顶到资料库，并生成第一轮复盘。</Text>
            </View>
            <StatusPill label={`${savedMaterial.count} 张卡`} tone="teal" />
          </View>
          <View style={styles.importSuccessCoach}>
            <View style={styles.importSuccessCoachDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.importSuccessCoachTitle}>现在最该做：背第一轮</Text>
              <Text style={styles.importSuccessCoachText}>先快速过一遍新卡，系统会按不会、模糊、熟悉安排下一次。</Text>
            </View>
          </View>
          <View style={styles.importSuccessProgress}>
            <View style={styles.importSuccessStepDone}><Text style={styles.importSuccessStepTextDone}>资料</Text></View>
            <View style={styles.importSuccessLine} />
            <View style={styles.importSuccessStepDone}><Text style={styles.importSuccessStepTextDone}>拆卡</Text></View>
            <View style={styles.importSuccessLine} />
            <View style={styles.importSuccessStepNow}><Text style={styles.importSuccessStepTextNow}>第一轮</Text></View>
          </View>
          <View style={styles.importSuccessStatusGrid}>
            <View style={styles.importSuccessStatusItem}>
              <Text style={styles.importSuccessStatusValue}>{savedMaterial.count}</Text>
              <Text style={styles.importSuccessStatusLabel}>新卡片</Text>
            </View>
            <View style={styles.importSuccessStatusItem}>
              <Text style={styles.importSuccessStatusValue}>最近</Text>
              <Text style={styles.importSuccessStatusLabel}>已置顶</Text>
            </View>
            <View style={styles.importSuccessStatusItemHot}>
              <Text style={styles.importSuccessStatusValueHot}>今日</Text>
              <Text style={styles.importSuccessStatusLabel}>可复盘</Text>
            </View>
          </View>
          <View style={styles.importSuccessActions}>
            <View style={styles.importSuccessActionRow}>
              <AppButton testID="import-success-view-material" title="查看资料" variant="secondary" onPress={() => { openMaterial(savedMaterial.id); setSavedMaterial(null); }} style={{ flex: 1 }} />
              <AppButton testID="import-success-start-review" title="开始复盘" onPress={() => { setSavedMaterial(null); onReviewMaterial?.(savedMaterial.id); }} style={{ flex: 1 }} />
            </View>
            <AppButton testID="import-success-continue" title="继续导入" variant="secondary" onPress={() => { setSavedMaterial(null); openSourceSheet(); }} />
          </View>
        </Animated.View>
      ) : null}

      {importingLabel ? (
        <View style={styles.importProcessingCard}>
          <View style={styles.importProcessingPulse}>
            <Text style={styles.importProcessingPulseText}>...</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>{importingLabel}</Text>
            <Text style={styles.sub}>完成后会进入文本检查，再生成带背卡预览。</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.searchBox}>
        <SearchGlyph />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索资料、科目、标签或正文"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.libraryTabs}
      >
        <Pressable onPress={() => setLibraryFilter('all')} style={({ pressed }) => [styles.libraryTab, pressed ? styles.pressedChip : null, libraryFilter === 'all' ? styles.libraryTabActive : null]}>
          <Text style={[styles.libraryTabText, libraryFilter === 'all' ? styles.libraryTabTextActive : null]}>全部 {data.materials.length}</Text>
        </Pressable>
        <Pressable onPress={() => setLibraryFilter('recent')} style={({ pressed }) => [styles.libraryTab, pressed ? styles.pressedChip : null, libraryFilter === 'recent' ? styles.libraryTabActive : null]}>
          <Text style={[styles.libraryTabText, libraryFilter === 'recent' ? styles.libraryTabTextActive : null]}>最近</Text>
        </Pressable>
        <Pressable onPress={() => setLibraryFilter('active')} style={({ pressed }) => [styles.libraryTab, pressed ? styles.pressedChip : null, libraryFilter === 'active' ? styles.libraryTabActive : null]}>
          <Text style={[styles.libraryTabText, libraryFilter === 'active' ? styles.libraryTabTextActive : null]}>未归档 {activeMaterials.length}</Text>
        </Pressable>
        <Pressable onPress={() => setLibraryFilter('due')} style={({ pressed }) => [styles.libraryTab, pressed ? styles.pressedChip : null, libraryFilter === 'due' ? styles.libraryTabActive : null]}>
          <Text style={[styles.libraryTabText, libraryFilter === 'due' ? styles.libraryTabTextActive : null]}>到期 {dueMaterialCount}</Text>
        </Pressable>
        <Pressable onPress={() => setLibraryFilter('pending')} style={({ pressed }) => [styles.libraryTab, pressed ? styles.pressedChip : null, libraryFilter === 'pending' ? styles.libraryTabActive : null]}>
          <Text style={[styles.libraryTabText, libraryFilter === 'pending' ? styles.libraryTabTextActive : null]}>待拆卡 {pendingMaterials.length}</Text>
        </Pressable>
        <Pressable onPress={() => setLibraryFilter('generated')} style={({ pressed }) => [styles.libraryTab, pressed ? styles.pressedChip : null, libraryFilter === 'generated' ? styles.libraryTabActive : null]}>
          <Text style={[styles.libraryTabText, libraryFilter === 'generated' ? styles.libraryTabTextActive : null]}>已生成卡片 {generatedCount}</Text>
        </Pressable>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.librarySignalRail}>
        <Pressable
          onPress={() => setLibraryFilter('recent')}
          disabled={!latestOpenedMaterial}
          style={({ pressed }) => [styles.librarySignalCard, pressed ? styles.pressedSurface : null, !latestOpenedMaterial ? styles.librarySignalCardDisabled : null]}
        >
          <Text style={styles.librarySignalLabel}>最近打开</Text>
          <Text style={styles.librarySignalValue} numberOfLines={1}>{latestOpenedMaterial?.title ?? '暂无记录'}</Text>
          <Text style={styles.librarySignalAction}>{latestOpenedMaterial ? '继续整理' : '打开资料后出现'}</Text>
        </Pressable>
        <Pressable
          onPress={() => setLibraryFilter('due')}
          disabled={dueMaterialCount === 0}
          style={({ pressed }) => [styles.librarySignalCard, styles.librarySignalCardHot, pressed ? styles.pressedSurface : null, dueMaterialCount === 0 ? styles.librarySignalCardDisabled : null]}
        >
          <Text style={styles.librarySignalLabelHot}>到期复盘</Text>
          <Text style={styles.librarySignalValueHot}>{dueMaterialCount} 份资料</Text>
          <Text style={styles.librarySignalActionHot}>{dueMaterialCount ? '先清到期卡' : '当前已清空'}</Text>
        </Pressable>
        <Pressable
          onPress={() => setLibraryFilter('pending')}
          disabled={pendingMaterials.length === 0}
          style={({ pressed }) => [styles.librarySignalCard, styles.librarySignalCardTeal, pressed ? styles.pressedSurface : null, pendingMaterials.length === 0 ? styles.librarySignalCardDisabled : null]}
        >
          <Text style={styles.librarySignalLabelTeal}>待拆卡</Text>
          <Text style={styles.librarySignalValueTeal}>{pendingMaterials.length} 份资料</Text>
          <Text style={styles.librarySignalActionTeal}>{pendingMaterials.length ? '补齐复盘入口' : '都已生成卡片'}</Text>
        </Pressable>
        <Pressable
          onPress={openSourceSheet}
          style={({ pressed }) => [styles.librarySignalCard, pressed ? styles.pressedSurface : null]}
        >
          <Text style={styles.librarySignalLabel}>导入状态</Text>
          <Text style={styles.librarySignalValue}>{activeMaterials.length}/{data.purchase.isPremium ? '不限' : FREE_MATERIAL_LIMIT}</Text>
          <Text style={styles.librarySignalAction}>{materialLimitReached ? '可先检查文本' : '继续导入'}</Text>
        </Pressable>
      </ScrollView>
      {data.materials.length === 0 ? (
        <EmptyState title="还没有资料" description={`点右上角导入，把${examCopy.materialExamples}变成带背卡。`} imageSource={libraryHeroImage} />
      ) : visibleMaterials.length === 0 ? (
        <EmptyState title={emptyLibraryTitle} description={emptyLibraryDescription} actionTitle={emptyLibraryActionTitle} onAction={emptyLibraryAction} />
      ) : libraryLayout === 'list' ? (
        <>
          <View style={styles.librarySectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.librarySectionTitle}>{librarySectionTitle}</Text>
              <Text style={styles.librarySectionHint}>{librarySectionHint}</Text>
            </View>
            <StatusPill label="列表" tone="blue" />
          </View>
          <View style={styles.materialList}>
            {visibleMaterials.map((material) => {
            const materialCards = usableCards.filter((card) => card.materialId === material.id);
            const count = materialCards.length;
            const dueCount = materialCards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;
            const reviewedCount = materialCards.filter((card) => Boolean(card.lastReviewedAt)).length;
            const status = materialStatus(material, count, dueCount, reviewedCount);
            const reviewLabel = materialReviewLabel(material, materialCards);
            const progress = materialProgress(materialCards);
            const nextAction = materialNextAction(count, dueCount, reviewedCount);
            const statusLabel = savedMaterial?.id === material.id ? '新导入' : status.label;
            const statusTone = savedMaterial?.id === material.id ? 'blue' : status.tone;
            return (
              <Pressable
                key={material.id}
                style={({ pressed }) => [styles.materialListItem, pressed ? styles.pressedSurface : null, savedMaterial?.id === material.id ? styles.materialListItemNew : null, material.archivedAt ? styles.materialDocCardArchived : null]}
                onPress={() => openMaterial(material.id)}
              >
                <View style={[styles.materialListThumb, { backgroundColor: subjectSoftBg(material.subject), borderColor: subjectAccent(material.subject) }]}>
                  <Text style={[styles.materialListThumbText, { color: subjectAccent(material.subject) }]}>{sourceBadge(material)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.h3} numberOfLines={1}>{material.title}</Text>
                    <StatusPill label={statusLabel} tone={statusTone} />
                  </View>
                  <Text style={styles.sub} numberOfLines={1}>{materialSourceLabel(material)} · {materialSubjectLabel(material, data.profile.examType)} · {count} 张卡片</Text>
                  <View style={styles.materialProgressRowCompact}>
                    <View style={styles.materialProgressTrack}>
                      <View style={[styles.materialProgressFill, { width: `${Math.max(count ? 6 : 0, progress)}%`, backgroundColor: progress >= 60 ? '#13A389' : dueCount > 0 ? colors.orange : subjectAccent(material.subject) }]} />
                    </View>
                    <Text style={styles.materialProgressText}>{progress}%</Text>
                  </View>
                  <Text style={styles.materialDocMeta}>{reviewLabel}</Text>
                  <Text style={[styles.materialDocState, styles[`materialDocState_${nextAction.tone}`]]}>{nextAction.detail}</Text>
                  {savedMaterial?.id === material.id ? <FreshMaterialFlow count={count} onReview={() => startReviewFromMaterial(material.id)} /> : null}
                </View>
                <View style={styles.materialListActions}>
                  <Pressable
                    onPress={(event) => { event.stopPropagation(); startReviewFromMaterial(material.id); }}
                    disabled={count === 0}
                    style={[styles.materialListActionButton, count === 0 ? styles.materialQuickButtonDisabled : null]}
                  >
                    <Text style={styles.materialQuickButtonText}>{nextAction.label}</Text>
                  </Pressable>
                  <Pressable onPress={(event) => { event.stopPropagation(); openMaterialActions(material.id); }} style={styles.materialListActionButtonMuted}>
                    <Text style={styles.materialQuickButtonSecondaryText}>•••</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
            })}
          </View>
        </>
      ) : (
        <>
          <View style={styles.librarySectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.librarySectionTitle}>{librarySectionTitle}</Text>
              <Text style={styles.librarySectionHint}>{librarySectionHint}</Text>
            </View>
            <StatusPill label="网格" tone="blue" />
          </View>
          <View style={styles.materialGrid}>
            {visibleMaterials.map((material) => {
            const materialCards = usableCards.filter((card) => card.materialId === material.id);
            const count = materialCards.length;
            const dueCount = materialCards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;
            const reviewedCount = materialCards.filter((card) => Boolean(card.lastReviewedAt)).length;
            const status = materialStatus(material, count, dueCount, reviewedCount);
            const reviewLabel = materialReviewLabel(material, materialCards);
            const progress = materialProgress(materialCards);
            const nextAction = materialNextAction(count, dueCount, reviewedCount);
            const statusLabel = savedMaterial?.id === material.id ? '新导入' : status.label;
            const statusTone = savedMaterial?.id === material.id ? 'blue' : status.tone;
            return (
              <Pressable
                key={material.id}
                style={({ pressed }) => [styles.materialDocCard, { borderTopColor: subjectAccent(material.subject) }, pressed ? styles.pressedSurface : null, savedMaterial?.id === material.id ? styles.materialDocCardNew : null, material.archivedAt ? styles.materialDocCardArchived : null]}
                onPress={() => openMaterial(material.id)}
              >
                <View style={[styles.materialDocArt, { backgroundColor: subjectSoftBg(material.subject) }]}>
                  <DocumentArtifact material={material} statusLabel={statusLabel} statusTone={statusTone} />
                  {savedMaterial?.id === material.id ? (
                    <View style={styles.materialNewRibbon}>
                      <Text style={styles.materialNewRibbonText}>新导入</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.materialDocBody}>
                  <View style={styles.materialDocTitleRow}>
                    <Text style={styles.materialDocTitle} numberOfLines={2}>{material.title}</Text>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        openMaterialActions(material.id);
                      }}
                      style={({ pressed }) => [styles.materialMoreButton, pressed ? styles.pressedChip : null]}
                    >
                      <Text style={styles.materialMoreText}>•••</Text>
                    </Pressable>
                  </View>
                  <View style={styles.materialMetaRow}>
                    <StatusPill label={materialSubjectLabel(material, data.profile.examType)} tone={isSubjectForExam(material.subject, data.profile.examType) ? subjectTone(material.subject) : 'gray'} />
                    <Text style={styles.materialCardCount}>{count} 张卡片</Text>
                  </View>
                  <View style={styles.materialReviewRow}>
                    <View style={styles.materialClockGlyph}>
                      <View style={styles.materialClockHand} />
                    </View>
                    <Text style={styles.materialDocMeta} numberOfLines={1}>{reviewLabel.replace('最近复盘 ', '').replace('新导入 ', '')} 复习</Text>
                  </View>
                  <View style={styles.materialProgressRow}>
                    <View style={styles.materialProgressTrack}>
                      <View style={[styles.materialProgressFill, { width: `${Math.max(count ? 6 : 0, progress)}%`, backgroundColor: progress >= 60 ? '#13A389' : dueCount > 0 ? colors.orange : subjectAccent(material.subject) }]} />
                    </View>
                    <Text style={styles.materialProgressText}>{progress}%</Text>
                  </View>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      if (count > 0) startReviewFromMaterial(material.id);
                      else openMaterial(material.id);
                    }}
                    style={[styles.materialDocNext, styles[`materialDocNext_${nextAction.tone}`]]}
                  >
                    <Text style={[styles.materialDocNextText, styles[`materialDocNextText_${nextAction.tone}`]]}>{nextAction.label}</Text>
                    <Text style={styles.materialDocNextSub} numberOfLines={1}>{nextAction.detail}</Text>
                  </Pressable>
                  {savedMaterial?.id === material.id ? <FreshMaterialFlow count={count} onReview={() => startReviewFromMaterial(material.id)} /> : null}
                </View>
              </Pressable>
            );
            })}
          </View>
        </>
      )}
      </ScrollView>
      <FormSheet
        visible={Boolean(selectedMaterial)}
        title={selectedMaterial?.title ?? '资料详情'}
        subtitle={selectedMaterial ? `${materialSubjectLabel(selectedMaterial, data.profile.examType)} · ${selectedMaterial.sourceType ?? '粘贴文本'} · ${selectedCards.length} 张卡片` : ''}
        onClose={() => setSelectedMaterialId(null)}
      >
        {selectedMaterial ? (
          <>
            <View style={styles.materialDetailHero}>
              <ImageBackground
                source={materialCoverImage(selectedMaterial.subject)}
                style={[styles.materialDetailDocCover, { borderColor: subjectAccent(selectedMaterial.subject) }]}
                imageStyle={styles.materialDetailDocCoverImage}
                resizeMode="cover"
              >
                <View style={[styles.materialCoverBadge, { backgroundColor: subjectAccent(selectedMaterial.subject) }]}>
                  <Text style={styles.materialCoverBadgeText}>{sourceBadge(selectedMaterial)}</Text>
                </View>
              </ImageBackground>
              <View style={styles.materialDetailHeroCopy}>
                <View style={styles.rowBetween}>
                  <StatusPill label={materialSubjectLabel(selectedMaterial, data.profile.examType)} tone={isSubjectForExam(selectedMaterial.subject, data.profile.examType) ? subjectTone(selectedMaterial.subject) : 'gray'} />
                  <StatusPill label={selectedMaterial.archivedAt ? '已归档' : selectedDueCards.length ? `${selectedDueCards.length} 张到期` : '复盘中'} tone={selectedMaterial.archivedAt ? 'gray' : selectedDueCards.length ? 'orange' : 'teal'} />
                </View>
                <Text style={styles.materialDetailHeroTitle} numberOfLines={2}>{selectedMaterial.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>{selectedMaterial.sourceType ?? '粘贴文本'} · {materialReviewLabel(selectedMaterial, selectedCards)}</Text>
                <View style={styles.materialDetailHeroTrack}>
                  <View style={[styles.materialDetailHeroFill, { width: `${Math.max(selectedCards.length ? 8 : 0, selectedProgress)}%`, backgroundColor: selectedDueCards.length ? colors.orange : colors.teal }]} />
                </View>
                <View style={styles.materialDetailStatsRow}>
                  <View style={styles.materialDetailStat}>
                    <Text style={styles.materialDetailStatValue}>{selectedCards.length}</Text>
                    <Text style={styles.materialDetailStatLabel}>卡片</Text>
                  </View>
                  <View style={styles.materialDetailStat}>
                    <Text style={[styles.materialDetailStatValue, { color: selectedDueCards.length ? '#B95E00' : '#087A7D' }]}>{selectedDueCards.length}</Text>
                    <Text style={styles.materialDetailStatLabel}>到期</Text>
                  </View>
                  <View style={styles.materialDetailStat}>
                    <Text style={styles.materialDetailStatValue}>{selectedProgress}%</Text>
                    <Text style={styles.materialDetailStatLabel}>熟悉度</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.materialDetailCommand}>
              <View style={{ flex: 1 }}>
                <Text style={styles.commandEyebrow}>下一步</Text>
                <Text style={styles.h2}>
                  {selectedMaterial.archivedAt
                    ? '恢复到资料库'
                    : selectedCards.length === 0
                      ? '先生成带背卡'
                      : selectedDueCards.length
                        ? `清 ${selectedDueCards.length} 张到期卡`
                        : '提前巩固这份资料'}
                </Text>
                <Text style={styles.sub}>
                  {selectedMaterial.archivedAt
                    ? '归档资料不会出现在默认资料库，恢复后可继续复盘。'
                    : selectedCards.length === 0
                      ? '这份资料还没有可复盘卡片。'
                      : selectedDueCards.length
                        ? '优先处理到期卡，再继续新增资料。'
                        : '暂无到期卡，可以用提前复盘保持熟悉度。'}
                </Text>
              </View>
              <AppButton
                title={selectedMaterial.archivedAt ? '恢复' : selectedCards.length === 0 ? '生成卡片' : selectedDueCards.length ? '去复盘' : '提前巩固'}
                onPress={() => {
                  if (selectedMaterial.archivedAt) {
                    toggleArchiveMaterial(selectedMaterial.id);
                  } else if (selectedCards.length === 0) {
                    generateCardsForMaterial(selectedMaterial);
                  } else {
                    setSelectedMaterialId(null);
                    onReviewMaterial?.(selectedMaterial.id);
                  }
                }}
              />
            </View>
            <View style={styles.materialDetailFlow}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.commandEyebrow}>资料流程</Text>
                  <Text style={styles.h3}>原文入库 → 拆卡 → 复盘</Text>
                </View>
                <StatusPill label={selectedDueCards.length ? `${selectedDueCards.length} 张到期` : '已入库'} tone={selectedDueCards.length ? 'orange' : 'teal'} />
              </View>
              <MaterialPipelineBadge cardCount={selectedCards.length} reviewedCount={selectedReviewedCount} />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.h2}>带背卡预览</Text>
              <Text style={styles.sub}>{selectedDueCards.length ? `到期 ${selectedDueCards.length}` : `共 ${selectedCards.length}`}</Text>
            </View>
            {selectedPreviewCards.length === 0 ? (
              <Text style={styles.sub}>这份资料还没有生成卡片。</Text>
            ) : selectedPreviewCards.map((card, index) => (
              <View key={card.id} style={styles.materialCardPreview}>
                <View style={styles.rowBetween}>
                  <StatusPill label={new Date(card.dueAt).getTime() <= Date.now() ? '到期' : '未到期'} tone={new Date(card.dueAt).getTime() <= Date.now() ? 'orange' : 'gray'} />
                  <Text style={styles.tiny}>卡片 {index + 1}</Text>
                </View>
                <Text style={styles.h3} numberOfLines={2}>{card.cloze || card.prompt}</Text>
                <Text style={styles.sub} numberOfLines={2}>{card.answer}</Text>
              </View>
            ))}
            {selectedCardQueue.length > 3 ? (
              <Pressable style={styles.materialViewAllCardsButton} onPress={() => setDetailCardsExpanded((value) => !value)}>
                <Text style={styles.materialViewAllCardsText}>{detailCardsExpanded ? '收起卡片' : `查看全部 ${selectedCardQueue.length} 张卡片`}</Text>
              </Pressable>
            ) : null}
            <View style={styles.detailDivider} />
            <View style={styles.materialDetailSourceCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.h3}>原文摘要</Text>
                <StatusPill label={selectedMaterial.sourceType ?? '文本'} tone="gray" />
              </View>
              <Text style={styles.text} numberOfLines={4}>{selectedMaterial.rawText}</Text>
            </View>
            <View style={[styles.wrap, { marginTop: 12 }]}>
              {selectedMaterial.tags.length ? selectedMaterial.tags.slice(0, 4).map((tag) => <View key={tag} style={styles.chip}><Text style={styles.chipText}>{tag}</Text></View>) : <Text style={styles.sub}>还没有标签。</Text>}
            </View>
            <View style={styles.actionGrid}>
              <AppButton title={selectedMaterial.archivedAt ? '移出归档' : '归档'} variant="secondary" onPress={() => toggleArchiveMaterial(selectedMaterial.id)} style={{ flex: 1 }} />
              <AppButton title="删除资料" variant="danger" onPress={() => removeMaterial(selectedMaterial.id)} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </FormSheet>

      <FormSheet
        visible={Boolean(actionMaterial)}
        title="资料操作"
        subtitle={actionMaterial ? `${materialSubjectLabel(actionMaterial, data.profile.examType)} · ${materialSourceLabel(actionMaterial)}` : ''}
        onClose={() => setActionMaterialId(null)}
      >
        {actionMaterial ? (
          <>
            <View style={styles.materialActionPreview}>
              <View style={[styles.materialListThumb, { backgroundColor: subjectSoftBg(actionMaterial.subject), borderColor: subjectAccent(actionMaterial.subject) }]}>
                <Text style={[styles.materialListThumbText, { color: subjectAccent(actionMaterial.subject) }]}>{sourceBadge(actionMaterial)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.h3} numberOfLines={1}>{actionMaterial.title}</Text>
                <Text style={styles.sub} numberOfLines={1}>{actionMaterial.sourceType ?? '文本资料'} · {actionMaterial.tags.slice(0, 2).join(' / ') || '未设置标签'}</Text>
              </View>
              <StatusPill label={actionMaterial.archivedAt ? '已归档' : '未归档'} tone={actionMaterial.archivedAt ? 'gray' : 'teal'} />
            </View>
            <TextInput
              value={renameTitle}
              onChangeText={setRenameTitle}
              style={styles.input}
              placeholder="资料标题"
            />
            <AppButton title="保存标题" onPress={renameMaterial} disabled={renameTitle.trim() === actionMaterial.title || renameTitle.trim().length < 2} />
            <View style={styles.actionGrid}>
              <AppButton
                title={actionMaterial.archivedAt ? '恢复到资料库' : '归档'}
                variant="secondary"
                onPress={() => toggleArchiveMaterial(actionMaterial.id)}
                style={{ flex: 1 }}
              />
              <AppButton
                title="删除"
                variant="danger"
                onPress={() => removeMaterial(actionMaterial.id)}
                style={{ flex: 1 }}
              />
            </View>
            <AppButton
              title="查看资料详情"
              variant="secondary"
              onPress={() => {
                const id = actionMaterial.id;
                setActionMaterialId(null);
                openMaterial(id);
              }}
            />
          </>
        ) : null}
      </FormSheet>

      <FormSheet
        visible={sourceOpen}
        title={sourceStep === 'main' ? '导入资料' : sourceStep === 'image' ? '图片识别' : '文件导入'}
        subtitle={sourceStep === 'main' ? '选一种开始方式，资料只在本机处理。' : sourceStep === 'image' ? '选择拍照或相册图片，识别后先检查文本再保存。' : '选择文件类型，导入后先检查文本再保存。'}
        onClose={closeSourceSheet}
      >
        {sourceStep === 'main' ? (
          <>
            <View style={styles.importStepRail}>
              <View style={styles.importStepItem}>
                <Text style={styles.importStepIndex}>1</Text>
                <Text style={styles.importStepText}>导入</Text>
              </View>
              <View style={styles.importStepLine} />
              <View style={styles.importStepItem}>
                <Text style={styles.importStepIndex}>2</Text>
                <Text style={styles.importStepText}>检查</Text>
              </View>
              <View style={styles.importStepLine} />
              <View style={styles.importStepItem}>
                <Text style={styles.importStepIndex}>3</Text>
                <Text style={styles.importStepText}>预览</Text>
              </View>
              <View style={styles.importStepLine} />
              <View style={styles.importStepItem}>
                <Text style={styles.importStepIndex}>4</Text>
                <Text style={styles.importStepText}>入库</Text>
              </View>
            </View>
            <View style={styles.importPrimaryStack}>
              <ImportPrimaryOption testID="import-paste" title="粘贴文字" description={examCopy.pasteDescription} meta="文本" icon="paste" tone="blue" onPress={() => openTextEditor('paste', '', '', '粘贴')} />
              <ImportPrimaryOption testID="import-image" title="图片识别" description="拍照或选择相册图片，识别后进入文本检查。" meta={imageImporting ? '识别中' : '图片'} icon="image" tone="teal" onPress={() => setSourceStep('image')} disabled={imageImporting} />
              <ImportPrimaryOption testID="import-file" title="文件导入" description="TXT、Markdown、DOCX、PDF。" meta={fileImporting ? '解析中' : '文件'} icon="file" tone="orange" onPress={() => setSourceStep('file')} disabled={Boolean(fileImporting)} />
            </View>
            <Text style={styles.importLocalHint}>资料只在本机处理。每种入口都会先进入文本检查，再预览卡片，最后确认入库。</Text>
          </>
        ) : sourceStep === 'image' ? (
          <>
            <AppButton title="返回导入方式" variant="secondary" onPress={() => setSourceStep('main')} style={{ marginBottom: 10 }} />
            <View style={styles.importGroupPanel}>
              <Text style={styles.importGroupLabel}>图片来源</Text>
              <ImportFileOption title="拍照识别" description={examCopy.cameraDescription} badge="相机" icon="camera" onPress={takePhotoForOcr} disabled={imageImporting} />
              <ImportFileOption title="相册图片" description="选择截图、照片或扫描图，识别后进入文本检查。" badge="图片" icon="image" onPress={pickImageFromLibrary} disabled={imageImporting} />
            </View>
            <Text style={styles.importLocalHint}>{imageImporting ? '正在识别图片文字。' : '图片识别完成后会先打开文本检查页，确认后再生成卡片。'}</Text>
          </>
        ) : (
          <>
            <AppButton title="返回导入方式" variant="secondary" onPress={() => setSourceStep('main')} style={{ marginBottom: 10 }} />
            <View style={styles.importGroupPanel}>
              <Text style={styles.importGroupLabel}>文本文件</Text>
              <ImportFileOption title="TXT / Markdown" description="选择 .txt、.md、.markdown 文本资料。" badge="文本" icon="TXT" onPress={pickTextFile} />
            </View>
            <View style={styles.importGroupPanelOrange}>
              <Text style={styles.importGroupLabel}>文档文件</Text>
              <ImportFileOption title="Word / DOCX" description="从 .docx 文件提取正文，再进入卡片预览。" badge={fileImporting === 'docx' ? '解析中' : 'DOCX'} icon="DOC" onPress={pickDocxFile} disabled={Boolean(fileImporting)} />
              <ImportFileOption title="PDF" description="读取 PDF 文字；扫描版会尝试识别页面文字。" badge={fileImporting === 'pdf' ? '解析中' : 'PDF'} icon="PDF" onPress={pickPdfFile} disabled={Boolean(fileImporting)} />
            </View>
          </>
        )}
      </FormSheet>

      <FormSheet visible={editorOpen} title={sourceLabel(importMode)} subtitle="先检查文本，再生成卡片预览。" onClose={() => setEditorOpen(false)}>
        <View style={styles.editorStageCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.commandEyebrow}>文本检查</Text>
              <Text style={styles.h3}>确认标题、科目和原文后再拆卡</Text>
            </View>
            <StatusPill label={`${cleanText(rawText).length} 字`} tone={cleanText(rawText).length >= 20 ? 'teal' : 'orange'} />
          </View>
          <View style={styles.previewFlow}>
            <View style={styles.previewFlowStepDone}><Text style={styles.previewFlowTextDone}>导入</Text></View>
            <View style={styles.previewFlowLine} />
            <View style={styles.previewFlowStepNow}><Text style={styles.previewFlowTextNow}>检查</Text></View>
            <View style={styles.previewFlowLine} />
            <View style={styles.previewFlowStepDoneMuted}><Text style={styles.previewFlowTextMuted}>预览</Text></View>
            <View style={styles.previewFlowLine} />
            <View style={styles.previewFlowStepDoneMuted}><Text style={styles.previewFlowTextMuted}>入库</Text></View>
          </View>
        </View>
        <TextInput testID="material-title-input" accessibilityLabel="资料标题输入框" style={styles.input} placeholder="资料标题" value={title} onChangeText={setTitle} />
        <SubjectPicker value={subject} onChange={setSubject} examType={data.profile.examType} />
        {!cleanText(rawText) && !title.trim() ? (
          <Pressable onPress={fillSampleMaterial} style={styles.editorSampleButton}>
            <Text style={styles.editorSampleButtonText}>填入示例资料</Text>
            <Text style={styles.editorSampleButtonMeta}>{data.profile.examType === '考公' ? '申论素材' : '专业课带背'}</Text>
          </Pressable>
        ) : null}
        <TextInput
          testID="material-body-input"
          accessibilityLabel="资料正文输入框"
          style={[styles.textarea, styles.materialBodyInput]}
          placeholder={examCopy.materialPlaceholder}
          multiline
          value={rawText}
          onChangeText={setRawText}
        />
        <View style={styles.rowBetween}>
          <Text style={styles.tiny}>{cleanText(rawText).length} 字</Text>
          <Text style={styles.tiny}>最多处理 {MATERIAL_TEXT_LIMIT} 字</Text>
        </View>
        <TextInput testID="material-tags-input" accessibilityLabel="资料标签输入框" style={styles.input} placeholder="标签，可选，用空格或逗号分隔" value={tags} onChangeText={setTags} />
        <AppButton testID="generate-preview-button" title="生成卡片预览" onPress={generatePreview} style={{ marginTop: 10 }} />
      </FormSheet>

      <FormSheet visible={previewOpen} title="卡片预览" subtitle="确认后再保存到复盘队列。" onClose={() => setPreviewOpen(false)}>
        {preview ? (
          <>
            <View style={styles.previewReadyCard}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.commandEyebrow}>{savingMaterial ? '正在入库' : drafts.length === 0 ? '资料质量需检查' : '处理完成'}</Text>
                  <Text style={styles.h2}>{savingMaterial ? '正在生成复盘队列' : drafts.length === 0 ? '暂未识别出可背卡' : `准备生成 ${drafts.length} 张带背卡`}</Text>
                  <Text style={styles.sub}>{savingMaterial ? '资料正在写入内容库，新卡片会自动进入第一轮复盘。' : drafts.length === 0 ? `已过滤 ${preview.rejectedCount} 段噪声。请换成考研/复试/调剂讲义、真题或笔记。` : '已从原文中提取知识点、生成挖空和问答内容。下一步保存到资料库，立即进入复盘队列。'}</Text>
                </View>
                <View style={styles.previewReadyBadge}>
                  <Text style={styles.previewReadyBadgeValue}>{drafts.length}</Text>
                  <Text style={styles.previewReadyBadgeLabel}>卡</Text>
                </View>
              </View>
              <View style={styles.previewFlow}>
                <View style={styles.previewFlowStepDone}><Text style={styles.previewFlowTextDone}>原文</Text></View>
                <View style={styles.previewFlowLine} />
                <View style={drafts.length === 0 ? styles.previewFlowStepNow : styles.previewFlowStepDone}><Text style={drafts.length === 0 ? styles.previewFlowTextNow : styles.previewFlowTextDone}>检查</Text></View>
                <View style={styles.previewFlowLine} />
                <View style={styles.previewFlowStepNow}><Text style={styles.previewFlowTextNow}>{savingMaterial ? '入库中' : drafts.length === 0 ? '拒绝入库' : '保存入库'}</Text></View>
              </View>
              {savingMaterial ? (
                <View style={styles.previewSavingStrip}>
                  <View style={styles.previewSavingPulse} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h3}>资料正在进入内容库</Text>
                    <Text style={styles.sub}>完成后会置顶，并出现第一轮复盘入口。</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.previewReadyActions}>
                <AppButton testID="save-material-button" title={savingMaterial ? '正在入库...' : drafts.length === 0 ? '暂不入库' : '保存入库并开始复盘'} onPress={saveMaterialAndCards} disabled={drafts.length === 0 || savingMaterial || materialLimitReached} />
                <Text style={styles.tiny}>{savingMaterial ? '请稍等，正在生成资料卡和复盘队列。' : materialLimitReached && drafts.length > 0 ? '免费版容量已满，删除旧资料后可保存。' : drafts.length === 0 ? '低质量内容不会进入复盘队列。' : '保存后可在资料库查看，也可直接开始第一轮。'}</Text>
              </View>
            </View>
            <View style={styles.metricGrid}>
              <MetricTile label="知识点" value={`${preview.points.length}`} tone="blue" />
              <MetricTile label="预览卡" value={`${drafts.length}`} tone="teal" />
              <MetricTile label="已过滤" value={`${preview.rejectedCount}`} tone={preview.rejectedCount > 0 ? 'orange' : 'gray'} />
            </View>
            <View style={styles.previewStepChips}>
              {preview.steps.slice(0, 4).map((step) => (
                <View key={step.id} style={styles.previewStepChip}>
                  <Text style={styles.previewStepChipText}>{step.label}</Text>
                </View>
              ))}
              <StatusPill label="全部完成" tone="teal" />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.h2}>带背卡</Text>
              {drafts.length < preview.drafts.length ? (
                <Pressable onPress={restoreDrafts} style={styles.previewRestoreButton}>
                  <Text style={styles.previewRestoreText}>恢复全部</Text>
                </Pressable>
              ) : (
                <Text style={styles.sub}>可先删掉不合适的卡</Text>
              )}
            </View>
            {drafts.length === 0 ? (
              <View style={styles.previewEmptyDrafts}>
                <Text style={styles.h3}>没有可保存卡片</Text>
                <Text style={styles.sub}>这段内容已被识别为新闻、技术需求、杂乱 OCR 或学习价值不足，不会进入复盘。</Text>
                {preview.rejected.slice(0, 3).map((item, index) => (
                  <View key={`${item.text}-${index}`} style={styles.reportItem}>
                    <Text style={styles.h3}>{item.reasons.map(rejectedReasonLabel).join(' / ')}</Text>
                    <Text style={styles.sub} numberOfLines={2}>{item.text}</Text>
                  </View>
                ))}
                <AppButton title="返回文本检查" onPress={() => { setPreviewOpen(false); setEditorOpen(true); }} variant="secondary" />
              </View>
            ) : drafts.map((draft, index) => (
              <View key={draft.id} style={styles.previewDraftRow}>
                <View style={styles.previewDraftIndex}>
                  <Text style={styles.previewDraftIndexText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.h3} numberOfLines={2}>{draft.prompt}</Text>
                  <Text style={styles.sub} numberOfLines={2}>{draft.answer}</Text>
                  {draft.keywords.length ? (
                    <Text style={styles.tiny} numberOfLines={1}>要点：{draft.keywords.join(' / ')}</Text>
                  ) : null}
                </View>
                <View style={styles.previewDraftActions}>
                  <Pressable onPress={() => removeDraft(draft.id)} style={styles.previewDraftDelete}>
                    <Text style={styles.previewDraftDeleteText}>删除</Text>
                  </Pressable>
                  <Pressable onPress={() => openDraftEditor(draft)} style={styles.previewDraftMerge}>
                    <Text style={styles.previewDraftMergeText}>编辑</Text>
                  </Pressable>
                  <Pressable onPress={() => mergeDraftToPrevious(index)} style={styles.previewDraftMerge}>
                    <Text style={styles.previewDraftMergeText}>合并</Text>
                  </Pressable>
                  <Pressable onPress={() => markDraftInvalid(draft.id)} style={styles.previewDraftInvalid}>
                    <Text style={styles.previewDraftInvalidText}>无效</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </FormSheet>

      <FormSheet visible={Boolean(editingDraftId)} title="编辑预览卡" subtitle="入库前确认题面和答案，避免噪声进入复盘。" onClose={() => setEditingDraftId(null)}>
        <Text style={styles.commandEyebrow}>题面</Text>
        <TextInput style={styles.textarea} value={editingPrompt} onChangeText={setEditingPrompt} multiline />
        <Text style={styles.commandEyebrow}>答案</Text>
        <TextInput style={styles.textarea} value={editingAnswer} onChangeText={setEditingAnswer} multiline />
        <AppButton title="保存修改" onPress={saveDraftEdit} />
      </FormSheet>
    </View>
  );
}
