import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { EmptyState } from '../components/EmptyState';
import { FormSheet } from '../components/FormSheet';
import { TaskItem } from '../components/TaskItem';
import { StatusPill } from '../components/StatusPill';
import { colors, styles } from '../styles';
import { AppData, AppTab, FocusSession, StudyTask, Subject } from '../types';
import { todayKey } from '../services/date';
import { calculateTodayMinutes } from '../services/planner';
import { confirmAction, showToast } from '../services/ui';
import { parsePositiveInt } from '../services/validation';
import { SubjectPicker } from '../components/SubjectPicker';
import { subjectAccent } from '../services/subjects';
import { getDefaultSubject, getExamCopy, isSubjectForExam, subjectLabelForExam } from '../services/exam';
import { isUsableReviewCard } from '../services/materials';

type Props = { data: AppData; setData: (next: AppData) => void; onNavigate: (tab: AppTab) => void };
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const studyHero = require('../../assets/study-hero.png');

export function TodayScreen({ data, setData, onNavigate }: Props) {
  const [focusSubject, setFocusSubject] = useState<Subject>(() => getDefaultSubject(data.profile.examType));
  const [focusMinutes, setFocusMinutes] = useState('55');
  const [focusNote, setFocusNote] = useState('');
  const [focusOpen, setFocusOpen] = useState(false);
  const examCopy = getExamCopy(data.profile);

  useEffect(() => {
    if (!isSubjectForExam(focusSubject, data.profile.examType)) {
      setFocusSubject(getDefaultSubject(data.profile.examType));
    }
  }, [data.profile.examType, focusSubject]);
  const today = todayKey();
  const todayTasks = data.tasks.filter((task) => task.date === today).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nextTask = todayTasks.find((task) => task.status !== 'done');
  const stats = useMemo(() => calculateTodayMinutes(data.tasks, data.focusSessions), [data]);
  const ratio = stats.planned ? Math.min(1, stats.focused / stats.planned) : 0;
  const usableCards = useMemo(() => data.cards.filter(isUsableReviewCard), [data.cards]);
  const dueCount = usableCards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;
  const activeMaterials = data.materials.filter((material) => !material.archivedAt);
  const workflow = [
    {
      id: 'materials' as const,
      label: '资料入库',
      value: `${activeMaterials.length}`,
      detail: activeMaterials.length ? '已有资料' : '先导入资料',
      tone: '#3370FF',
      run: () => onNavigate('materials'),
    },
    {
      id: 'review' as const,
      label: '到期复盘',
      value: `${dueCount}`,
      detail: dueCount ? '需要清卡' : '暂无到期',
      tone: dueCount ? '#FF8F1F' : '#14C9C9',
      run: () => onNavigate('review'),
    },
    {
      id: 'plan' as const,
      label: '今日计划',
      value: `${stats.done}/${stats.total}`,
      detail: nextTask ? subjectLabelForExam(nextTask.subject, data.profile.examType) : '已清完',
      tone: nextTask ? subjectAccent(nextTask.subject) : '#14C9C9',
      run: () => onNavigate('plan'),
    },
  ];
  const progressLabel = ratio >= 0.8 ? '节奏稳定' : ratio >= 0.4 ? '需要追进度' : '先补关键项';
  const materialEmptyDetail = data.profile.examType === '考公'
    ? '没有资料时，先把真题、申论素材或面试题放进资料库。'
    : '没有资料时，先把讲义、真题或笔记放进资料库。';
  const mainAction = dueCount > 0
    ? { title: `清 ${dueCount} 张到期卡`, detail: '先把记忆债清掉，再继续新增内容。', action: '去复盘', run: () => onNavigate('review') }
    : nextTask
      ? { title: '开始下一项', detail: `${subjectLabelForExam(nextTask.subject, data.profile.examType)} · ${nextTask.durationMins} 分钟 · ${nextTask.title}`, action: '开始专注', run: () => setFocusOpen(true) }
      : activeMaterials.length === 0
        ? { title: '先导入一份资料', detail: materialEmptyDetail, action: '导入资料', run: () => onNavigate('materials') }
        : { title: '安排今天', detail: '先放入一个今天能完成的小任务。', action: '去计划', run: () => onNavigate('plan') };
  const heroStatus = dueCount > 0
    ? { label: '先清到期', tone: 'orange' as const }
    : { label: progressLabel, tone: ratio >= 0.8 ? 'teal' as const : ratio >= 0.4 ? 'orange' as const : 'red' as const };
  const visibleTodayTasks = todayTasks.filter((task) => task.status !== 'done').slice(0, 2);
  const hiddenTodayTasks = todayTasks.filter((task) => !visibleTodayTasks.some((visible) => visible.id === task.id));

  function toggleTask(task: StudyTask) {
    setData({
      ...data,
      tasks: data.tasks.map((item) => item.id === task.id ? { ...item, status: item.status === 'done' ? 'todo' : 'done' } : item),
    });
  }

  function completeNextTask() {
    if (!nextTask) {
      onNavigate('plan');
      return;
    }
    confirmAction('完成这一项？', nextTask.title, () => {
      toggleTask(nextTask);
      showToast('已完成一项任务');
    }, '完成');
  }

  function addFocusSession() {
    const mins = parsePositiveInt(focusMinutes, 55, 5, 720);
    const ended = new Date();
    const started = new Date(ended.getTime() - mins * 60 * 1000);
    const session: FocusSession = {
      id: uid('focus'),
      subject: focusSubject,
      minutes: mins,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      note: focusNote.trim(),
    };
    setData({ ...data, focusSessions: [session, ...data.focusSessions] });
    setFocusNote('');
    setFocusOpen(false);
    showToast(`已记录 ${mins} 分钟专注`);
  }

  return (
    <ScrollView style={[styles.app, styles.todayApp]} contentContainerStyle={styles.container}>
      <Text style={styles.title}>今日驾驶舱</Text>
      <Text style={styles.sub}>{data.profile.targetSchool} · {data.profile.targetMajor}</Text>

      <View style={styles.todayHero}>
        <Image source={studyHero} style={styles.todayHeroImage} resizeMode="cover" />
        <View style={styles.todayHeroMain}>
          <View style={styles.todayHeroCopy}>
            <Text style={styles.commandEyebrow}>现在最该做</Text>
            <Text style={styles.todayHeroTitle}>{mainAction.title}</Text>
            <Text style={styles.sub}>{mainAction.detail}</Text>
          </View>
          <Pressable onPress={mainAction.run} style={styles.todayPrimaryAction}>
            <Text style={styles.todayPrimaryActionText}>{mainAction.action}</Text>
          </Pressable>
        </View>
        <View style={styles.todayChipRail}>
          <Pressable onPress={() => setFocusOpen(true)} style={styles.todayStatChip}>
            <Text style={styles.todayStatChipValue}>{stats.focused}</Text>
            <Text style={styles.todayStatChipLabel}>专注分钟</Text>
          </Pressable>
          <Pressable onPress={completeNextTask} style={[styles.todayStatChip, styles.todayStatChipTeal]}>
            <Text style={[styles.todayStatChipValue, { color: colors.teal }]}>{stats.done}/{stats.total}</Text>
            <Text style={styles.todayStatChipLabel}>今日任务</Text>
          </Pressable>
          <Pressable onPress={() => onNavigate('review')} style={[styles.todayStatChip, styles.todayStatChipOrange]}>
            <Text style={[styles.todayStatChipValue, { color: colors.orange }]}>{dueCount}</Text>
            <Text style={styles.todayStatChipLabel}>到期卡</Text>
          </Pressable>
        </View>
        <View style={styles.progressOuter}>
          <View style={[styles.progressInner, { width: `${Math.max(6, Math.round(ratio * 100))}%`, backgroundColor: ratio >= 0.8 ? colors.teal : ratio >= 0.4 ? colors.orange : colors.primary }]} />
        </View>
        <View style={styles.todayHeroMeta}>
          <StatusPill label={heroStatus.label} tone={heroStatus.tone} />
          <Text style={styles.tiny}>专注 {stats.focused} 分钟 · 任务 {stats.done}/{stats.total} · 复盘 {dueCount}</Text>
        </View>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.h2}>今日任务</Text>
        <StatusPill label={nextTask ? `下一项：${subjectLabelForExam(nextTask.subject, data.profile.examType)}` : '今天已清'} tone={nextTask ? 'blue' : 'teal'} />
      </View>
      {todayTasks.length === 0 ? (
        <EmptyState
          title={activeMaterials.length === 0 ? '先导入资料，再安排今天' : '今天还没有任务'}
          description={activeMaterials.length === 0 ? '导入资料后可以生成带背卡，再回到今日页开始复盘。' : '去「计划」生成周计划，或手动添加一个今天能完成的小任务。'}
          actionTitle={activeMaterials.length === 0 ? '导入资料' : '去计划'}
          onAction={() => onNavigate(activeMaterials.length === 0 ? 'materials' : 'plan')}
        />
      ) : visibleTodayTasks.length ? (
        visibleTodayTasks.map((task) => <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task)} compact examType={data.profile.examType} />)
      ) : (
        <View style={styles.todayDoneCard}>
          <Text style={styles.h3}>今天任务已完成</Text>
          <Text style={styles.sub}>可以去复盘到期卡，或者休息后再新增任务。</Text>
        </View>
      )}
      {hiddenTodayTasks.length > 0 ? (
        <CollapsibleCard title="展开更多任务" subtitle={`${hiddenTodayTasks.length} 项已收起`}>
          {hiddenTodayTasks.map((task) => <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task)} compact examType={data.profile.examType} />)}
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard title="学习闭环" subtitle={`资料 ${activeMaterials.length} · 到期 ${dueCount} · 任务 ${stats.done}/${stats.total}`}>
        <View style={styles.todayFlowBand}>
          {workflow.map((item, index) => (
            <React.Fragment key={item.id}>
              <Pressable onPress={item.run} style={styles.todayFlowStep}>
                <View style={[styles.todayFlowIndex, { backgroundColor: item.tone }]}>
                  <Text style={styles.todayFlowIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.workflowLabel}>{item.label}</Text>
                <Text style={styles.todayFlowValue}>{item.value}</Text>
                <Text style={styles.workflowDetail}>{item.detail}</Text>
              </Pressable>
              {index < workflow.length - 1 ? <View style={styles.todayFlowConnector} /> : null}
            </React.Fragment>
          ))}
        </View>
      </CollapsibleCard>

      <CollapsibleCard title="节奏提醒" subtitle="需要调整时再展开。">
        <Text style={styles.text}>到期卡过多时，先清复盘，再导入新资料。</Text>
        <Text style={styles.text}>{examCopy.primarySubjects}至少各保留一个稳定学习时段。</Text>
        <Text style={styles.text}>看课后及时做题，避免只熟悉材料、不熟悉出题方式。</Text>
      </CollapsibleCard>

      <FormSheet visible={focusOpen} title="记录一轮专注" subtitle="填入本轮实际学习时间。记录后会更新今日进度。" onClose={() => setFocusOpen(false)}>
        <SubjectPicker value={focusSubject} onChange={setFocusSubject} examType={data.profile.examType} />
        <TextInput value={focusMinutes} onChangeText={setFocusMinutes} keyboardType="number-pad" style={styles.input} placeholder="分钟" />
        <TextInput value={focusNote} onChangeText={setFocusNote} style={styles.input} placeholder="备注：今天学了什么/卡在哪里" />
        <AppButton title="记一轮" onPress={addFocusSession} />
      </FormSheet>
    </ScrollView>
  );
}
