import React, { useRef } from 'react';
import { Animated, Pressable, Text, ViewStyle } from 'react-native';
import { styles } from '../styles';

type Variant = 'primary' | 'secondary' | 'danger';

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const base = variant === 'primary' ? styles.button : variant === 'danger' ? styles.dangerButton : styles.secondaryButton;
  const text = variant === 'primary' ? styles.buttonText : variant === 'danger' ? styles.dangerText : styles.secondaryText;

  function press(toValue: number) {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 4,
    }).start();
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => press(0.98)}
        onPressOut={() => press(1)}
        style={[base, disabled ? { opacity: 0.45 } : null]}
      >
        <Text style={text}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}
