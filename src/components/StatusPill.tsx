import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../styles';

const pillStyles = {
  blue: styles.statusPill_blue,
  teal: styles.statusPill_teal,
  orange: styles.statusPill_orange,
  red: styles.statusPill_red,
  gray: styles.statusPill_gray,
};

const textStyles = {
  blue: styles.statusPillText_blue,
  teal: styles.statusPillText_teal,
  orange: styles.statusPillText_orange,
  red: styles.statusPillText_red,
  gray: styles.statusPillText_gray,
};

export function StatusPill({ label, tone = 'gray' }: { label: string; tone?: 'blue' | 'teal' | 'orange' | 'red' | 'gray' }) {
  return (
    <View style={[styles.statusPill, pillStyles[tone]]}>
      <Text style={[styles.statusPillText, textStyles[tone]]}>{label}</Text>
    </View>
  );
}
