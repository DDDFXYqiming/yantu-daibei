import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, LayoutAnimation, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { FormSheet } from '../components/FormSheet';
import { StatusPill } from '../components/StatusPill';
import { SubjectPicker } from '../components/SubjectPicker';
import { TaskItem } from '../components/TaskItem';
import { addDaysKey, isValidDateKey, todayKey } from '../services/date';
import { buildWeeklyPlan, createTask } from '../services/planner';
import { getDefaultSubject, getExamCopy, getSubjectsForExam, isSubjectForExam, subjectLabelForExam } from '../services/exam';
import { isUsableReviewCard } from '../services/materials';
import { subjectAccent, subjectTone } from '../services/subjects';
import { confirmAction, showToast } from '../services/ui';
import { parsePositiveInt } from '../services/validation';
import { colors, styles } from '../styles';
import { AppData, AppTab, StudyTask, Subject } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void; onNavigate?: (tab: AppTab) => void };
const planWorkflowHeroImage = require('../../assets/plan-workflow-hero.png');
declare const require: any;

function PlanTaskRow({ task, index, total, onToggle, examType }: { task: StudyTask; index: number; total: number; onToggle: () => void; examType: AppData['profile']['examType'] }) {
  const done = task.status === 'done';
  const currentSubject = isSubjectForExam(task.subject, examType);
  return (
    <View style={styles.planTimelineItem}>
      <View style={styles.planTimelineRail}>
        <View style={[styles.planTimelineDot, { backgroundColor: done ? '#13A389' : subjectAccent(task.subject) }]}>
          <Text style={styles.planTimelineDotText}>{done ? '✓' : index + 1}</Text>
        </View>
        {index < total - 1 ? <View style={styles.planTimelineLine} /> : null}
      </View>
      <Pressable onPress={onToggle} style={[styles.planTaskRow, done ? styles.planTaskRowDone : null]}>
        <View style={{ flex: 1 }}>
          <View style={styles.rowBetween}>
            <Text style={[styles.h3, done ? styles.planTaskTitleDone : null]} numberOfLines={1}>{task.title}</Text>
            <Text style={styles.planTaskTime}>{task.durationMins} 分钟</Text>
          </View>
          <View style={styles.planTaskMetaLine}>
            <StatusPill label={subjectLabelForExam(task.subject, examType)} tone={currentSubject ? subjectTone(task.subject) : 'gray'} />
            <Text style={styles.sub} numberOfLines={1}>{task.note || '按计划推进'}</Text>
          </View>
        </View>
        <View style={[styles.planTaskCheck, done ? styles.planTaskCheckDone : null]}>
          <Text style={[styles.planTaskCheckText, done ? styles.planTaskCheckTextDone : null]}>{done ? '✓' : ''}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function PlanScreen({ data, setData, onNavigate }: Props) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<Subject>(() => getDefaultSubject(data.profile.examType));
  const [date, setDate] = useState(todayKey());
  const [duration, setDuration] = useState('55');
  const [note, setNote] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [generatedNotice, setGeneratedNotice] = useState<{ count: number; days: number; todayCount: number; tomorrowCount: number } | null>(null);
  const examCopy = getExamCopy(data.profile);

  useEffect(() => {
    if (!isSubjectForExam(subject, data.profile.examType)) {
      setSubject(getDefaultSubject(data.profile.examType));
    }
  }, [data.profile.examType, subject]);

  const futureTasks = useMemo(() => [...data.tasks].sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`)), [data.tasks]);
  const todoCount = data.tasks.filter((task) => task.status !== 'done').length;
  const doneCount = data.tasks.filter((task) => task.status === 'done').length;
  const nextTask = futureTasks.find((task) => task.status !== 'done');
  const todayTasks = data.tasks.filter((task) => task.date === todayKey());
  const todayDone = todayTasks.filter((task) => task.status === 'done').length;
  const todayMinutes = todayTasks.reduce((sum, task) => sum + (task.status === 'done' ? task.durationMins : 0), 0);
  const todayTodoTasks = todayTasks.filter((task) => task.status !== 'done');
  const todayNextTask = todayTodoTasks[0];
  const dayKeys = useMemo(() => Array.from({ length: 7 }, (_, index) => addDaysKey(index)), []);
  const selectedTasks = futureTasks.filter((task) => task.date === selectedDate);
  const backlogTasks = futureTasks.filter((task) => !dayKeys.includes(task.date)).slice(0, 6);
  const todayProgress = todayTasks.length ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const usableCards = useMemo(() => data.cards.filter(isUsableReviewCard), [data.cards]);
  const dueCount = usableCards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;
  const activeMaterials = data.materials.filter((material) => !material.archivedAt && material.qualityStatus !== 'rejected');
  const todaySteps = [
    {
      id: 'review',
      title: '清到期卡',
      value: `${dueCount}`,
      detail: dueCount ? '先清记忆债' : '暂无到期卡',
      tone: dueCount ? colors.orange : colors.teal,
      done: dueCount === 0,
      action: () => onNavigate?.('review'),
    },
    {
      id: 'task',
      title: '完成下一项',
      value: todayNextTask ? '1' : '0',
      detail: todayNextTask ? subjectLabelForExam(todayNextTask.subject, data.profile.examType) : todayTasks.length ? '今天已清' : '先新增任务',
      tone: todayNextTask ? subjectAccent(todayNextTask.subject) : todayTasks.length ? colors.teal : colors.primary,
      done: !todayNextTask && todayTasks.length > 0,
      action: todayNextTask ? () => toggleTask(todayNextTask) : () => setFormOpen(true),
    },
    {
      id: 'material',
      title: '补一份资料',
      value: `${activeMaterials.length}`,
      detail: activeMaterials.length ? '资料库已建立' : '先导入讲义',
      tone: activeMaterials.length ? colors.primary : colors.orange,
      done: activeMaterials.length > 0,
      action: () => onNavigate?.('materials'),
    },
  ];
  const subjectFocus = getSubjectsForExam(data.profile.examType).map((item) => {
    const tasks = todayTasks.filter((task) => task.subject === item);
    const done = tasks.filter((task) => task.status === 'done').length;
    return { subject: item, total: tasks.length, done, minutes: tasks.reduce((sum, task) => sum + task.durationMins, 0) };
  }).filter((item) => item.total > 0);
  function addTask() {
    if (!isValidDateKey(date)) {
      Alert.alert('日期格式错误', '请使用 YYYY-MM-DD，例如 2026-06-01。');
      return;
    }
    const task = createTask(title, subject, date, parsePositiveInt(duration, 55, 5, 720), note.trim());
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({ ...data, tasks: [task, ...data.tasks] });
    setTitle('');
    setNote('');
    setFormOpen(false);
    showToast('任务已加入计划');
  }

  function toggleTask(task: StudyTask) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({
      ...data,
      tasks: data.tasks.map((item) => item.id === task.id ? { ...item, status: item.status === 'done' ? 'todo' : 'done' } : item),
    });
    showToast(task.status === 'done' ? '已恢复为待完成' : '任务已完成');
  }

  function generateWeek() {
    const generated = buildWeeklyPlan(data.profile, data.purchase.isPremium);
    const todayCount = generated.filter((task) => task.date === todayKey()).length;
    const tomorrowCount = generated.filter((task) => task.date === addDaysKey(1)).length;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({ ...data, tasks: [...generated, ...data.tasks] });
    setSelectedDate(todayKey());
    setGeneratedNotice({ count: generated.length, days: data.purchase.isPremium ? 7 : 3, todayCount, tomorrowCount });
    setManageOpen(false);
    showToast(`已生成 ${data.purchase.isPremium ? 7 : 3} 天计划，今天 ${todayCount} 项`);
  }

  function clearDone() {
    const done = data.tasks.filter((task) => task.status === 'done').length;
    if (!done) {
      showToast('没有已完成任务需要清理');
      return;
    }
    confirmAction('清理已完成任务？', `将移除 ${done} 个已完成任务。`, () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setData({ ...data, tasks: data.tasks.filter((task) => task.status !== 'done') });
      showToast('已清理完成任务');
    }, '清理');
  }

  return (
    <ScrollView style={[styles.app, styles.planApp]} contentContainerStyle={styles.container}>
      <Text style={styles.title}>计划</Text>
      <Text style={styles.sub}>只盯住今天和下一项，其他安排收进看板。</Text>

      <View style={[styles.planNowCard, { borderLeftColor: todayNextTask ? subjectAccent(todayNextTask.subject) : todayTasks.length ? colors.teal : colors.primary }]}>
        <Image source={planWorkflowHeroImage} style={styles.planHeroImage} resizeMode="cover" />
        <View style={styles.planNowHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commandEyebrow}>当前执行</Text>
            <Text style={styles.planNowTitle} numberOfLines={2}>
              {todayNextTask ? todayNextTask.title : todayTasks.length ? '今天任务已清完' : '从一个 30 分钟任务开始'}
            </Text>
          </View>
          <StatusPill
            label={todayNextTask ? subjectLabelForExam(todayNextTask.subject, data.profile.examType) : todayTasks.length ? '已清空' : '未开始'}
            tone={todayNextTask && isSubjectForExam(todayNextTask.subject, data.profile.examType) ? subjectTone(todayNextTask.subject) : todayTasks.length ? 'teal' : 'gray'}
          />
        </View>
        <Text style={styles.sub} numberOfLines={2}>
          {todayNextTask
            ? `${todayNextTask.durationMins} 分钟 · ${todayNextTask.note || '完成后再看下一项，不同时处理多个任务。'}`
            : todayTasks.length
              ? `已完成 ${todayDone}/${todayTasks.length} · 今日投入 ${todayMinutes} 分钟。`
              : '计划页只保留现在能执行的动作，远期安排放到一周看板里。'}
        </Text>
        <View style={styles.planNowFooter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tiny}>今日进度</Text>
            <View style={styles.planMiniTrack}>
              <View style={[styles.planMiniFill, { width: `${Math.max(todayTasks.length ? 8 : 0, todayProgress)}%`, backgroundColor: todayProgress >= 100 ? colors.teal : todayNextTask ? subjectAccent(todayNextTask.subject) : colors.primary }]} />
            </View>
          </View>
          {todayNextTask ? (
            <View style={styles.planNowActionGroup}>
              <Pressable onPress={() => onNavigate?.('today')} style={[styles.planNowStartButton, { backgroundColor: subjectAccent(todayNextTask.subject) }]}>
                <Text style={styles.planNowDoneText}>开始专注</Text>
              </Pressable>
              <Pressable onPress={() => toggleTask(todayNextTask)} style={styles.planNowCheckButton}>
                <Text style={styles.planNowCheckText}>完成</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={todayTasks.length ? () => setManageOpen(true) : () => setFormOpen(true)} style={styles.planNowDoneButton}>
              <Text style={styles.planNowDoneText}>{todayTasks.length ? '整理明天' : '新增任务'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.planTodayDock}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commandEyebrow}>今日三步</Text>
            <Text style={styles.h3}>先复盘，再执行，再补资料</Text>
          </View>
          <Pressable style={styles.planBoardToggle} onPress={() => setManageOpen(true)}>
            <Text style={styles.planBoardToggleText}>工具</Text>
          </Pressable>
        </View>
        <View style={styles.planQueueList}>
          {todaySteps.map((step, index) => (
            <Pressable
              key={step.id}
              onPress={step.action}
              style={[
                styles.planQueueItem,
                step.done ? styles.planQueueItemDone : null,
                !step.done && index === 0 ? styles.planQueueItemCurrent : null,
                { borderLeftColor: step.tone },
              ]}
            >
              <View style={[styles.planQueueIndex, { backgroundColor: step.tone }]}>
                <Text style={styles.planQueueIndexText}>{step.done ? '✓' : index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.h3} numberOfLines={1}>{step.title}</Text>
                  <Text style={styles.planTaskTime}>{step.value}</Text>
                </View>
                <Text style={styles.sub} numberOfLines={1}>{step.detail}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        {todayNextTask ? (
          <Pressable onPress={() => { setSelectedDate(todayKey()); setBoardOpen(true); }} style={styles.planMoreTasksLink}>
            <Text style={styles.planMoreTasksText}>当前任务：{todayNextTask.title}</Text>
          </Pressable>
        ) : todayTasks.length === 0 ? (
          <View style={[styles.actionGrid, { marginTop: 10 }]}>
            <AppButton title="新增任务" onPress={() => setFormOpen(true)} style={{ flex: 1 }} />
            <AppButton title="生成计划" variant="secondary" onPress={() => setManageOpen(true)} style={{ flex: 1 }} />
          </View>
        ) : null}
      </View>

      {generatedNotice ? (
        <View style={styles.planGeneratedCard}>
          <View style={styles.planGeneratedIcon}>
            <Text style={styles.planGeneratedIconText}>✓</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>已生成 {generatedNotice.days} 天计划</Text>
            <Text style={styles.sub}>新增 {generatedNotice.count} 个任务，今天 {generatedNotice.todayCount} 项，明天 {generatedNotice.tomorrowCount} 项。</Text>
          </View>
          <Pressable
            style={styles.planGeneratedAction}
            onPress={() => {
              setSelectedDate(todayKey());
              setGeneratedNotice(null);
              setBoardOpen(true);
            }}
          >
            <Text style={styles.planGeneratedActionText}>看板</Text>
          </Pressable>
        </View>
      ) : null}

      <FormSheet visible={boardOpen} title="一周看板" subtitle="只在需要调整远期安排时打开。" onClose={() => setBoardOpen(false)}>
        <>
          <View style={styles.planRhythmPanel}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.commandEyebrow}>今日节奏</Text>
                <Text style={styles.h3}>{subjectFocus.length ? `${subjectFocus.length} 类科目已安排` : '还没有科目节奏'}</Text>
              </View>
              <StatusPill label={subjectFocus.length ? `${subjectFocus.length} 类` : '未安排'} tone={subjectFocus.length ? 'blue' : 'gray'} />
            </View>
            {subjectFocus.length ? (
              <View style={styles.planSubjectCards}>
                {subjectFocus.map((item) => {
                  const accent = subjectAccent(item.subject);
                  const percent = item.total ? Math.round((item.done / item.total) * 100) : 0;
                  return (
                    <View key={item.subject} style={[styles.planSubjectCard, { backgroundColor: subjectTone(item.subject) === 'teal' ? '#F0FCF9' : subjectTone(item.subject) === 'orange' ? '#FFF8EE' : '#F8FAFF', borderColor: subjectAccent(item.subject) }]}>
                      <Text style={[styles.planSubjectName, { color: accent }]}>{item.subject}</Text>
                      <Text style={styles.planSubjectCount}>{item.done}/{item.total}</Text>
                      <Text style={styles.tiny}>{item.minutes} 分钟</Text>
                      <View style={styles.planMiniTrack}>
                        <View style={[styles.planMiniFill, { width: `${Math.max(8, percent)}%`, backgroundColor: accent }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planStrip}>
            {dayKeys.map((day, index) => {
              const tasks = data.tasks.filter((task) => task.date === day);
              const done = tasks.filter((task) => task.status === 'done').length;
              const active = selectedDate === day;
              const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
              return (
                <Pressable key={day} onPress={() => setSelectedDate(day)} style={[styles.planDay, active ? styles.planDayActive : null]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.planDayLabel, active ? styles.planDayLabelActive : null]}>{index === 0 ? '今天' : `+${index}`}</Text>
                    <Text style={[styles.planDayCount, active ? styles.planDayCountActive : null]}>{done}/{tasks.length}</Text>
                  </View>
                  <Text style={[styles.planDayDate, active ? styles.planDayDateActive : null]}>{day.slice(5)}</Text>
                  <View style={styles.planDayTrack}>
                    <View style={[styles.planDayFill, { width: `${Math.max(tasks.length ? 8 : 0, percent)}%` }]} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.rowBetween}>
            <Text style={styles.h2}>{selectedDate === todayKey() ? '今日任务' : '当天任务'}</Text>
            <Text style={styles.sub}>{selectedTasks.filter((task) => task.status === 'done').length}/{selectedTasks.length}</Text>
          </View>
          {selectedTasks.length === 0 ? (
            <EmptyState title="这天还没有任务" description="新增一个小任务，或者生成一组计划。" />
          ) : (
            <View style={styles.planTimeline}>
              {selectedTasks.map((task, index) => (
                <PlanTaskRow key={task.id} task={task} index={index} total={selectedTasks.length} onToggle={() => toggleTask(task)} examType={data.profile.examType} />
              ))}
            </View>
          )}
          <View style={styles.actionGrid}>
            <AppButton title="新增任务" variant="secondary" onPress={() => { setBoardOpen(false); setFormOpen(true); }} style={{ flex: 1 }} />
            <AppButton title="整理计划" onPress={() => { setBoardOpen(false); setManageOpen(true); }} style={{ flex: 1 }} />
          </View>
        </>
      </FormSheet>

      <FormSheet visible={formOpen} title="新增任务" subtitle="只补充今天真正要执行的任务。" onClose={() => setFormOpen(false)}>
        <TextInput style={styles.input} placeholder="任务名称，如：刑法分则 30 页 + 两套题" value={title} onChangeText={setTitle} />
        <SubjectPicker value={subject} onChange={setSubject} examType={data.profile.examType} />
        <View style={styles.rowBetween}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="日期 YYYY-MM-DD" value={date} onChangeText={setDate} />
          <TextInput style={[styles.input, { width: 90 }]} placeholder="分钟" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        </View>
        <TextInput style={styles.input} placeholder="备注/复盘要求" value={note} onChangeText={setNote} />
        <AppButton title="添加任务" onPress={addTask} disabled={!title.trim()} />
      </FormSheet>

      <FormSheet visible={manageOpen} title="整理计划" subtitle="生成、清理和查看远期任务都放在这里。" onClose={() => setManageOpen(false)}>
        <View style={styles.actionGrid}>
          <AppButton title={data.purchase.isPremium ? '生成 7 天计划' : '生成 3 天计划'} onPress={generateWeek} style={{ flex: 1 }} />
          <AppButton title="清理完成" variant="secondary" onPress={clearDone} style={{ flex: 1 }} />
        </View>
        {!data.purchase.isPremium ? <Text style={[styles.tiny, { marginTop: 10 }]}>免费版生成 3 天；Pro 生成 7 天并保留更多任务模板。</Text> : null}
        <View style={styles.detailDivider} />
        <Text style={styles.h3}>计划规则</Text>
        <Text style={styles.text}>优先保证{examCopy.primarySubjects}和复盘的稳定节奏，再按实际状态手动补任务。</Text>
        <View style={styles.detailDivider} />
        <Text style={styles.h3}>更远安排</Text>
        <Text style={styles.sub}>{backlogTasks.length} 个一周后的任务。</Text>
        {backlogTasks.length === 0 ? (
          <Text style={[styles.sub, { marginTop: 8 }]}>暂无更远任务，先把本周节奏跑稳。</Text>
        ) : backlogTasks.map((task) => <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task)} compact examType={data.profile.examType} />)}
      </FormSheet>
    </ScrollView>
  );
}
