import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { SectionCard } from '../components/SectionCard';
import { colors, styles } from '../styles';
import { AppData, DecisionItem } from '../types';
import { parseOptionalInt } from '../services/validation';

type Props = { data: AppData; setData: (next: AppData) => void };
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function riskScore(item: DecisionItem): number {
  const level = { 低: 1, 中: 2, 高: 3 } as const;
  const hasScoreGap = Number.isFinite(item.currentScore) && Number.isFinite(item.lastCutoff);
  const scoreGap = hasScoreGap ? Number(item.currentScore) - Number(item.lastCutoff) : 0;
  const gapScore = scoreGap >= 20 ? -1 : scoreGap >= 0 ? 0 : 2;
  const interviewScore = item.interviewWeight && item.interviewWeight >= 50 ? 1 : 0;
  return level[item.costLevel] + level[item.certificateRisk] + level[item.englishRisk] + gapScore + interviewScore;
}

export function DecisionsScreen({ data, setData }: Props) {
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [score, setScore] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [note, setNote] = useState('');

  const sorted = useMemo(() => [...data.decisions].sort((a, b) => riskScore(a) - riskScore(b)), [data.decisions]);

  function addDecision() {
    const currentScore = parseOptionalInt(score);
    const lastCutoff = parseOptionalInt(cutoff);
    if ((score.trim() && currentScore === undefined) || (cutoff.trim() && lastCutoff === undefined)) {
      Alert.alert('分数格式错误', '分数和参考线只能填写整数，或留空。');
      return;
    }
    const item: DecisionItem = {
      id: uid('decision'),
      school: school.trim() || '未命名院校',
      major: major.trim() || '未命名专业',
      track: '备选',
      currentScore,
      lastCutoff,
      interviewWeight: undefined,
      costLevel: '中',
      certificateRisk: '中',
      englishRisk: '中',
      note: note || '待补充：复试比例、英语、学费、毕业证、调剂开放时间。',
      createdAt: new Date().toISOString(),
    };
    setData({ ...data, decisions: [item, ...data.decisions] });
    setSchool(''); setMajor(''); setScore(''); setCutoff(''); setNote('');
  }

  function removeDecision(id: string) {
    setData({ ...data, decisions: data.decisions.filter((item) => item.id !== id) });
  }

  return (
    <ScrollView style={styles.app} contentContainerStyle={styles.container}>
      <Text style={styles.title}>复试 / 调剂决策</Text>
      <Text style={styles.sub}>不要只看“能不能去”，要同时看分数、复试权重、英语、证书、学费和城市成本。</Text>

      <SectionCard title="新增备选">
        <TextInput style={styles.input} placeholder="院校，如：北京大学" value={school} onChangeText={setSchool} />
        <TextInput style={styles.input} placeholder="专业，如：金融科技 / 临床医学" value={major} onChangeText={setMajor} />
        <View style={styles.rowBetween}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="我的分数" value={score} onChangeText={setScore} keyboardType="number-pad" />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="去年线/参考线" value={cutoff} onChangeText={setCutoff} keyboardType="number-pad" />
        </View>
        <TextInput style={styles.input} placeholder="备注：复试比例、学费、毕业证、是否报班……" value={note} onChangeText={setNote} />
        <AppButton title="加入决策表" onPress={addDecision} />
      </SectionCard>

      <SectionCard title="报班判断模板" subtitle="不是直接建议报或不报，而是让用户明确买的到底是什么。">
        <Text style={styles.text}>• 如果缺的是信息差：买往年真题、复试流程、导师/考场经验。</Text>
        <Text style={styles.text}>• 如果缺的是执行：买监督和批改，而不是只买网课。</Text>
        <Text style={styles.text}>• 如果缺的是英语口语/听力：优先买可反馈的训练。</Text>
        <Text style={styles.text}>• 如果学校复试五五开：复试投入的边际收益更高。</Text>
      </SectionCard>

      <Text style={styles.h2}>备选列表</Text>
      {sorted.map((item) => {
        const scoreValue = riskScore(item);
        const risk = scoreValue <= 3 ? '低风险' : scoreValue <= 6 ? '中风险' : '高风险';
        const riskColor = scoreValue <= 3 ? colors.green : scoreValue <= 6 ? colors.orange : colors.red;
        return (
          <SectionCard key={item.id} title={`${item.school} · ${item.major}`} subtitle={`${item.track} · ${risk}`}>
            <Text style={[styles.h3, { color: riskColor }]}>综合风险分：{scoreValue}</Text>
            <Text style={styles.text}>分数：{item.currentScore ?? '-'} / 参考线：{item.lastCutoff ?? '-'}</Text>
            <Text style={styles.text}>成本：{item.costLevel} · 证书风险：{item.certificateRisk} · 英语风险：{item.englishRisk}</Text>
            <Text style={styles.sub}>{item.note}</Text>
            <AppButton title="删除" variant="danger" onPress={() => removeDecision(item.id)} style={{ marginTop: 8 }} />
          </SectionCard>
        );
      })}
    </ScrollView>
  );
}
