import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppButton } from '../components/Button';
import { SectionCard } from '../components/SectionCard';
import { scheduleReviewedCard } from '../services/materials';
import { isoToLocalDateKey, isDue } from '../services/date';
import { styles } from '../styles';
import { AppData, ReviewCard } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void };

export function ReviewScreen({ data, setData }: Props) {
  const [showAnswer, setShowAnswer] = useState(false);
  const dueCards = useMemo(() => data.cards.filter((card) => isDue(card.dueAt)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [data.cards]);
  const current = dueCards[0];
  const total = data.cards.length;

  function updateCard(card: ReviewCard, quality: 'again' | 'hard' | 'good') {
    const next = scheduleReviewedCard(card, quality);
    setData({ ...data, cards: data.cards.map((item) => item.id === card.id ? next : item) });
    setShowAnswer(false);
  }

  return (
    <ScrollView style={styles.app} contentContainerStyle={styles.container}>
      <Text style={styles.title}>带背复盘</Text>
      <Text style={styles.sub}>先主动回忆，再看答案。不要把“看过”误判为“会了”。</Text>

      <SectionCard title="复盘队列">
        <Text style={styles.h3}>到期 {dueCards.length} / 全部 {total}</Text>
        <Text style={styles.sub}>建议每天先清到期卡，再新增资料。复盘比囤资料更重要。</Text>
      </SectionCard>

      {!current ? (
        <SectionCard title="今天清空了">
          <Text style={styles.text}>当前没有到期卡。可以去「资料」生成新带背卡，或去「计划」补今日任务。</Text>
        </SectionCard>
      ) : (
        <SectionCard title={`${current.subject} · 第 ${dueCards.length} 张待复盘`}>
          <Text style={[styles.text, { fontWeight: '800', fontSize: 17 }]}>{current.prompt}</Text>
          {showAnswer ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.h3}>参考答案</Text>
              <Text style={styles.text}>{current.answer}</Text>
              <Text style={[styles.tiny, { marginTop: 8 }]}>已复习 {current.repetitions} 次 · 遗忘 {current.lapses} 次 · 当前间隔 {current.intervalDays} 天</Text>
            </View>
          ) : null}
          <View style={{ height: 12 }} />
          {!showAnswer ? (
            <AppButton title="显示答案" onPress={() => setShowAnswer(true)} />
          ) : (
            <View style={{ gap: 8 }}>
              <AppButton title="不会：今天再来" variant="danger" onPress={() => updateCard(current, 'again')} />
              <AppButton title="模糊：明天复习" variant="secondary" onPress={() => updateCard(current, 'hard')} />
              <AppButton title="会了：拉长间隔" onPress={() => updateCard(current, 'good')} />
            </View>
          )}
        </SectionCard>
      )}

      <Text style={styles.h2}>最近卡片</Text>
      {data.cards.slice(0, 8).map((card) => (
        <SectionCard key={card.id} title={card.prompt} subtitle={`${card.subject} · 下次 ${isoToLocalDateKey(card.dueAt) || '未知'}`}>
          <Text style={styles.sub} numberOfLines={2}>{card.answer}</Text>
        </SectionCard>
      ))}
    </ScrollView>
  );
}
