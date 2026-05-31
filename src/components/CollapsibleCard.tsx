import React, { ReactNode, useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { styles } from '../styles';

export function CollapsibleCard({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((value) => !value);
  }

  return (
    <View style={styles.card}>
      <Pressable onPress={toggle} style={styles.collapsibleHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h3}>{title}</Text>
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.disclosure}>{open ? '收起' : '展开'}</Text>
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}
