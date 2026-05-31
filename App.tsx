import React, { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { ActivityIndicator, Alert, Pressable, StatusBar, Text, View } from 'react-native';
import { configurePurchases, getPremiumStatus } from './src/services/purchases';
import { loadAppData, saveAppData } from './src/services/storage';
import { colors, styles } from './src/styles';
import { AppData, AppTab } from './src/types';
import { TodayScreen } from './src/screens/TodayScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { MaterialsScreen } from './src/screens/MaterialsScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { MyScreen } from './src/screens/MyScreen';
import { DecisionsScreen } from './src/screens/DecisionsScreen';
import { isUsableReviewCard } from './src/services/materials';

type TabIconName = 'today' | 'plan' | 'materials' | 'review' | 'decision';

const tabs: { id: AppTab; label: string; icon: TabIconName }[] = [
  { id: 'today', label: '今日', icon: 'today' },
  { id: 'plan', label: '计划', icon: 'plan' },
  { id: 'materials', label: '资料', icon: 'materials' },
  { id: 'review', label: '复盘', icon: 'review' },
  { id: 'decision', label: '决策', icon: 'decision' },
];

function TabGlyph({ name, active }: { name: TabIconName; active: boolean }) {
  const tint = active ? colors.primaryDark : colors.sub;
  if (name === 'today') {
    return (
      <View style={[styles.navCalendarIcon, { borderColor: tint }]}>
        <View style={[styles.navCalendarTop, { backgroundColor: tint }]} />
        <View style={styles.navCalendarTicks}>
          <View style={[styles.navCalendarTick, { backgroundColor: tint }]} />
          <View style={[styles.navCalendarTick, { backgroundColor: tint }]} />
        </View>
      </View>
    );
  }
  if (name === 'plan') {
    return (
      <View style={[styles.navClipboardIcon, { borderColor: tint }]}>
        <View style={[styles.navClipboardClip, { borderColor: tint }]} />
        <View style={[styles.navIconLine, { backgroundColor: tint }]} />
        <View style={[styles.navIconLineShort, { backgroundColor: tint }]} />
      </View>
    );
  }
  if (name === 'materials') {
    return (
      <View style={[styles.navFolderIcon, { borderColor: tint }]}>
        <View style={[styles.navFolderTab, { borderColor: tint, backgroundColor: active ? '#EAF2FF' : '#FFFFFF' }]} />
        <View style={[styles.navFolderFill, { backgroundColor: active ? '#3370FF' : tint }]} />
      </View>
    );
  }
  if (name === 'review') {
    return (
      <View style={[styles.navReviewIcon, { borderColor: tint }]}>
        <View style={[styles.navReviewNeedle, { backgroundColor: tint }]} />
        <View style={[styles.navReviewDot, { backgroundColor: tint }]} />
      </View>
    );
  }
  return (
    <View style={styles.navUserIcon}>
      <View style={[styles.navUserHead, { borderColor: tint }]} />
      <View style={[styles.navUserBody, { borderColor: tint }]} />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    YantuSans: require('./assets/fonts/NotoSansCJKsc-Regular.otf'),
    YantuSansBold: require('./assets/fonts/NotoSansCJKsc-Bold.otf'),
  });
  const [data, setDataState] = useState<AppData | null>(null);
  const [tab, setTab] = useState<AppTab>('today');
  const [reviewMaterialId, setReviewMaterialId] = useState<string | undefined>(undefined);

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

  function navigate(nextTab: AppTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
  }

  function reviewMaterial(materialId: string) {
    setReviewMaterialId(materialId);
    setTab('review');
  }

  if (!data || !fontsLoaded) {
    return (
      <View style={[styles.app, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.sub, { marginTop: 12 }]}>加载研途带背...</Text>
      </View>
    );
  }

  const screen = tab === 'today'
    ? <TodayScreen data={data} setData={setData} onNavigate={navigate} />
    : tab === 'plan'
      ? <PlanScreen data={data} setData={setData} onNavigate={navigate} />
      : tab === 'materials'
        ? <MaterialsScreen data={data} setData={setData} onNavigate={navigate} onReviewMaterial={reviewMaterial} />
        : tab === 'review'
          ? <ReviewScreen
              data={data}
              setData={setData}
              focusMaterialId={reviewMaterialId}
              onExit={() => { setReviewMaterialId(undefined); navigate('today'); }}
              onGoMaterials={() => { setReviewMaterialId(undefined); navigate('materials'); }}
            />
          : tab === 'decision'
            ? <DecisionsScreen data={data} setData={setData} onOpenSettings={() => navigate('my')} />
          : <MyScreen data={data} setData={setData} onNavigate={navigate} />;
  const dueCards = data.cards.filter((card) => isUsableReviewCard(card) && new Date(card.dueAt).getTime() <= Date.now()).length;
  const todoTasks = data.tasks.filter((task) => task.status !== 'done').length;
  const tabBadge = (id: AppTab) => {
    if (id === 'review' && dueCards > 0) return dueCards > 99 ? '99+' : String(dueCards);
    if (id === 'plan' && todoTasks > 0) return todoTasks > 99 ? '99+' : String(todoTasks);
    return '';
  };

  return (
    <View style={styles.app}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />
      <View style={styles.screenHost}>{screen}</View>
      {tab !== 'review' ? <View style={styles.tabbar}>
        {tabs.map((item) => {
          const active = item.id === tab;
          const badge = tabBadge(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => navigate(item.id)}
              android_ripple={{ color: '#EAF2FF', borderless: false }}
              style={[styles.tab, active ? styles.tabActive : null]}
            >
              <View style={styles.tabIconWrap}>
                <TabGlyph name={item.icon} active={active} />
                {badge ? (
                  <View style={[styles.tabBadge, item.id === 'review' ? styles.tabBadgeHot : null]}>
                    <Text style={styles.tabBadgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View> : null}
    </View>
  );
}
