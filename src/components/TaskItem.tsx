import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, styles } from '../styles';
import { ExamType, StudyTask } from '../types';
import { StatusPill } from './StatusPill';
import { subjectAccent, subjectSoftBg, subjectTone } from '../services/subjects';
import { isSubjectForExam, subjectLabelForExam } from '../services/exam';

export function TaskItem({ task, onToggle, compact = false, examType = '考研' }: { task: StudyTask; onToggle: () => void; compact?: boolean; examType?: ExamType }) {
  const done = task.status === 'done';
  const statusLabel = done ? '已完成' : task.status === 'skipped' ? '已跳过' : '待完成';
  const currentSubject = isSubjectForExam(task.subject, examType);
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.card,
        styles.taskCard,
        { opacity: done ? 0.65 : 1, marginBottom: 8, borderLeftColor: subjectAccent(task.subject), backgroundColor: compact ? '#FFFFFF' : subjectSoftBg(task.subject) },
      ]}
    >
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <View style={styles.taskMetaRow}>
            <StatusPill label={subjectLabelForExam(task.subject, examType)} tone={currentSubject ? subjectTone(task.subject) : 'gray'} />
            <StatusPill label={statusLabel} tone={done ? 'teal' : 'gray'} />
          </View>
          <Text style={[styles.h3, done ? { textDecorationLine: 'line-through', color: colors.sub } : null]}>{task.title}</Text>
          <Text style={styles.sub}>{task.durationMins} 分钟 · {task.date}</Text>
          {task.note && !compact ? <Text style={styles.tiny}>{task.note}</Text> : null}
        </View>
        <Text style={styles.taskCheck}>{done ? '✓' : '○'}</Text>
      </View>
    </Pressable>
  );
}
