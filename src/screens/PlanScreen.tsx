import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { SectionCard } from '../components/SectionCard';
import { SubjectPicker } from '../components/SubjectPicker';
import { TaskItem } from '../components/TaskItem';
import { isValidDateKey, todayKey } from '../services/date';
import { buildWeeklyPlan, createTask } from '../services/planner';
import { parsePositiveInt } from '../services/validation';
import { styles } from '../styles';
import { AppData, StudyTask, Subject } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void };

export function PlanScreen({ data, setData }: Props) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<Subject>('专业课');
  const [date, setDate] = useState(todayKey());
  const [duration, setDuration] = useState('55');
  const [note, setNote] = useState('');

  const futureTasks = useMemo(() => [...data.tasks].sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`)), [data.tasks]);

  function addTask() {
    if (!isValidDateKey(date)) {
      Alert.alert('日期格式错误', '请使用 YYYY-MM-DD，例如 2026-06-01。');
      return;
    }
    const task = createTask(title, subject, date, parsePositiveInt(duration, 55, 5, 720), note.trim());
    setData({ ...data, tasks: [task, ...data.tasks] });
    setTitle('');
    setNote('');
  }

  function toggleTask(task: StudyTask) {
    setData({
      ...data,
      tasks: data.tasks.map((item) => item.id === task.id ? { ...item, status: item.status === 'done' ? 'todo' : 'done' } : item),
    });
  }

  function generateWeek() {
    const generated = buildWeeklyPlan(data.profile, data.purchase.isPremium);
    setData({ ...data, tasks: [...generated, ...data.tasks] });
    Alert.alert('已生成计划', data.purchase.isPremium ? '已生成 7 天计划。' : '免费版已生成 3 天计划，Pro 可生成完整 7 天计划。');
  }

  function clearDone() {
    setData({ ...data, tasks: data.tasks.filter((task) => task.status !== 'done') });
  }

  return (
    <ScrollView style={styles.app} contentContainerStyle={styles.container}>
      <Text style={styles.title}>计划拆解</Text>
      <Text style={styles.sub}>把“每天多少页、几小时、几轮”变成今天能执行的任务。</Text>

      <SectionCard title="一键周计划" subtitle="按当前备考状态生成英语、专业课和复盘任务。">
        <View style={styles.rowBetween}>
          <AppButton title="生成计划" onPress={generateWeek} style={{ flex: 1 }} />
          <AppButton title="清理已完成" variant="secondary" onPress={clearDone} style={{ flex: 1 }} />
        </View>
        {!data.purchase.isPremium ? <Text style={[styles.tiny, { marginTop: 8 }]}>免费版生成 3 天；Pro 生成 7 天并保留更多任务模板。</Text> : null}
      </SectionCard>

      <SectionCard title="手动添加任务">
        <TextInput style={styles.input} placeholder="任务名称，如：刑法分则 30 页 + 两套题" value={title} onChangeText={setTitle} />
        <SubjectPicker value={subject} onChange={setSubject} />
        <View style={styles.rowBetween}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="日期 YYYY-MM-DD" value={date} onChangeText={setDate} />
          <TextInput style={[styles.input, { width: 90 }]} placeholder="分钟" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        </View>
        <TextInput style={styles.input} placeholder="备注/复盘要求" value={note} onChangeText={setNote} />
        <AppButton title="添加任务" onPress={addTask} disabled={!title.trim()} />
      </SectionCard>

      <View style={styles.rowBetween}>
        <Text style={styles.h2}>任务列表</Text>
        <Text style={styles.sub}>{data.tasks.length} 个</Text>
      </View>
      {futureTasks.map((task) => <TaskItem key={task.id} task={task} onToggle={() => toggleTask(task)} />)}
    </ScrollView>
  );
}
