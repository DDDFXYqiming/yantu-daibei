import { AppData, DecisionItem, ReviewCard, StudyTask, UserProfile } from '../types';
import { addDaysKey } from '../services/date';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dateOffset = (days: number) => addDaysKey(days);

export const defaultProfile: UserProfile = {
  name: '考研用户',
  examType: '考研 / 复试 / 调剂',
  targetSchool: '目标院校',
  targetMajor: '目标专业',
  currentMode: '在职',
  fullTimeFrom: '2026-07-01',
  dailyHours: 6,
  weakPoints: '英语基础、专业课复盘、真题带背',
  createdAt: now(),
};

export const seedTasks: StudyTask[] = [
  {
    id: id('task'),
    title: '英语：单词 + 长难句 55/5 两轮',
    subject: '英语',
    date: dateOffset(0),
    durationMins: 110,
    status: 'todo',
    note: '适合在职阶段：先保证每日持续，不追求一次过量。',
    source: '初始化模板',
    createdAt: now(),
  },
  {
    id: id('task'),
    title: '专业课：讲义 16 页 + 标记难点',
    subject: '专业课',
    date: dateOffset(0),
    durationMins: 120,
    status: 'todo',
    note: '看课不频繁暂停，难点先标记，二轮重点处理。',
    source: '初始化模板',
    createdAt: now(),
  },
  {
    id: id('task'),
    title: '晚上复盘：回忆案例/口诀/易错点',
    subject: '专业课',
    date: dateOffset(0),
    durationMins: 45,
    status: 'todo',
    note: '不要只看答案，先主动回忆再对照。',
    source: '初始化模板',
    createdAt: now(),
  },
  {
    id: id('task'),
    title: '复试英语：专业名词听写 10 个',
    subject: '复试',
    date: dateOffset(1),
    durationMins: 30,
    status: 'todo',
    note: '低分进复试时，英语可作为逆袭点。',
    source: '初始化模板',
    createdAt: now(),
  },
];

export const seedCards: ReviewCard[] = [
  {
    id: id('card'),
    subject: '专业课',
    prompt: '简述专业课一轮复习的目标。（8分）',
    answer: '目标不是一次记住全部，而是熟悉知识点、理解核心概念、知道知识点如何出题；难点先标记，二轮再集中处理。',
    dueAt: new Date().toISOString(),
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    createdAt: now(),
  },
  {
    id: id('card'),
    subject: '英语',
    prompt: '为什么前期英语要先稳定背单词和长难句？（6分）',
    answer: '词汇和句法是阅读、完型、翻译和复试表达的底层能力；前期建立稳定输入，后期真题和输出训练才有效。',
    dueAt: new Date().toISOString(),
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    createdAt: now(),
  },
];

export const seedDecisions: DecisionItem[] = [
  {
    id: id('decision'),
    school: '北京大学',
    major: '目标专业',
    track: '复试',
    currentScore: 370,
    lastCutoff: 353,
    interviewWeight: 50,
    costLevel: '中',
    certificateRisk: '低',
    englishRisk: '中',
    note: '重点关注复试英语、往年笔试真题、面试/笔试比例。',
    createdAt: now(),
  },
  {
    id: id('decision'),
    school: '合作办学备选',
    major: '金融科技 / 医学相关',
    track: '调剂',
    currentScore: undefined,
    lastCutoff: undefined,
    interviewWeight: undefined,
    costLevel: '高',
    certificateRisk: '中',
    englishRisk: '中',
    note: '调剂时必须确认毕业证、学费、培养地点和就业认可。',
    createdAt: now(),
  },
];

export function createInitialData(): AppData {
  return {
    profile: defaultProfile,
    tasks: seedTasks,
    materials: [],
    cards: seedCards,
    focusSessions: [],
    decisions: seedDecisions,
    purchase: { isPremium: false, source: 'none' },
    lastOpenedAt: now(),
  };
}
