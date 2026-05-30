import React, { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { styles } from '../styles';

export function SectionCard({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.h3}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.sub, { marginBottom: 8 }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}
