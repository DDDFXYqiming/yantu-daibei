import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { configurePurchases, getPremiumStatus } from './src/services/purchases';
import { loadAppData, saveAppData } from './src/services/storage';
import { colors, styles } from './src/styles';
import { AppData, AppTab } from './src/types';
import { TodayScreen } from './src/screens/TodayScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { MaterialsScreen } from './src/screens/MaterialsScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { DecisionsScreen } from './src/screens/DecisionsScreen';
import { ProScreen } from './src/screens/ProScreen';

const tabs: { id: AppTab; label: string; icon: string }[] = [
  { id: 'today', label: '今日', icon: '今' },
  { id: 'plan', label: '计划', icon: '计' },
  { id: 'materials', label: '资料', icon: '资' },
  { id: 'review', label: '带背', icon: '背' },
  { id: 'decisions', label: '决策', icon: '择' },
  { id: 'pro', label: 'Pro', icon: 'P' },
];

export default function App() {
  const [data, setDataState] = useState<AppData | null>(null);
  const [tab, setTab] = useState<AppTab>('today');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await configurePurchases();
        const loaded = await loadAppData();
        const purchase = await getPremiumStatus(loaded.purchase.isPremium);
        if (mounted) setDataState({ ...loaded, purchase });
      } catch (error: any) {
        Alert.alert('启动失败', error?.message ?? '读取本地数据失败');
      }
    })();
    return () => { mounted = false; };
  }, []);

  function setData(next: AppData) {
    setDataState(next);
    saveAppData(next).catch((error) => console.warn('save failed', error));
  }

  if (!data) {
    return (
      <View style={[styles.app, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.sub, { marginTop: 12 }]}>加载研途带背...</Text>
      </View>
    );
  }

  const screen = tab === 'today'
    ? <TodayScreen data={data} setData={setData} />
    : tab === 'plan'
      ? <PlanScreen data={data} setData={setData} />
      : tab === 'materials'
        ? <MaterialsScreen data={data} setData={setData} />
        : tab === 'review'
          ? <ReviewScreen data={data} setData={setData} />
          : tab === 'decisions'
            ? <DecisionsScreen data={data} setData={setData} />
            : <ProScreen data={data} setData={setData} />;

  return (
    <View style={styles.app}>
      {screen}
      <View style={styles.tabbar}>
        {tabs.map((item) => {
          const active = item.id === tab;
          return (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, active ? styles.tabActive : null]}>
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{item.icon}</Text>
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
