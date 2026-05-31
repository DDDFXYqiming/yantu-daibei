import { Material, QualityStatus, RejectedReason, ReviewCard, Subject } from '../types';
import { addDaysIso } from './date';

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const stopWords = new Set([
  '如果', '因为', '所以', '但是', '需要', '可以', '进行', '通过', '这个', '一个', '一种', '以及',
  '之后', '之前', '时候', '目标', '材料', '知识点', '复习', '老师', '自己', '当前',
]);

export const MATERIAL_TEXT_LIMIT = 80000;

export interface MaterialPipelineStep {
  id: string;
  label: string;
  detail: string;
}

export interface MaterialCardDraft {
  id: string;
  subject: Subject;
  prompt: string;
  answer: string;
  sourceText: string;
  cloze: string;
  keywords: string[];
  qualityStatus: QualityStatus;
  rejectedReasons: RejectedReason[];
}

export interface MaterialPreview {
  cleanedText: string;
  points: string[];
  drafts: MaterialCardDraft[];
  rejected: { text: string; reasons: RejectedReason[] }[];
  steps: MaterialPipelineStep[];
  limit: number;
  truncated: boolean;
  rejectedCount: number;
}

export function cleanText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function symbolRatio(text: string): number {
  if (!text.trim()) return 1;
  const symbols = text.match(/[^\u4e00-\u9fa5A-Za-z0-9\s]/g)?.length ?? 0;
  return symbols / text.trim().length;
}

function looksLikeUrlOrCredential(text: string): boolean {
  return /https?:\/\/|www\.|:\/\/|localhost|127\.0\.0\.1|\/\//i.test(text)
    || /\b(login|user(name)?|account|password|passwd|pwd|token|secret|cookie|session|host|port)\b\s*[:=]/i.test(text)
    || /[\w.-]+@[\w.-]+\.\w+/.test(text);
}

