import { FocusSession, StudyTask, Subject, UserProfile } from '../types';
import { addDaysKey, isoToLocalDateKey, isValidDateKey, todayKey } from './date';
import { normalizeExamType } from './exam';

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function buildWeeklyPlan(profile: UserProfile, isPremium: boolean): StudyTask[] {
  const days = isPremium ? 7 : 3;
  const tasks: StudyTask[] = [];
  const baseHours = Math.max(2, Math.min(10, profile.dailyHours || 6));
  const examType = normalizeExamType(profile.examType);
  for (let i = 0; i < days; i += 1) {
    const date = addDaysKey(i);
    if (examType === '考公') {
      tasks.push({
        id: uid('task'),
        title: i % 2 === 0 ? '行测：数量/资料分析限时练' : '行测：判断推理图推 + 逻辑判断',
        subject: i % 2 === 0 ? '资料分析' : '判断推理',
        date,
        durationMins: Math.round(baseHours >= 6 ? 100 : 60),
        status: 'todo',
        note: '先按模块限时，再复盘错因和速度瓶颈。',
        source: '自动周计划',
        createdAt: new Date().toISOString(),
      });
      tasks.push({
        id: uid('task'),
        title: i % 3 === 2 ? '面试：结构化答题素材复述' : i % 2 === 0 ? '申论：材料概括 + 小题精改' : '申论：大作文框架复盘',
        subject: i % 3 === 2 ? '面试' : '申论',
        date,
        durationMins: Math.round(baseHours >= 6 ? 120 : 75),
        status: 'todo',
        note: i % 3 === 2 ? '用岗位场景组织观点，控制在 90 秒内复述。' : '先抓材料逻辑，再整理可复用表达。',
        source: '自动周计划',
        createdAt: new Date().toISOString(),
      });
    } else {
      const graduateFocus = [
        { subject: '英语' as Subject, title: i % 2 === 0 ? '英语：单词/长难句/阅读基础' : '英语：真题阅读方法复盘', note: '前期优先稳定输入，后期再加真题输出。' },
        { subject: '政治' as Subject, title: i % 3 === 1 ? '政治：选择题知识点复盘' : '政治：核心考点框架整理', note: '先抓高频考点，再把错题转成带背卡。' },
        { subject: '专业课' as Subject, title: i % 2 === 0 ? '专业课：讲义推进 + 难点标记' : '专业课：习题 + 错题归因', note: '一轮先熟悉知识点，二轮再体系化。' },
        { subject: '复试' as Subject, title: '复试：专业问题 60 秒口述', note: '把定义、案例和目标院校方向串成口述答案。' },
        { subject: '调剂' as Subject, title: '调剂：院校风险信息补齐', note: '补复试线、复试比例、学费、证书风险和英语要求。' },
      ];
      const first = graduateFocus[i % graduateFocus.length];
      const second = graduateFocus[(i + 2) % graduateFocus.length];
      tasks.push({
        id: uid('task'),
        title: first.title,
        subject: first.subject,
        date,
        durationMins: Math.round(baseHours >= 6 ? 90 : 55),
        status: 'todo',
        note: first.note,
        source: '自动周计划',
        createdAt: new Date().toISOString(),
      });
      tasks.push({
        id: uid('task'),
        title: second.title,
        subject: second.subject,
        date,
        durationMins: Math.round(baseHours >= 6 ? 120 : 75),
        status: 'todo',
        note: second.note,
        source: '自动周计划',
        createdAt: new Date().toISOString(),
      });
    }
    if (i % 2 === 1) {
      tasks.push({
        id: uid('task'),
        title: examType === '考公' ? '复盘：错题原因、公式和申论表达' : '复盘：主动回忆案例、口诀和易错点',
        subject: examType === '考公' ? '行测' : '专业课',
        date,
        durationMins: 45,
        status: 'todo',
        note: examType === '考公' ? '先看错因类型，再补公式、技巧和规范表达。' : '先闭卷回忆，再对照讲义/大纲补缺。',
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
