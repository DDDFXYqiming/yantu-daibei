import { Alert, Platform, ToastAndroid } from 'react-native';

export function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert(message);
}

export function confirmAction(title: string, message: string, onConfirm: () => void, confirmText = '确认') {
  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: confirmText, style: 'default', onPress: onConfirm },
  ]);
}
