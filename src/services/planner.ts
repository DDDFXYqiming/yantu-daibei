import { FocusSession, StudyTask, Subject, UserProfile } from '../types';
import { addDaysKey, isoToLocalDateKey, isValidDateKey, todayKey } from './date';

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function buildWeeklyPlan(profile: UserProfile, isPremium: boolean): StudyTask[] {
  const days = isPremium ? 7 : 3;
  const tasks: StudyTask[] = [];
  const baseHours = Math.max(2, Math.min(10, profile.dailyHours || 6));
  for (let i = 0; i < days; i += 1) {
    const date = addDaysKey(i);
    tasks.push({
      id: uid('task'),
      title: i % 2 === 0 ? '英语：单词/长难句/阅读基础' : '英语：真题阅读方法复盘',
      subject: '英语',
      date,
      durationMins: Math.round(baseHours >= 6 ? 90 : 55),
      status: 'todo',
      note: '前期优先稳定输入，后期再加真题输出。',
      source: '自动周计划',
      createdAt: new Date().toISOString(),
    });
    tasks.push({
      id: uid('task'),
      title: i % 2 === 0 ? '专业课：讲义推进 + 难点标记' : '专业课：习题 + 错题归因',
      subject: '专业课',
      date,
      durationMins: Math.round(baseHours >= 6 ? 150 : 90),
      status: 'todo',
      note: '一轮先熟悉知识点，二轮再体系化。',
      source: '自动周计划',
      createdAt: new Date().toISOString(),
    });
    if (i % 2 === 1) {
      tasks.push({
        id: uid('task'),
        title: '复盘：主动回忆案例、口诀和易错点',
        subject: '专业课',
        date,
        durationMins: 45,
        status: 'todo',
        note: '先闭卷回忆，再对照讲义/大纲补缺。',
        source: '自动周计划',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return tasks;
}

export function calculateTodayMinutes(tasks: StudyTask[], sessions: FocusSession[]): { planned: number; focused: number; done: number; total: number } {
  const today = todayKey();
  const todayTasks = tasks.filter((task) => task.date === today);
  const todaySessions = sessions.filter((session) => isoToLocalDateKey(session.startedAt) === today);
  return {
    planned: todayTasks.reduce((sum, task) => sum + task.durationMins, 0),
    focused: todaySessions.reduce((sum, session) => sum + session.minutes, 0),
    done: todayTasks.filter((task) => task.status === 'done').length,
    total: todayTasks.length,
  };
}

export function subjectLabel(subject: Subject): string {
  return subject;
}

export function createTask(title: string, subject: Subject, date: string, durationMins: number, note?: string): StudyTask {
  return {
    id: uid('task'),
    title: title.trim() || '未命名任务',
    subject,
    date: isValidDateKey(date) ? date : todayKey(),
    durationMins: Number.isFinite(durationMins) ? Math.max(5, Math.round(durationMins)) : 55,
    status: 'todo',
    note,
    source: '手动创建',
    createdAt: new Date().toISOString(),
  };
}
