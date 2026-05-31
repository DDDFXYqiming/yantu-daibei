import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../styles';

const tileStyles = {
  blue: styles.metricTile_blue,
  teal: styles.metricTile_teal,
  orange: styles.metricTile_orange,
  gray: styles.metricTile_gray,
};

export function MetricTile({ label, value, tone = 'blue' }: { label: string; value: string; tone?: 'blue' | 'teal' | 'orange' | 'gray' }) {
  return (
    <View style={[styles.metricTile, tileStyles[tone]]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}
