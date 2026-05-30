import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, styles } from '../styles';
import { StudyTask } from '../types';

export function TaskItem({ task, onToggle }: { task: StudyTask; onToggle: () => void }) {
  const done = task.status === 'done';
  return (
    <Pressable onPress={onToggle} style={[styles.card, { opacity: done ? 0.65 : 1, marginBottom: 8 }]}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h3, done ? { textDecorationLine: 'line-through', color: colors.sub } : null]}>{task.title}</Text>
          <Text style={styles.sub}>{task.subject} · {task.durationMins} 分钟 · {task.date}</Text>
          {task.note ? <Text style={styles.tiny}>{task.note}</Text> : null}
        </View>
        <Text style={{ fontSize: 22 }}>{done ? '✓' : '○'}</Text>
      </View>
    </Pressable>
  );
}
