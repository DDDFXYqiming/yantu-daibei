import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { SectionCard } from '../components/SectionCard';
import { TaskItem } from '../components/TaskItem';
import { colors, styles } from '../styles';
import { AppData, FocusSession, StudyTask, Subject } from '../types';
import { todayKey } from '../services/date';
import { calculateTodayMinutes } from '../services/planner';
import { parsePositiveInt } from '../services/validation';
import { SubjectPicker } from '../components/SubjectPicker';

type Props = { data: AppData; setData: (next: AppData) => void };
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function TodayScreen({ data, setData }: Props) {
  const [focusSubject, setFocusSubject] = useState<Subject>('专业课');
  const [focusMinutes, setFocusMinutes] = useState('55');
  const [focusNote, setFocusNote] = useState('');
  const today = todayKey();
  const todayTasks = data.tasks.filter((task) => task.date === today).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const stats = useMemo(() => calculateTodayMinutes(data.tasks, data.focusSessions), [data]);
  const ratio = stats.planned ? Math.min(1, stats.focused / stats.planned) : 0;
  const dueCount = data.cards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;

  function toggleTask(task: StudyTask) {
    setData({
      ...data,
      tasks: data.tasks.map((item) => item.id === task.id ? { ...item, status: item.status === 'done' ? 'todo' : 'done' } : item),
    });
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
    Alert.alert('已记录', `本次 ${focusSubject} 专注 ${mins} 分钟。`);
  }

  return (
    <ScrollView style={styles.app} contentContainerStyle={styles.container}>
      <Text style={styles.title}>今日带背</Text>
      <Text style={styles.sub}>目标：{data.profile.targetSchool} · {data.profile.targetMajor}</Text>

      <SectionCard title="今日仪表盘" subtitle="按计划、专注和到期卡片判断今天是否失控。">
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.h3}>{stats.focused} / {stats.planned || 1} 分钟</Text>
            <Text style={styles.sub}>已完成 {stats.done}/{stats.total} 个任务 · 待复盘 {dueCount} 张</Text>
          </View>
          <Text style={{ fontSize: 34 }}>{ratio >= 0.8 ? '稳' : ratio >= 0.4 ? '追' : '补'}</Text>
        </View>
        <View style={styles.progressOuter}>
          <View style={[styles.progressInner, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
      </SectionCard>

      <SectionCard title="55/5 专注记录" subtitle="用真实记录代替空泛打卡；默认 55 分钟学习 + 5 分钟休息。">
        <SubjectPicker value={focusSubject} onChange={setFocusSubject} />
        <View style={styles.rowBetween}>
          <TextInput value={focusMinutes} onChangeText={setFocusMinutes} keyboardType="number-pad" style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="分钟" />
          <AppButton title="记一轮" onPress={addFocusSession} />
        </View>
        <TextInput value={focusNote} onChangeText={setFocusNote} style={styles.input} placeholder="备注：今天学了什么/卡在哪里" />
      </SectionCard>

      <Text style={styles.h2}>今日任务</Text>
      {todayTasks.length === 0 ? (
        <SectionCard>
          <Text style={styles.sub}>今天没有任务。去「计划」生成周计划或手动添加。</Text>
        </SectionCard>
      ) : todayTasks.map((task) => <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task)} />)}

      <SectionCard title="风险提醒">
        <Text style={styles.text}>• 如果到期卡片超过 30 张，优先复盘，不要继续新增资料。</Text>
        <Text style={styles.text}>• 如果英语连续 3 天低于 55 分钟，复试/阅读都会变成后期风险。</Text>
        <Text style={styles.text}>• 如果专业课只看课不做题，下一轮会出现“感觉懂、做题不会”。</Text>
      </SectionCard>
    </ScrollView>
  );
}
