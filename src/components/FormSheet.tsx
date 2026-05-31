import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from '../styles';

export function FormSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!rendered) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(false);
    });
  }, [progress, rendered, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  const sheetTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [52, 0],
  });
  const sheetScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetRoot}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: progress }]} />
        <Pressable style={styles.sheetBackdropTouchable} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslate }, { scale: sheetScale }] }]}>
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h2}>{title}</Text>
              {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose}>
              <Text style={styles.sheetCloseText}>关闭</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
