import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { SectionCard } from '../components/SectionCard';
import { SubjectPicker } from '../components/SubjectPicker';
import { createMaterial, generateCards } from '../services/materials';
import { styles } from '../styles';
import { AppData, Subject } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void };

const sample = `第一轮目标是熟悉所有知识点，遇到难点先标记，第二轮再集中处理。看课时尽量跟上老师速度，不要频繁暂停。做题之后要集中复习书本和解析，模糊点加强看。晚上复盘要努力回忆老师讲的案例和细节。`;

export function MaterialsScreen({ data, setData }: Props) {
  const [title, setTitle] = useState('专业课一轮复习说明');
  const [subject, setSubject] = useState<Subject>('专业课');
  const [tags, setTags] = useState('一轮 复盘');
  const [rawText, setRawText] = useState(sample);

  const materialLimitReached = !data.purchase.isPremium && data.materials.length >= 2;

  function saveMaterialAndCards() {
    if (materialLimitReached) {
      Alert.alert('免费版限制', '免费版最多保存 2 份资料。请删除旧资料或解锁 Pro。');
      return;
    }
    const material = createMaterial(title, subject, rawText, tags);
    if (material.rawText.length < 20) {
      Alert.alert('资料太短', '请粘贴至少 20 个字的讲义、真题或笔记。');
      return;
    }
    const cards = generateCards(material, data.purchase.isPremium);
    if (cards.length === 0) {
      Alert.alert('未生成卡片', '请粘贴更完整的句子或分段内容，每个知识点建议至少 12 个字。');
      return;
    }
    setData({ ...data, materials: [material, ...data.materials], cards: [...cards, ...data.cards] });
    Alert.alert('已生成带背卡', `新增资料 1 份，生成 ${cards.length} 张卡片。`);
  }

  function removeMaterial(id: string) {
    setData({
      ...data,
      materials: data.materials.filter((item) => item.id !== id),
      cards: data.cards.filter((card) => card.materialId !== id),
    });
  }

  return (
    <ScrollView style={styles.app} contentContainerStyle={styles.container}>
      <Text style={styles.title}>资料带背</Text>
      <Text style={styles.sub}>把讲义、真题、规划文字粘贴进来，生成可复盘的问答卡。</Text>

      <SectionCard title="新增资料" subtitle="MVP 版先做粘贴文本；后续可接文件解析和云端 AI。">
        <TextInput style={styles.input} placeholder="资料标题" value={title} onChangeText={setTitle} />
        <SubjectPicker value={subject} onChange={setSubject} />
        <TextInput style={styles.input} placeholder="标签，用空格或逗号分隔" value={tags} onChangeText={setTags} />
        <TextInput style={styles.textarea} placeholder="粘贴讲义、真题、笔记、复试要求……" multiline value={rawText} onChangeText={setRawText} />
        <AppButton title={materialLimitReached ? '免费版资料数已满' : '保存并生成带背卡'} onPress={saveMaterialAndCards} disabled={materialLimitReached} />
        <Text style={[styles.tiny, { marginTop: 8 }]}>免费版：2 份资料，每份最多 12 张卡；Pro：不限资料，单份最多 120 张卡。</Text>
      </SectionCard>

      <View style={styles.rowBetween}>
        <Text style={styles.h2}>资料库</Text>
        <Text style={styles.sub}>{data.materials.length} 份</Text>
      </View>
      {data.materials.length === 0 ? (
        <SectionCard>
          <Text style={styles.sub}>还没有资料。先用上面的样例生成第一组卡片。</Text>
        </SectionCard>
      ) : data.materials.map((material) => {
        const count = data.cards.filter((card) => card.materialId === material.id).length;
        return (
          <SectionCard key={material.id} title={material.title} subtitle={`${material.subject} · ${count} 张卡 · ${material.createdAt.slice(0, 10)}`}>
            <Text style={styles.text} numberOfLines={3}>{material.rawText}</Text>
            <View style={[styles.wrap, { marginTop: 8 }]}>{material.tags.map((tag) => <View key={tag} style={styles.chip}><Text style={styles.chipText}>{tag}</Text></View>)}</View>
            <AppButton title="删除资料" variant="danger" onPress={() => removeMaterial(material.id)} style={{ marginTop: 8 }} />
          </SectionCard>
        );
      })}
    </ScrollView>
  );
}