function looksLikeCodeOrLog(text: string): boolean {
  return /```|=>|==|!=|<=|>=|console\.|function\s*\(|class\s+\w+|SELECT\s+.+\s+FROM|INSERT\s+INTO|Exception|Traceback|WARN|ERROR|INFO/i.test(text)
    || /[{}[\]<>|\\]{3,}/.test(text)
    || /\b\d{2}:\d{2}:\d{2}\b/.test(text)
    || /^[A-Za-z]:\\/.test(text);
}

function looksLikeEnglishLearning(text: string, subject?: Subject): boolean {
  if (subject !== '英语') return false;
  const words = text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
  const hasLearningHint = /\b(grammar|vocabulary|sentence|translation|reading|writing|listening|speaking|cloze|词汇|语法|翻译|阅读|写作|听力|口语)\b/i.test(text);
  return words.length >= 6 && text.length >= 36 && (hasLearningHint || symbolRatio(text) < 0.12);
}

function looksLikeBusinessNews(text: string): boolean {
  return /(字节跳动|腾讯|阿里|美团|京东|百度|公司|集团|财报|营收|净利润|同比|环比|股价|融资|上市|市值|财联社|证券时报|每经|36氪|投资者|营业收入|亏损|涨幅|跌幅)/.test(text)
    && !/(考研|复试|调剂|院校|专业|分数线|招生|真题|背诵|法硕|教育学|心理学|公共课|专业课)/.test(text)
    || /\b(ByteDance|Tencent|Alibaba|Meituan|JD|Baidu|company|group|earnings|revenue|net profit|profit|share price|financing|IPO|market value|financial media|investor)\b/i.test(text)
      && !/\b(postgraduate|exam|interview|admission|major|school|review|memorize|English|politics)\b/i.test(text);
}

function looksLikeTechRequirement(text: string): boolean {
  return /(React|TypeScript|Expo|Android|Gradle|npm|API|SDK|数据库|接口|组件|代码|脚本|构建|部署|报错|日志|需求|迭代|产品经理|PRD|Bug|bug)/i.test(text)
    && !/(行测|申论|常识|判断推理|资料分析|考研|复试|调剂|政治|英语|专业课)/.test(text);
}

function looksLikeNoisyOcr(text: string): boolean {
  const compact = text.replace(/\s/g, '');
  if (compact.length < 18) return false;
  const digitRatio = (compact.match(/\d/g)?.length ?? 0) / compact.length;
  const latinRatio = (compact.match(/[A-Za-z]/g)?.length ?? 0) / compact.length;
  const hasBrokenWords = /([^\u4e00-\u9fa5A-Za-z0-9\s]){4,}|[|｜]{2,}|[_~]{2,}|[Il1]{5,}/.test(text);
  return hasBrokenWords || digitRatio > 0.38 || (latinRatio > 0.45 && !looksLikeEnglishLearning(text, '英语'));
}

function hasStudySignal(text: string, subject?: Subject): boolean {
  if (looksLikeEnglishLearning(text, subject)) return true;
  return /(定义|概念|特征|原则|作用|意义|区别|条件|适用|构成|要件|流程|方法|原因|影响|对策|易错|真题|考点|背诵|复盘|复试|调剂|院校|专业|分数线|招生|英语|政治|法|民法|刑法|合同|代理|物权|债权|违约|侵权|效力|成立|生效|史|理论|模型|公式|题型|申论|行测|常识|判断推理|资料分析|面试)/.test(text);
}

export function analyzeStudyPoint(point: string, subject?: Subject): { status: QualityStatus; reasons: RejectedReason[] } {
  const text = point.trim();
  const reasons: RejectedReason[] = [];
  if (text.length < 12) reasons.push('too_short');
  if (looksLikeBusinessNews(text)) reasons.push('business_news');
  if (looksLikeTechRequirement(text) || looksLikeUrlOrCredential(text) || looksLikeCodeOrLog(text)) reasons.push('tech_requirement');
  if (looksLikeNoisyOcr(text) || symbolRatio(text) > 0.28) reasons.push('noisy_ocr');
  const chinese = hasChinese(text);
  if (!chinese && !looksLikeEnglishLearning(text, subject)) reasons.push('low_study_value');
  if (chinese && !hasStudySignal(text, subject) && text.length < 36) reasons.push('low_study_value');
  return reasons.length ? { status: 'rejected', reasons: [...new Set(reasons)] } : { status: 'usable', reasons: [] };
}

function isLowQualityPoint(point: string, subject?: Subject): boolean {
  return analyzeStudyPoint(point, subject).status === 'rejected';
}

export function isLowQualityStudyPoint(point: string, subject?: Subject): boolean {
  return isLowQualityPoint(point, subject);
}

export function isUsableReviewCard(card: Pick<ReviewCard, 'qualityStatus' | 'sourceText' | 'cloze' | 'prompt' | 'subject'>): boolean {
  if (card.qualityStatus === 'rejected') return false;
  const source = card.sourceText || card.cloze || card.prompt || '';
  return analyzeStudyPoint(source, card.subject).status !== 'rejected';
}

export function splitKnowledgePoints(text: string, subject?: Subject): string[] {
  const cleaned = cleanText(text);
  const raw = cleaned
    .split(/\n+|。|；|;|\d+[、.．)]/g)
    .map((item) => item.trim())
    .filter((item) => !isLowQualityPoint(item, subject));
  const unique: string[] = [];
  for (const item of raw) {
    const normalized = item.slice(0, 80);
    if (!unique.some((u) => u.slice(0, 80) === normalized)) unique.push(item);
  }
  return unique;
}

function extractKeywords(point: string): string[] {
  const commonTerms = [
    '意思表示', '民事法律关系', '无效民事法律行为', '可撤销民事法律行为', '代理权限',
    '无权代理', '表见代理', '物权变动', '公示公信原则', '善意取得', '合同成立',
    '合同生效', '违约责任', '复试线', '复试比例', '调剂可能性', '毕业证风险',
    '英语风险', '申论对策', '判断推理', '资料分析', '面试形式',
  ].filter((term) => point.includes(term));
  const matches = [...commonTerms, ...(point.match(/[\u4e00-\u9fa5]{2,8}|[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [])];
  const unique: string[] = [];
  for (const raw of matches) {
    const keyword = raw.trim();
    const normalized = keyword.toLowerCase();
    if (
      keyword.length < 2
      || stopWords.has(keyword)
      || /^(是|将|以|在|和|并|再|最后|通常|包括|重点|要求|关注|承担)/.test(keyword)
      || /(的|和|并|以|将)$/.test(keyword)
      || unique.some((item) => item.toLowerCase() === normalized)
    ) continue;
    unique.push(keyword);
  }
  return unique.sort((a, b) => b.length - a.length).slice(0, 3);
}

function buildCloze(point: string, keywords: string[]): string {
  let cloze = point;
  for (const keyword of keywords.slice(0, 2)) {
    cloze = cloze.replace(keyword, '____');
  }
  if (cloze === point && point.length > 8) {
    return `${point.slice(0, 3)}____${point.slice(7)}`;
  }
  return cloze;
}

function buildPrompt(point: string, subject: Subject, index: number): string {
  const score = subject === '复试' || subject === '调剂' || subject === '面试' ? 6 : 8;
  if (subject === '英语') return `简述这条英语复习材料的核心考点或方法。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '复试') return `试述复试场景下这条信息应该如何准备。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '调剂') return `描述调剂决策时这条信息的风险点。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '申论') return `概括这段申论材料的核心问题、原因或对策。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '面试') return `把这条材料转成面试答题要点。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '行测' || subject === '常识' || subject === '判断推理' || subject === '资料分析') return `复盘这道${subject}材料的考点、方法和易错点。（${score}分）`;
  return `简述本章节第 ${index + 1} 个核心知识点。（${score}分）`;
}

