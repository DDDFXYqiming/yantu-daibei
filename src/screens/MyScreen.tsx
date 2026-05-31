import React, { useMemo, useState } from 'react';
import { Alert, Image, LayoutAnimation, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AppButton } from '../components/Button';
import { FormSheet } from '../components/FormSheet';
import { StatusPill } from '../components/StatusPill';
import { exportAppData, importAppData, resetAppData } from '../services/storage';
import { purchaseLifetime, restorePurchases } from '../services/purchases';
import { confirmAction, showToast } from '../services/ui';
import { parseOptionalInt, parsePositiveInt } from '../services/validation';
import { EXAM_TYPES, getExamCopy, getSubjectsForExam } from '../services/exam';
import { colors, styles } from '../styles';
import { AppData, AppTab, DecisionItem, ExamType, UserProfile } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void; onNavigate?: (tab: AppTab) => void };
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const mineHeroImage = require('../../assets/mine-hero.png');

function riskScore(item: DecisionItem): number {
  const level = { 低: 1, 中: 2, 高: 3 } as const;
  const hasScoreGap = Number.isFinite(item.currentScore) && Number.isFinite(item.lastCutoff);
  const scoreGap = hasScoreGap ? Number(item.currentScore) - Number(item.lastCutoff) : 0;
  const gapScore = scoreGap >= 20 ? -1 : scoreGap >= 0 ? 0 : 2;
  const interviewScore = item.interviewWeight && item.interviewWeight >= 50 ? 1 : 0;
  return level[item.costLevel] + level[item.certificateRisk] + level[item.englishRisk] + gapScore + interviewScore;
}

