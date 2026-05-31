import React, { useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { FormSheet } from '../components/FormSheet';
import { StatusPill } from '../components/StatusPill';
import { getExamCopy } from '../services/exam';
import { confirmAction, showToast } from '../services/ui';
import { parseOptionalInt } from '../services/validation';
import { colors, styles } from '../styles';
import { AppData, DecisionItem } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void; onOpenSettings?: () => void };

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function riskScore(item: DecisionItem): number {
  const level = { 低: 1, 中: 2, 高: 3 } as const;
  const hasScoreGap = Number.isFinite(item.currentScore) && Number.isFinite(item.lastCutoff);
  const scoreGap = hasScoreGap ? Number(item.currentScore) - Number(item.lastCutoff) : 0;
  const gapScore = scoreGap >= 20 ? -1 : scoreGap >= 0 ? 0 : 2;
  const interviewScore = item.interviewWeight && item.interviewWeight >= 50 ? 1 : 0;
  return level[item.costLevel] + level[item.certificateRisk] + level[item.englishRisk] + gapScore + interviewScore;
}

function riskTone(score: number): 'teal' | 'orange' | 'red' {
  if (score <= 3) return 'teal';
  if (score <= 6) return 'orange';
  return 'red';
}

export function DecisionsScreen({ data, setData, onOpenSettings }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [score, setScore] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [note, setNote] = useState('');
  const examCopy = getExamCopy(data.profile);
  const sortedDecisions = useMemo(() => [...data.decisions].sort((a, b) => riskScore(b) - riskScore(a)), [data.decisions]);
  const priority = sortedDecisions[0];
  const isCivil = data.profile.examType === '考公';

  function addDecision() {
    const currentScore = parseOptionalInt(score);
    const lastCutoff = parseOptionalInt(cutoff);
    if ((score.trim() && currentScore === undefined) || (cutoff.trim() && lastCutoff === undefined)) {
      Alert.alert('分数格式错误', '分数和参考线只能填写整数，或留空。');
      return;
    }
    const item: DecisionItem = {
      id: uid('decision'),
      school: school.trim() || (isCivil ? '未命名岗位' : '未命名院校'),
      major: major.trim() || (isCivil ? '未命名地区/方向' : '未命名专业'),
      track: isCivil ? '备选' : '复试',
      currentScore,
      lastCutoff,
      interviewWeight: undefined,
      costLevel: '中',
      certificateRisk: '中',
      englishRisk: '中',
      note: note.trim() || (isCivil ? '待补充：限制条件、竞争比、面试形式、通勤/成本。' : '待补充：复试比例、学费、毕业证风险、英语风险、调剂可能性。'),
      createdAt: new Date().toISOString(),
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({ ...data, decisions: [item, ...data.decisions] });
    setSchool('');
    setMajor('');
    setScore('');
    setCutoff('');
    setNote('');
    setSheetOpen(false);
    showToast('已加入决策表');
  }

  function removeDecision(id: string) {
    confirmAction('删除这个决策项？', '删除后不会影响资料和复盘卡。', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setData({ ...data, decisions: data.decisions.filter((item) => item.id !== id) });
      showToast('已删除决策项');
    }, '删除');
  }

  return (
    <View style={[styles.app, styles.myApp]}>
      <ScrollView style={styles.app} contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{isCivil ? '岗位决策' : '复试调剂决策'}</Text>
            <Text style={styles.sub}>{isCivil ? '岗位、地区、进面分和面试风险放在一起比较。' : '院校、专业、复试线、学费和调剂风险放在一起比较。'}</Text>
          </View>
          {onOpenSettings ? (
            <Pressable style={styles.headerIconButton} onPress={onOpenSettings}>
              <Text style={styles.myDecisionToggleText}>我的</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.decisionPreview}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.commandEyebrow}>当前最该判断</Text>
              <Text style={styles.h2}>{priority ? priority.school : examCopy.decisionEmpty}</Text>
              <Text style={styles.sub}>{priority ? `${priority.major} · ${priority.track}` : '先新增一个目标，再逐项补齐风险信息。'}</Text>
            </View>
            <StatusPill label={priority ? `${riskScore(priority)} 风险分` : data.profile.examType} tone={priority ? riskTone(riskScore(priority)) : 'blue'} />
          </View>
          <View style={styles.actionGrid}>
            <AppButton title="新增决策项" onPress={() => setSheetOpen(true)} style={{ flex: 1 }} />
            <AppButton title={isCivil ? '补岗位风险' : '补调剂风险'} variant="secondary" onPress={() => setSheetOpen(true)} style={{ flex: 1 }} />
          </View>
        </View>

        <View style={styles.mySectionPanel}>
          <Text style={styles.commandEyebrow}>{isCivil ? '考公字段' : '考研字段'}</Text>
          <View style={[styles.wrap, { marginTop: 10 }]}>
            {(isCivil
              ? ['岗位', '地区', '限制条件', '进面分', '竞争比', '面试形式', '通勤/成本', '风险等级']
              : ['院校', '专业', '复试线', '复试比例', '学费', '毕业证风险', '英语风险', '调剂可能性']
            ).map((item) => <StatusPill key={item} label={item} tone="gray" />)}
          </View>
        </View>

        <View style={styles.decisionRail}>
          {sortedDecisions.map((item) => {
            const scoreValue = riskScore(item);
            const tone = riskTone(scoreValue);
            return (
              <View key={item.id} style={[styles.decisionRailCard, { width: '100%', borderTopColor: tone === 'red' ? colors.red : tone === 'orange' ? colors.orange : colors.teal }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.h3} numberOfLines={2}>{item.school}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{item.major} · {item.track}</Text>
                  </View>
                  <StatusPill label={tone === 'teal' ? '低风险' : tone === 'orange' ? '中风险' : '高风险'} tone={tone} />
                </View>
                <Text style={styles.text} numberOfLines={3}>{item.note}</Text>
                <Text style={styles.tiny}>
                  {isCivil ? '进面分' : '当前分'} {item.currentScore ?? '-'} · {isCivil ? '参考分' : '复试线'} {item.lastCutoff ?? '-'} · 面试/复试权重 {item.interviewWeight ?? '-'}%
                </Text>
                <Pressable onPress={() => removeDecision(item.id)} style={styles.decisionDeleteButton}>
                  <Text style={styles.dangerText}>删除</Text>
                </Pressable>
              </View>
            );
          })}
          {sortedDecisions.length === 0 ? (
            <View style={styles.decisionPreviewNested}>
              <Text style={styles.h3}>还没有决策项</Text>
              <Text style={styles.sub}>先记录一个目标，后面再补复试线、成本和风险。</Text>
              <AppButton title="新增决策项" onPress={() => setSheetOpen(true)} />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <FormSheet visible={sheetOpen} title="新增决策项" subtitle={isCivil ? '记录岗位、地区和进面参考。' : '记录院校、专业和复试/调剂参考。'} onClose={() => setSheetOpen(false)}>
        <TextInput style={styles.input} placeholder={isCivil ? '岗位/单位，如：市直综合岗' : '院校，如：北京大学'} value={school} onChangeText={setSchool} />
        <TextInput style={styles.input} placeholder={isCivil ? '地区/方向，如：省直 / 行政执法' : '专业，如：金融科技 / 临床医学'} value={major} onChangeText={setMajor} />
        <View style={styles.actionGrid}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder={isCivil ? '进面分' : '当前分'} value={score} onChangeText={setScore} keyboardType="numeric" />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder={isCivil ? '参考分' : '复试线'} value={cutoff} onChangeText={setCutoff} keyboardType="numeric" />
        </View>
        <TextInput style={styles.textarea} placeholder={isCivil ? '限制条件、竞争比、面试形式、通勤/成本……' : '复试比例、学费、毕业证风险、英语风险、是否报班、调剂可能性……'} value={note} onChangeText={setNote} multiline />
        <AppButton title="加入决策表" onPress={addDecision} />
      </FormSheet>
    </View>
  );
}