function buildPreviewPrompt(point: string, subject: Subject, index: number, cloze: string, keywords: string[]): string {
  if (keywords.length === 0) return buildPrompt(point, subject, index);
  const lead = subject === '英语'
    ? '补全挖空，并说明这条材料的句法或考点。'
    : subject === '申论' || subject === '面试'
      ? '补全挖空，并整理成可复述的答题要点。'
      : '补全挖空，并用自己的话解释这条知识点。';
  return `${lead}\n${cloze}`;
}

function buildAnswer(point: string, subject: Subject, keywords: string[]): string {
  const keyLine = keywords.length ? `答题要点：${keywords.join('、')}。` : '答题要点：先说清概念，再补充适用条件和易错处。';
  if (subject === '英语') {
    return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：不要只看懂句子，要能复述关键词、句法关系和翻译难点。`;
  }
  if (subject === '复试') {
    return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：复试答案要落到目标院校、研究方向或个人经历，避免空泛背模板。`;
  }
  if (subject === '调剂') {
    return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：调剂判断要同时看分数线、复试比例、学费成本、证书风险和机会成本。`;
  }
  if (subject === '申论') {
    return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：申论不能只摘材料，要把问题、原因和对策对应到清楚主体。`;
  }
  if (subject === '面试') {
    return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：面试回答要先亮观点，再给两到三个可执行做法，结尾简短收束。`;
  }
  if (subject === '行测' || subject === '常识' || subject === '判断推理' || subject === '资料分析') {
    return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：先识别题型和规则，再检查计算、关键词或条件遗漏。`;
  }
  return `参考答案：${point}\n\n${keyLine}\n\n易错提醒：专业课背诵要区分定义、适用条件、相邻概念和真题问法。`;
}

function buildPreviewAnswer(point: string, subject: Subject, keywords: string[]): string {
  return buildAnswer(point, subject, keywords);
}

export function createMaterialCardDraft(point: string, subject: Subject, index: number): MaterialCardDraft {
  const keywords = extractKeywords(point);
  const cloze = buildCloze(point, keywords);
  const quality = analyzeStudyPoint(point, subject);
  return {
    id: uid('draft'),
    subject,
    prompt: buildPreviewPrompt(point, subject, index, cloze, keywords),
    answer: buildPreviewAnswer(point, subject, keywords),
    sourceText: point,
    cloze,
    keywords,
    qualityStatus: quality.status,
    rejectedReasons: quality.reasons,
  };
}

