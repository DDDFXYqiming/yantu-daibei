import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';
import { styles } from '../styles';

type Variant = 'primary' | 'secondary' | 'danger';

export function AppButton({ title, onPress, variant = 'primary', disabled, style }: { title: string; onPress: () => void; variant?: Variant; disabled?: boolean; style?: ViewStyle }) {
  const base = variant === 'primary' ? styles.button : variant === 'danger' ? styles.dangerButton : styles.secondaryButton;
  const text = variant === 'primary' ? styles.buttonText : variant === 'danger' ? styles.dangerText : styles.secondaryText;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[base, disabled ? { opacity: 0.45 } : null, style]}>
      <Text style={text}>{title}</Text>
    </Pressable>
  );
}
