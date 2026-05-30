import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Subject } from '../types';
import { colors, styles } from '../styles';

const subjects: Subject[] = ['英语', '专业课', '政治', '复试', '调剂', '其他'];

export function SubjectPicker({ value, onChange }: { value: Subject; onChange: (subject: Subject) => void }) {
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
