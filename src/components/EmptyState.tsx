import React from 'react';
import { Image, ImageSourcePropType, Text, View } from 'react-native';
import { AppButton } from './Button';
import { styles } from '../styles';

const emptyReview = require('../../assets/empty-review.png');

export function EmptyState({
  title,
  description,
  actionTitle,
  onAction,
  imageSource,
}: {
  title: string;
  description: string;
  actionTitle?: string;
  onAction?: () => void;
  imageSource?: ImageSourcePropType;
}) {
  return (
    <View style={styles.emptyState}>
      <Image source={imageSource ?? emptyReview} style={styles.emptyImage} resizeMode="contain" />
      <Text style={styles.h3}>{title}</Text>
      <Text style={[styles.sub, { textAlign: 'center' }]}>{description}</Text>
      {actionTitle && onAction ? <AppButton title={actionTitle} onPress={onAction} style={{ marginTop: 10 }} /> : null}
    </View>
  );
}