export function buildMaterialPreview(rawText: string, subject: Subject, isPremium: boolean): MaterialPreview {
  const cleanedText = cleanText(rawText).slice(0, MATERIAL_TEXT_LIMIT);
  const truncated = cleanText(rawText).length > MATERIAL_TEXT_LIMIT;
  const allSegments = cleanedText
    .split(/\n+|。|；|;|\d+[、.．)]/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const analyzed = allSegments.map((text) => ({ text, quality: analyzeStudyPoint(text, subject) }));
  const points = analyzed.filter((item) => item.quality.status !== 'rejected').map((item) => item.text);
  const rejected = analyzed
    .filter((item) => item.quality.status === 'rejected')
    .map((item) => ({ text: item.text, reasons: item.quality.reasons }));
  const rejectedCount = rejected.length;
  const limit = isPremium ? 120 : 12;
  const drafts = points.slice(0, limit).map((point, index) => createMaterialCardDraft(point, subject, index));

  return {
    cleanedText,
    points,
    drafts,
    rejected,
    limit,
    truncated,
    steps: [
      { id: 'extract', label: '文本提取', detail: `${cleanedText.length} 个字，已在本机清理空格和换行` },
      { id: 'split', label: '分段切块', detail: `识别 ${points.length} 个可背知识点，已过滤 ${rejectedCount} 段噪声` },
      { id: 'title', label: '智能标题', detail: '使用导入标题、学科分类和首段内容建立资料条目' },
      { id: 'cloze', label: '关键词挖空', detail: `为 ${drafts.length} 张卡片生成关键词提示` },
      { id: 'qa', label: '问答卡', detail: `生成 ${drafts.length} 张预览卡，保存后进入复盘` },
      { id: 'schedule', label: '复盘计划', detail: '前 6 张今天到期，其余从明天开始' },
    ],
    rejectedCount,
  };
}

export function createMaterial(title: string, subject: Subject, rawText: string, tagsText: string, sourceType = '粘贴文本'): Material {
  const now = new Date().toISOString();
  return {
    id: uid('material'),
    title: title.trim() || '未命名资料',
    subject,
    rawText: cleanText(rawText),
    tags: tagsText.split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean),
    qualityStatus: 'usable',
    rejectedReasons: [],
    sourceType,
    lastOpenedAt: now,
    createdAt: now,
  };
}

export function cardsFromDrafts(material: Material, drafts: MaterialCardDraft[]): ReviewCard[] {
  return drafts.filter((draft) => draft.qualityStatus !== 'rejected').map((draft, index) => ({
    id: uid('card'),
    materialId: material.id,
    subject: material.subject,
    prompt: draft.prompt,
    answer: draft.answer,
    sourceText: draft.sourceText,
    cloze: draft.cloze,
    keywords: draft.keywords,
    qualityStatus: draft.qualityStatus,
    rejectedReasons: draft.rejectedReasons,
    dueAt: addDaysIso(index < 6 ? 0 : 1),
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    createdAt: new Date().toISOString(),
  }));
}

export function generateCards(material: Material, isPremium: boolean): ReviewCard[] {
  return cardsFromDrafts(material, buildMaterialPreview(material.rawText, material.subject, isPremium).drafts);
}

export function scheduleReviewedCard(card: ReviewCard, quality: 'again' | 'hard' | 'good'): ReviewCard {
  if (quality === 'again') {
    return {
      ...card,
      intervalDays: 0,
      repetitions: 0,
      lapses: card.lapses + 1,
      dueAt: addDaysIso(0),
      lastReviewedAt: new Date().toISOString(),
    };
  }
  const nextInterval = quality === 'hard'
    ? Math.max(1, card.intervalDays || 1)
    : Math.max(1, Math.round((card.intervalDays || 1) * 2.2));
  return {
    ...card,
    intervalDays: nextInterval,
    repetitions: card.repetitions + 1,
    dueAt: addDaysIso(nextInterval),
    lastReviewedAt: new Date().toISOString(),
  };
}