export function MyScreen({ data, setData }: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [decisionPreviewOpen, setDecisionPreviewOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UserProfile | null>(null);
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [score, setScore] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [note, setNote] = useState('');

  const sortedDecisions = useMemo(() => [...data.decisions].sort((a, b) => riskScore(b) - riskScore(a)), [data.decisions]);
  const priorityDecision = sortedDecisions[0];
  const examCopy = getExamCopy(data.profile);
  const subjectConfig = getSubjectsForExam(data.profile.examType).filter((subject) => subject !== '其他');
  const draftProfile = profileDraft ?? data.profile;
  const draftExamCopy = getExamCopy(draftProfile);
  const draftSubjectConfig = getSubjectsForExam(draftProfile.examType).filter((subject) => subject !== '其他');
  const historicalMaterials = data.materials.filter((material) => !getSubjectsForExam(data.profile.examType).includes(material.subject));
  async function buy() {
    try {
      const purchase = await purchaseLifetime();
      setData({ ...data, purchase });
      showToast('学习权益已更新');
    } catch (error: any) {
      Alert.alert('购买失败', '暂时无法完成购买，请稍后再试。');
    }
  }

  async function restore() {
    try {
      const purchase = await restorePurchases(data.purchase.isPremium);
      setData({ ...data, purchase });
      showToast(purchase.isPremium ? '已恢复 Pro' : '没有找到 Pro 权益');
    } catch (error: any) {
      Alert.alert('恢复失败', '暂时无法恢复购买，请稍后再试。');
    }
  }

  async function exportData() {
    const raw = await exportAppData(data);
    setExportText(raw);
    setBackupOpen(true);
    showToast('备份文本已生成');
  }

  async function importData() {
    try {
      const next = await importAppData(importText);
      setData(next);
      showToast('导入成功');
    } catch (error) {
      Alert.alert('导入失败', '请检查备份文本是否完整。');
    }
  }

  async function resetAll() {
    confirmAction('清空所有数据？', '资料、任务、复盘卡、决策表和专注记录都会删除，回到新用户空白状态。', async () => {
      const next = await resetAppData();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setData(next);
      showToast('已清空本机数据');
    }, '清空');
  }

  function buildWeeklyReport() {
    const done = data.tasks.filter((task) => task.status === 'done');
    const minutes = data.focusSessions.reduce((sum, session) => sum + session.minutes, 0);
    const due = data.cards.filter((card) => new Date(card.dueAt).getTime() <= Date.now()).length;
    setExportText([
      '【研途带背周报】',
      `${examCopy.targetLabel}：${data.profile.targetSchool} · ${data.profile.targetMajor}`,
      `完成任务：${done.length}/${data.tasks.length}`,
      `累计专注：${minutes} 分钟`,
      `资料：${data.materials.length} 份，卡片：${data.cards.length} 张，当前到期：${due} 张`,
      `下周建议：先清到期卡，再新增资料；${examCopy.primarySubjects}至少各保留 3 个稳定学习日。`,
    ].join('\n'));
    setBackupOpen(true);
  }

  function addDecision() {
    const currentScore = parseOptionalInt(score);
    const lastCutoff = parseOptionalInt(cutoff);
    if ((score.trim() && currentScore === undefined) || (cutoff.trim() && lastCutoff === undefined)) {
      Alert.alert('分数格式错误', '分数和参考线只能填写整数，或留空。');
      return;
    }
    const item: DecisionItem = {
      id: uid('decision'),
      school: school.trim() || `未命名${examCopy.targetLabel.replace('目标', '')}`,
      major: major.trim() || `未命名${examCopy.majorLabel.replace('目标', '')}`,
      track: data.profile.examType === '考公' ? '备选' : '备选',
      currentScore,
      lastCutoff,
      interviewWeight: undefined,
      costLevel: '中',
      certificateRisk: '中',
      englishRisk: '中',
      note: note.trim() || (data.profile.examType === '考公' ? '待补充：岗位限制、进面分、面试形式、通勤成本。' : '待补充：复试比例、英语、学费、毕业证、调剂开放时间。'),
      createdAt: new Date().toISOString(),
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({ ...data, decisions: [item, ...data.decisions] });
    setSchool('');
    setMajor('');
    setScore('');
    setCutoff('');
    setNote('');
    setDecisionOpen(false);
    showToast('已加入决策表');
  }

  function openProfileEditor() {
    setProfileDraft(data.profile);
    setProfileOpen(true);
  }

  function closeProfileEditor() {
    setProfileDraft(null);
    setProfileOpen(false);
  }

  function updateProfileDraft(patch: Partial<UserProfile>) {
    setProfileDraft((current) => ({ ...(current ?? data.profile), ...patch }));
  }

  function updateExamTypeDraft(examType: ExamType) {
    const current = profileDraft ?? data.profile;
    const previousType = current.examType;
    const targetSchool = examType === previousType
      ? current.targetSchool
      : examType === '考公'
        ? '目标岗位'
        : '目标院校';
    const targetMajor = examType === previousType
      ? current.targetMajor
      : examType === '考公'
        ? '报考方向'
        : '目标专业';
    updateProfileDraft({
      examType,
      targetSchool,
      targetMajor,
    });
  }

  function saveProfileDraft() {
    if (!profileDraft) {
      setProfileOpen(false);
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setData({ ...data, profile: profileDraft });
    setProfileDraft(null);
    setProfileOpen(false);
    showToast('备考档案已更新');
  }

  function removeDecision(id: string) {
    confirmAction('删除这个决策项？', '删除后不会影响资料和复盘卡。', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setData({ ...data, decisions: data.decisions.filter((item) => item.id !== id) });
      showToast('已删除决策项');
    }, '删除');
  }

  return (
    <ScrollView style={[styles.app, styles.myApp]} contentContainerStyle={styles.container}>
      <Text style={styles.title}>我的</Text>
      <Text style={styles.sub}>配置、备份和学习权益集中在这里。</Text>

      <View style={styles.accountHero}>
        <Image source={mineHeroImage} style={styles.accountHeroImage} resizeMode="cover" />
        <View style={styles.accountAvatar}>
          <Text style={styles.accountAvatarText}>{data.profile.name.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.commandEyebrow}>备考档案</Text>
          <Text style={styles.commandTitle}>{data.profile.name}</Text>
          <Text style={styles.sub}>{data.profile.targetSchool} · {data.profile.targetMajor}</Text>
        </View>
        <AppButton title="编辑" variant="secondary" onPress={openProfileEditor} />
      </View>

      <View style={styles.mySectionPanel}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commandEyebrow}>考试类型 / 科目配置</Text>
            <Text style={styles.h3}>{data.profile.examType} · {subjectConfig.slice(0, 3).join(' / ')}</Text>
          </View>
          <Pressable style={styles.myMoreToggle} onPress={openProfileEditor}>
            <Text style={styles.myDecisionToggleText}>调整</Text>
          </Pressable>
        </View>
        <View style={[styles.wrap, { marginTop: 10 }]}>
          {subjectConfig.map((subject) => <StatusPill key={subject} label={subject} tone="gray" />)}
        </View>
        {historicalMaterials.length ? <Text style={[styles.tiny, { marginTop: 8 }]}>有 {historicalMaterials.length} 份历史资料会保留在资料库，科目不匹配时按历史资料处理。</Text> : null}
      </View>

      <View style={styles.settingsList}>
        <Pressable style={styles.settingsRow} onPress={() => setBackupOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>数据备份</Text>
            <Text style={styles.sub}>导出周报、本机备份或导入备份文本。</Text>
          </View>
          <Text style={styles.myDecisionToggleText}>打开</Text>
        </Pressable>
        <Pressable style={styles.settingsRow} onPress={() => setToolsOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>学习权益</Text>
            <Text style={styles.sub}>{data.purchase.isPremium ? '已解锁完整资料库。' : '免费版正在使用，需要容量时再升级。'}</Text>
          </View>
          <StatusPill label={data.purchase.isPremium ? '已解锁' : '免费版'} tone={data.purchase.isPremium ? 'teal' : 'gray'} />
        </Pressable>
      </View>

      <View style={styles.decisionPreviewNested}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commandEyebrow}>{examCopy.decisionTitle}</Text>
            <Text style={styles.h3}>{priorityDecision ? `当前优先：${priorityDecision.school}` : examCopy.decisionEmpty}</Text>
          </View>
          <View style={styles.myDecisionActions}>
            <Pressable style={styles.myDecisionToggle} onPress={() => setDecisionPreviewOpen((value) => !value)}>
              <Text style={styles.myDecisionToggleText}>{decisionPreviewOpen ? '收起' : '查看'}</Text>
            </Pressable>
            <AppButton title="新增" variant="secondary" onPress={() => setDecisionOpen(true)} />
          </View>
        </View>
        {priorityDecision ? (
          <View style={styles.myDecisionSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h3}>{priorityDecision.school}</Text>
              <Text style={styles.sub} numberOfLines={1}>{priorityDecision.major} · {priorityDecision.track}</Text>
            </View>
            <StatusPill label={riskScore(priorityDecision) <= 3 ? '低风险' : riskScore(priorityDecision) <= 6 ? '中风险' : '高风险'} tone={riskScore(priorityDecision) <= 3 ? 'teal' : riskScore(priorityDecision) <= 6 ? 'orange' : 'red'} />
          </View>
        ) : null}
        {decisionPreviewOpen ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.decisionRail}>
              {sortedDecisions.slice(0, 3).map((item) => {
                const scoreValue = riskScore(item);
                const tone = scoreValue <= 3 ? colors.teal : scoreValue <= 6 ? colors.orange : colors.red;
                return (
                  <View key={item.id} style={[styles.decisionRailCard, { borderTopColor: tone }]}>
                    <StatusPill label={scoreValue <= 3 ? '低风险' : scoreValue <= 6 ? '中风险' : '高风险'} tone={scoreValue <= 3 ? 'teal' : scoreValue <= 6 ? 'orange' : 'red'} />
                    <Text style={styles.h3} numberOfLines={2}>{item.school}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{item.major} · {item.track}</Text>
                    <View style={styles.decisionScoreRow}>
                      <Text style={styles.metricValue}>{item.currentScore ?? '-'}</Text>
                      <Text style={styles.sub}>参考 {item.lastCutoff ?? '-'}</Text>
                    </View>
                    <Text style={styles.tiny} numberOfLines={2}>{item.note}</Text>
                    <Pressable onPress={() => removeDecision(item.id)} style={styles.decisionDeleteButton}>
                      <Text style={styles.dangerText}>删除</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
            {sortedDecisions.length > 3 ? <Text style={styles.tiny}>还有 {sortedDecisions.length - 3} 个决策项，先处理风险最高的几个。</Text> : null}
          </>
        ) : null}
      </View>

      <FormSheet visible={profileOpen} title="编辑档案" subtitle="先预览配置，点完成后才保存。" onClose={closeProfileEditor}>
        <TextInput style={styles.input} value={draftProfile.name} onChangeText={(name) => updateProfileDraft({ name })} placeholder="名称" />
        <Text style={styles.commandEyebrow}>考试类型</Text>
        <View style={styles.segmentedRow}>
          {EXAM_TYPES.map((examType) => (
            <Pressable key={examType} onPress={() => updateExamTypeDraft(examType)} style={[styles.segmentedButton, draftProfile.examType === examType ? styles.segmentedButtonActive : null]}>
              <Text style={[styles.segmentedButtonText, draftProfile.examType === examType ? styles.segmentedButtonTextActive : null]}>{examType}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.commandEyebrow}>默认科目</Text>
        <View style={[styles.wrap, { marginBottom: 8 }]}>
          {draftSubjectConfig.map((subject) => <StatusPill key={subject} label={subject} tone="gray" />)}
        </View>
        {draftProfile.examType !== data.profile.examType ? <Text style={[styles.tiny, { marginBottom: 8 }]}>切换后将使用 {draftExamCopy.targetLabel}、{draftExamCopy.majorLabel} 和 {draftSubjectConfig.join(' / ')}。已有资料不会删除。</Text> : null}
        <TextInput style={styles.input} value={draftProfile.targetSchool} onChangeText={(targetSchool) => updateProfileDraft({ targetSchool })} placeholder={draftExamCopy.targetPlaceholder} />
        <TextInput style={styles.input} value={draftProfile.targetMajor} onChangeText={(targetMajor) => updateProfileDraft({ targetMajor })} placeholder={draftExamCopy.majorPlaceholder} />
        <Text style={styles.commandEyebrow}>每日可学习小时</Text>
        <TextInput style={styles.input} value={String(draftProfile.dailyHours)} onChangeText={(dailyHours) => updateProfileDraft({ dailyHours: parsePositiveInt(dailyHours, draftProfile.dailyHours || 6, 1, 16) })} keyboardType="number-pad" placeholder="例如 6" />
        <TextInput style={styles.input} value={draftProfile.weakPoints} onChangeText={(weakPoints) => updateProfileDraft({ weakPoints })} placeholder={draftExamCopy.profileWeakPlaceholder} />
        <View style={styles.row}>
          <AppButton title="关闭" variant="secondary" onPress={closeProfileEditor} style={{ flex: 1 }} />
          <AppButton title="完成" onPress={saveProfileDraft} style={{ flex: 1 }} />
        </View>
      </FormSheet>

      <FormSheet visible={decisionOpen} title="新增决策项" subtitle={`先记录${examCopy.targetLabel}、${examCopy.majorLabel}和分数，方便后面比较。`} onClose={() => setDecisionOpen(false)}>
        <TextInput style={styles.input} placeholder={examCopy.decisionSchoolPlaceholder} value={school} onChangeText={setSchool} />
        <TextInput style={styles.input} placeholder={examCopy.decisionMajorPlaceholder} value={major} onChangeText={setMajor} />
        <View style={styles.rowBetween}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="我的分数" value={score} onChangeText={setScore} keyboardType="number-pad" />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="参考线" value={cutoff} onChangeText={setCutoff} keyboardType="number-pad" />
        </View>
        <TextInput style={styles.input} placeholder={examCopy.decisionNotePlaceholder} value={note} onChangeText={setNote} />
        <AppButton title="加入决策表" onPress={addDecision} />
      </FormSheet>

      <FormSheet visible={toolsOpen} title="本机与容量" subtitle="低频操作集中在这里。" onClose={() => setToolsOpen(false)}>
        <View style={styles.entitlementBanner}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.commandEyebrow}>学习权益</Text>
              <Text style={styles.h3}>{data.purchase.isPremium ? '已解锁完整资料库' : '免费版正在使用'}</Text>
              <Text style={styles.sub}>{data.purchase.isPremium ? '资料容量和计划长度已升级。' : '需要更多资料容量时再升级。'}</Text>
            </View>
            <StatusPill label={data.purchase.isPremium ? '已解锁' : '免费版'} tone={data.purchase.isPremium ? 'teal' : 'gray'} />
          </View>
          <View style={styles.actionGrid}>
            {!data.purchase.isPremium ? <AppButton title="解锁 Pro" onPress={buy} style={{ flex: 1 }} /> : null}
            <AppButton title="恢复购买" variant="secondary" onPress={restore} style={{ flex: 1 }} />
          </View>
        </View>
        <View style={styles.settingsList}>
          <Pressable style={styles.settingsRow} onPress={() => { setToolsOpen(false); buildWeeklyReport(); }}>
            <Text style={styles.h3}>生成周报</Text>
            <Text style={styles.sub}>汇总任务、专注、资料和复盘。</Text>
          </Pressable>
          <Pressable style={styles.settingsRow} onPress={() => { setToolsOpen(false); exportData(); }}>
            <Text style={styles.h3}>备份数据</Text>
            <Text style={styles.sub}>导出或导入本机备份文本。</Text>
          </Pressable>
        </View>
        <View style={styles.profileSummary}>
          <Text style={styles.commandEyebrow}>隐私默认策略</Text>
          <Text style={styles.text}>当前所有学习资料都保存在本机；不需要登录，不上传资料。备份文本由你手动导出和导入，购买功能只用于确认权益状态。</Text>
        </View>
      </FormSheet>

      <FormSheet visible={backupOpen} title="周报与备份" subtitle="低频操作集中在这里，不打扰日常学习。" onClose={() => setBackupOpen(false)}>
        <View style={styles.actionGrid}>
          <AppButton title="生成周报" onPress={buildWeeklyReport} style={{ flex: 1 }} />
          <AppButton title="导出备份" variant="secondary" onPress={exportData} style={{ flex: 1 }} />
        </View>
        <TextInput style={[styles.textarea, { marginTop: 8 }]} multiline value={exportText} onChangeText={setExportText} placeholder="周报或导出内容会显示在这里" />
        <TextInput style={styles.textarea} multiline value={importText} onChangeText={setImportText} placeholder="粘贴备份文本用于导入" />
        <View style={styles.actionGrid}>
          <AppButton title="导入" variant="secondary" onPress={importData} style={{ flex: 1 }} />
          <AppButton title="清空重置" variant="danger" onPress={resetAll} style={{ flex: 1 }} />
        </View>
      </FormSheet>
    </ScrollView>
  );
}
