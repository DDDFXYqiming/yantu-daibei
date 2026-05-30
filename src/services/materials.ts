import { Material, ReviewCard, Subject } from '../types';
import { addDaysIso } from './date';

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function cleanText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function splitKnowledgePoints(text: string): string[] {
  const cleaned = cleanText(text);
  const raw = cleaned
    .split(/\n+|。|；|;|\d+[、.．)]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12);
  const unique: string[] = [];
  for (const item of raw) {
    const normalized = item.slice(0, 80);
    if (!unique.some((u) => u.slice(0, 80) === normalized)) unique.push(item);
  }
  return unique;
}

function buildPrompt(point: string, subject: Subject, index: number): string {
  const score = subject === '复试' || subject === '调剂' ? 6 : 8;
  if (subject === '英语') return `简述这条英语复习材料的核心考点或方法。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '复试') return `试述复试场景下这条信息应该如何准备。（${score}分）\n${point.slice(0, 52)}...`;
  if (subject === '调剂') return `描述调剂决策时这条信息的风险点。（${score}分）\n${point.slice(0, 52)}...`;
  return `简述本章节第 ${index + 1} 个核心知识点。（${score}分）`;
}

function buildAnswer(point: string, subject: Subject): string {
  if (subject === '英语') {
    return `核心材料：${point}\n\n带背要点：① 先确认关键词和句法结构；② 用自己的话复述；③ 第二天用同一材料做回忆检测；④ 错误处进入复盘卡。`;
  }
  if (subject === '复试') {
    return `核心材料：${point}\n\n准备方式：① 提炼专业名词；② 准备中文解释和英文表达；③ 结合目标院校往年真题；④ 形成 60 秒口述答案。`;
  }
  if (subject === '调剂') {
    return `核心材料：${point}\n\n决策维度：① 复试线/排名；② 学费和城市成本；③ 毕业证与培养单位；④ 复试比例和英语要求；⑤ 机会成本。`;
  }
  return `核心材料：${point}\n\n回答结构：① 定义/定位；② 主要表现或规则；③ 易错点；④ 真题考法；⑤ 和相邻知识点的区别。`;
}

export function createMaterial(title: string, subject: Subject, rawText: string, tagsText: string): Material {
  return {
    id: uid('material'),
    title: title.trim() || '未命名资料',
    subject,
    rawText: cleanText(rawText),
    tags: tagsText.split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
  };
}

export function generateCards(material: Material, isPremium: boolean): ReviewCard[] {
  const points = splitKnowledgePoints(material.rawText);
  const limit = isPremium ? 120 : 12;
  const selected = points.slice(0, limit);
  return selected.map((point, index) => ({
    id: uid('card'),
    materialId: material.id,
    subject: material.subject,
    prompt: buildPrompt(point, material.subject, index),
    answer: buildAnswer(point, material.subject),
    dueAt: addDaysIso(index < 6 ? 0 : 1),
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    createdAt: new Date().toISOString(),
  }));
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
