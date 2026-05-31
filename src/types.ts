export type ExamType = '考研' | '考公';

export type Subject =
  | '英语'
  | '专业课'
  | '政治'
  | '复试'
  | '调剂'
  | '行测'
  | '申论'
  | '常识'
  | '判断推理'
  | '资料分析'
  | '面试'
  | '其他';

export type TaskStatus = 'todo' | 'done' | 'skipped';
export type QualityStatus = 'usable' | 'needs_review' | 'rejected';
export type RejectedReason = 'low_study_value' | 'too_short' | 'business_news' | 'tech_requirement' | 'noisy_ocr';

export interface UserProfile {
  name: string;
  examType: ExamType;
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
  qualityStatus?: QualityStatus;
  rejectedReasons?: RejectedReason[];
  sourceType?: string;
  lastOpenedAt?: string;
  archivedAt?: string;
  createdAt: string;
}

export interface ReviewCard {
  id: string;
  materialId?: string;
  subject: Subject;
  prompt: string;
  answer: string;
  sourceText?: string;
  cloze?: string;
  keywords?: string[];
  qualityStatus?: QualityStatus;
  rejectedReasons?: RejectedReason[];
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
  source: 'local' | 'store' | 'none';
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

export type AppTab = 'today' | 'plan' | 'materials' | 'review' | 'decision' | 'my';
