import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { SectionCard } from '../components/SectionCard';
import { exportAppData, importAppData, resetAppData } from '../services/storage';
import { purchaseLifetime, restorePurchases } from '../services/purchases';
import { styles } from '../styles';
import { AppData } from '../types';
import { parsePositiveInt } from '../services/validation';

type Props = { data: AppData; setData: (next: AppData) => void };

export function ProScreen({ data, setData }: Props) {
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');

  async function buy() {
    try {
      const purchase = await purchaseLifetime();
      setData({ ...data, purchase });
      Alert.alert('已解锁', purchase.source === 'mock' ? '当前为 mock 购买。正式上架前请接 RevenueCat。' : 'Pro 已解锁。');
    } catch (error: any) {
      Alert.alert('购买失败', error?.message ?? '未知错误');
    }
  }

  async function restore() {
    try {
      const purchase = await restorePurchases();
      setData({ ...data, purchase });
      Alert.alert('恢复完成', purchase.isPremium ? '已恢复 Pro。' : '没有找到 Pro 权益。');
    } catch (error: any) {
      Alert.alert('恢复失败', error?.message ?? '未知错误');
    }
  }

  async function exportData() {
    const raw = await exportAppData(data);
    setExportText(raw);
    Alert.alert('已生成导出文本', '复制下方 JSON 到安全位置即可备份。');
  }

  async function importData() {
    try {
      const next = await importAppData(importText);
      setData(next);
      Alert.alert('导入成功');
    } catch (error) {
      Alert.alert('导入失败', '请检查 JSON 是否完整。');
    }
  }

  async function resetAll() {
    const next = await resetAppData();
    setData(next);
  }

  function buildWeeklyReport() {
    const done = data.tasks.filter((task) => task.status === 'done');
    const minutes = data.focusSessions.reduce((sum, session) => sum + session.minutes, 0);
    const due = data.cards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;
    const report = [
      '【研途带背周报】',
      `目标：${data.profile.targetSchool} · ${data.profile.targetMajor}`,
      `完成任务：${done.length}/${data.tasks.length}`,
      `累计专注：${minutes} 分钟`,
      `资料：${data.materials.length} 份，卡片：${data.cards.length} 张，当前到期：${due} 张`,
      '下周建议：先清到期卡，再新增资料；英语和专业课至少各保留 3 个稳定学习日。',
    ].join('\n');
    setExportText(report);
  }

  return (
    <ScrollView style={styles.app} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pro / 设置</Text>
      <Text style={styles.sub}>当前状态：{data.purchase.isPremium ? 'Pro 已解锁' : '免费版'} · 来源：{data.purchase.source}</Text>

      <SectionCard title="Pro 解锁" subtitle="首发建议做一次性买断，不急着上订阅。">
        <Text style={styles.text}>Pro 包含：不限资料、不限卡片、完整周计划、周报导出、未来云端 AI 资料定制。</Text>
        <View style={[styles.rowBetween, { marginTop: 12 }]}>
          <AppButton title="解锁 Pro" onPress={buy} style={{ flex: 1 }} />
          <AppButton title="恢复购买" variant="secondary" onPress={restore} style={{ flex: 1 }} />
        </View>
        <Text style={[styles.tiny, { marginTop: 8 }]}>默认 mock。正式上架前配置 RevenueCat、Google Play 商品和 development build。</Text>
      </SectionCard>

      <SectionCard title="用户档案">
        <TextInput style={styles.input} value={data.profile.name} onChangeText={(name) => setData({ ...data, profile: { ...data.profile, name } })} placeholder="名称" />
        <TextInput style={styles.input} value={data.profile.targetSchool} onChangeText={(targetSchool) => setData({ ...data, profile: { ...data.profile, targetSchool } })} placeholder="目标院校" />
        <TextInput style={styles.input} value={data.profile.targetMajor} onChangeText={(targetMajor) => setData({ ...data, profile: { ...data.profile, targetMajor } })} placeholder="目标专业" />
        <TextInput style={styles.input} value={String(data.profile.dailyHours)} onChangeText={(dailyHours) => setData({ ...data, profile: { ...data.profile, dailyHours: parsePositiveInt(dailyHours, data.profile.dailyHours || 6, 1, 16) } })} keyboardType="number-pad" placeholder="每日可学习小时" />
        <TextInput style={styles.input} value={data.profile.weakPoints} onChangeText={(weakPoints) => setData({ ...data, profile: { ...data.profile, weakPoints } })} placeholder="薄弱点" />
      </SectionCard>

      <SectionCard title="周报 / 备份">
        <View style={styles.rowBetween}>
          <AppButton title="生成周报" onPress={buildWeeklyReport} style={{ flex: 1 }} />
          <AppButton title="导出 JSON" variant="secondary" onPress={exportData} style={{ flex: 1 }} />
        </View>
        <TextInput style={[styles.textarea, { marginTop: 8 }]} multiline value={exportText} onChangeText={setExportText} placeholder="导出内容会显示在这里" />
        <TextInput style={styles.textarea} multiline value={importText} onChangeText={setImportText} placeholder="粘贴 JSON 备份用于导入" />
        <View style={styles.rowBetween}>
          <AppButton title="导入" variant="secondary" onPress={importData} style={{ flex: 1 }} />
          <AppButton title="清空重置" variant="danger" onPress={resetAll} style={{ flex: 1 }} />
        </View>
      </SectionCard>

      <SectionCard title="隐私默认策略">
        <Text style={styles.text}>• 当前所有学习资料都保存在本机。</Text>
        <Text style={styles.text}>• 不需要登录，不上传资料。</Text>
        <Text style={styles.text}>• 启用 RevenueCat 后，只处理购买状态。</Text>
        <Text style={styles.text}>• 未来接云端 AI 前，必须更新隐私政策和商店 Data Safety。</Text>
      </SectionCard>
    </ScrollView>
  );
}
