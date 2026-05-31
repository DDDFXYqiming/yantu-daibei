import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ExamType, Subject } from '../types';
import { getSubjectsForExam } from '../services/exam';
import { colors, styles } from '../styles';

export function SubjectPicker({ value, onChange, examType = '考研' }: { value: Subject; onChange: (subject: Subject) => void; examType?: ExamType }) {
  const subjects = getSubjectsForExam(examType);
  return (
    <View style={[styles.wrap, { marginBottom: 8 }]}>
      {subjects.map((subject) => (
        <Pressable
          key={subject}
          onPress={() => onChange(subject)}
          style={[styles.chip, value === subject ? { backgroundColor: colors.primary } : null]}
        >
          <Text style={[styles.chipText, value === subject ? { color: '#fff' } : null]}>{subject}</Text>
        </Pressable>
      ))}
    </View>
  );
}
