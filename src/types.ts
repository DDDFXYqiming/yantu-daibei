export type Subject = '英语' | '专业课' | '政治' | '复试' | '调剂' | '其他';

export type TaskStatus = 'todo' | 'done' | 'skipped';

export interface UserProfile {
  name: string;
  examType: string;
  targetSchool: string;
  targetMajor: string;
  currentMode: '在职' | '脱产' | '半脱产';
  fullTimeFrom: string;
  dailyHours: number;
  weakPoints: string;
  createdAt: string;
}

export interface StudyTask {
  id: string;
  title: string;
  subject: Subject;
  date: string;
  durationMins: number;
  status: TaskStatus;
  note?: string;
  source?: string;
  createdAt: string;
}

export interface Material {
  id: string;
  title: string;
  subject: Subject;
  rawText: string;
  tags: string[];
  createdAt: string;
}

export interface ReviewCard {
  id: string;
  materialId?: string;
  subject: Subject;
  prompt: string;
  answer: string;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt?: string;
  createdAt: string;
}

export interface FocusSession {
  id: string;
  subject: Subject;
  startedAt: string;
  endedAt: string;
  minutes: number;
  note?: string;
}

export interface DecisionItem {
  id: string;
  school: string;
  major: string;
  track: '一志愿' | '复试' | '调剂' | '备选';
  currentScore?: number;
  lastCutoff?: number;
  interviewWeight?: number;
  costLevel: '低' | '中' | '高';
  certificateRisk: '低' | '中' | '高';
  englishRisk: '低' | '中' | '高';
  note: string;
  createdAt: string;
}

export interface PurchaseState {
  isPremium: boolean;
  source: 'mock' | 'revenuecat' | 'none';
  checkedAt?: string;
}

export interface AppData {
  profile: UserProfile;
  tasks: StudyTask[];
  materials: Material[];
  cards: ReviewCard[];
  focusSessions: FocusSession[];
  decisions: DecisionItem[];
  purchase: PurchaseState;
  lastOpenedAt: string;
}

export type AppTab = 'today' | 'plan' | 'materials' | 'review' | 'decisions' | 'pro';
