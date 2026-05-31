import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Image, ImageBackground, LayoutAnimation, Pressable, ScrollView, Text, View } from 'react-native';
import { AppButton } from '../components/Button';
import { MetricTile } from '../components/MetricTile';
import { StatusPill } from '../components/StatusPill';
import { isUsableReviewCard, scheduleReviewedCard } from '../services/materials';
import { isoToLocalDateKey, isDue } from '../services/date';
import { buildSpeechText, canUseReviewSpeech, speakReviewText, stopReviewSpeech } from '../services/speech';
import { subjectAccent, subjectTone } from '../services/subjects';
import { showToast } from '../services/ui';
import { styles } from '../styles';
import { AppData, ReviewCard } from '../types';

type Props = { data: AppData; setData: (next: AppData) => void; focusMaterialId?: string; onExit: () => void; onGoMaterials: () => void };
type ReviewMode = 'cloze' | 'qa';
type ReviewQuality = 'again' | 'hard' | 'good';
type ReviewFeedback = { message: string; quality: ReviewQuality; reviewed: number; remaining: number; nextPrompt?: string };
const reviewHeroImage = require('../../assets/review-hero.png');
const reviewPaperTexture = require('../../assets/review-paper-texture.png');

function BackGlyph() {
  return (
    <View style={styles.reviewBackGlyph}>
      <View style={styles.reviewBackStem} />
      <View style={styles.reviewBackWingTop} />
      <View style={styles.reviewBackWingBottom} />
    </View>
  );
}

function ReportGlyph() {
  return (
    <View style={styles.reviewReportGlyph}>
      <View style={[styles.reviewReportBar, { height: 9 }]} />
      <View style={[styles.reviewReportBar, { height: 15 }]} />
      <View style={[styles.reviewReportBar, { height: 12 }]} />
    </View>
  );
}

function ReviewScoreButton({
  label,
  detail,
  quality,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  quality: ReviewQuality;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.answerQuickScoreButton, styles[`answerQuickScoreButton_${quality}`], disabled ? styles.answerQuickScoreDisabled : null]}>
      <Text style={[styles.answerQuickScoreText, styles[`answerQuickScoreText_${quality}`]]}>{label}</Text>
      <Text style={styles.answerQuickScoreSub}>{detail}</Text>
    </Pressable>
  );
}

function ReviewBookGlyph() {
  return (
    <View style={styles.reviewBookGlyph}>
      <View style={styles.reviewBookPageLeft} />
      <View style={styles.reviewBookPageRight} />
      <View style={styles.reviewBookSpine} />
    </View>
  );
}

function modePrompt(card: ReviewCard, mode: ReviewMode): string {
  if (mode === 'cloze' && card.cloze) {
    return `补全挖空，并用自己的话解释。\n${card.cloze}`;
  }
  if (card.sourceText) {
    return `请完整复述这条知识点。\n${card.sourceText.slice(0, 72)}${card.sourceText.length > 72 ? '...' : ''}`;
  }
  return card.prompt;
}

function cleanAnswerText(text: string): string {
  return text
    .replace(/核心材料[:：]/g, '参考答案：')
    .replace(/回答结构[:：]/g, '答题要点：')
    .replace(/关键词[:：].*$/gm, '')
    .replace(/\bANSWER\b/gi, '')
    .trim();
}

function answerSections(card: ReviewCard): { reference: string; points: string; warning: string } {
  const cleaned = cleanAnswerText(card.answer || card.sourceText || '');
  const reference = cleaned.match(/参考答案[:：]([\s\S]*?)(?=\n\n答题要点[:：]|\n\n易错提醒[:：]|$)/)?.[1]?.trim()
    || card.sourceText
    || cleaned.split(/\n\n/)[0]
    || '先按题面回忆，再对照原资料补齐答案。';
  const points = cleaned.match(/答题要点[:：]([\s\S]*?)(?=\n\n易错提醒[:：]|$)/)?.[1]?.trim()
    || (card.keywords?.length ? card.keywords.join('、') : '定义、适用条件、易错点、真题问法。');
  const warning = cleaned.match(/易错提醒[:：]([\s\S]*?)$/)?.[1]?.trim()
    || '不要直接背整段材料，先闭卷复述，再检查关键词是否遗漏。';
  return { reference, points, warning };
}

function buildReport(cards: ReviewCard[]) {
  const due = cards.filter((card) => isDue(card.dueAt));
  const weakCards = cards
    .filter((card) => card.lapses > 0 || (isDue(card.dueAt) && card.repetitions === 0))
    .sort((a, b) => b.lapses - a.lapses || a.dueAt.localeCompare(b.dueAt));
  const mastered = cards.filter((card) => card.repetitions >= 2 && card.lapses === 0);
  const weakRate = cards.length ? Math.round((weakCards.length / cards.length) * 100) : 0;
  const subjectCounts = new Map<string, number>();
  weakCards.forEach((card) => subjectCounts.set(card.subject, (subjectCounts.get(card.subject) ?? 0) + 1));
  const weakSubject = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '暂无';
  const suggestion = due.length > 0
    ? `先清 ${due.length} 张到期卡，答题前优先用挖空模式主动回忆。`
    : weakCards.length > 0
      ? '今天没有到期卡，可抽查薄弱卡并回到原资料重背关键词。'
      : '当前节奏稳定，下一步可以继续导入新资料。';
  return { due, weakCards, mastered, weakRate, weakSubject, suggestion };
}

export function ReviewScreen({ data, setData, focusMaterialId, onExit, onGoMaterials }: Props) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [mode, setMode] = useState<ReviewMode>('cloze');
  const [lastResult, setLastResult] = useState<ReviewFeedback | null>(null);
  const [sessionReviewedIds, setSessionReviewedIds] = useState<string[]>([]);
  const [speechReady, setSpeechReady] = useState(canUseReviewSpeech());
  const [scoring, setScoring] = useState(false);
  const [scoringQuality, setScoringQuality] = useState<ReviewQuality | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const cardMotion = useRef(new Animated.Value(1)).current;
  const flipMotion = useRef(new Animated.Value(0)).current;
  const usableCards = useMemo(() => data.cards.filter(isUsableReviewCard), [data.cards]);
  const globalDueCards = useMemo(() => usableCards.filter((card) => isDue(card.dueAt)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [usableCards]);
  const reviewCards = useMemo(() => {
    if (!focusMaterialId) return globalDueCards;
    return usableCards
      .filter((card) => card.materialId === focusMaterialId && !sessionReviewedIds.includes(card.id))
      .sort((a, b) => Number(isDue(b.dueAt)) - Number(isDue(a.dueAt)) || a.dueAt.localeCompare(b.dueAt));
  }, [focusMaterialId, globalDueCards, sessionReviewedIds, usableCards]);
  const current = reviewCards[0];
  const currentAnswer = current ? answerSections(current) : null;
  const focusTotal = focusMaterialId ? usableCards.filter((card) => card.materialId === focusMaterialId).length : 0;
  const total = focusMaterialId ? focusTotal : usableCards.length;
  const currentIndex = focusMaterialId
    ? Math.min(sessionReviewedIds.length + 1, Math.max(total, 1))
    : Math.max(1, total - reviewCards.length + 1);
  const report = useMemo(() => buildReport(usableCards), [usableCards]);
  const focusMaterial = focusMaterialId ? data.materials.find((material) => material.id === focusMaterialId) : undefined;
  const focusDueCount = focusMaterialId ? reviewCards.filter((card) => isDue(card.dueAt)).length : 0;
  const reportTrend = [36, 52, 44, 64, Math.max(48, 88 - report.weakRate)];

  useEffect(() => {
    setShowAnswer(false);
    flipMotion.setValue(0);
    stopReviewSpeech().catch(() => undefined);
  }, [current?.id, flipMotion, mode]);

  useEffect(() => {
    setSessionReviewedIds([]);
  }, [focusMaterialId]);

  useEffect(() => {
    Animated.timing(flipMotion, {
      toValue: showAnswer ? 1 : 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [flipMotion, showAnswer]);

  useEffect(() => {
    cardMotion.setValue(0);
    Animated.timing(cardMotion, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [cardMotion, current?.id, mode]);

  useEffect(() => () => {
    stopReviewSpeech().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!lastResult) return;
    const timer = setTimeout(() => setLastResult(null), 1200);
    return () => clearTimeout(timer);
  }, [lastResult]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    return () => subscription.remove();
  }, [onExit]);

  function updateCard(card: ReviewCard, quality: ReviewQuality) {
    if (scoring) return;
    const result = quality === 'good' ? '熟悉，已拉长复习间隔' : quality === 'hard' ? '模糊，明天再复习' : '不会，今天稍后再来';
    setScoring(true);
    setScoringQuality(quality);
    stopReviewSpeech().catch(() => undefined);
    Animated.timing(cardMotion, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const next = scheduleReviewedCard(card, quality);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setData({ ...data, cards: data.cards.map((item) => item.id === card.id ? next : item) });
      if (focusMaterialId) {
        setSessionReviewedIds((currentIds) => currentIds.includes(card.id) ? currentIds : [...currentIds, card.id]);
      }
      setShowAnswer(false);
      flipMotion.setValue(0);
      setLastResult({
        message: result,
        quality,
        reviewed: focusMaterialId ? sessionReviewedIds.length + 1 : Math.max(0, total - reviewCards.length + 1),
        remaining: Math.max(0, reviewCards.length - 1),
        nextPrompt: reviewCards[1] ? modePrompt(reviewCards[1], mode).replace(/\n/g, ' ') : undefined,
      });
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
      setTimeout(() => {
        setScoring(false);
        setScoringQuality(null);
      }, 360);
    });
  }

  async function speakCurrent(includeAnswer = false) {
    if (!current) return;
    if (!speechReady) {
      showToast('本机朗读暂不可用');
      return;
    }
    try {
      const question = modePrompt(current, mode);
      const answer = answerSections(current);
      await speakReviewText(buildSpeechText(question, includeAnswer ? `${answer.reference}\n${answer.points}\n${answer.warning}` : undefined));
    } catch (error: any) {
      setSpeechReady(false);
      showToast(error?.message ?? '本机朗读暂不可用');
    }
  }

  function revealAnswer() {
    setShowAnswer(true);
    requestAnimationFrame(() => {
      setTimeout(() => scrollRef.current?.scrollTo({ y: 150, animated: true }), 120);
    });
  }

  function hideAnswer() {
    setShowAnswer(false);
  }

  function jumpToReport() {
    scrollRef.current?.scrollTo({ y: 760, animated: true });
  }

  const cardTranslate = cardMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const cardScale = cardMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });
  const faceScale = flipMotion.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [1, 0.985, 1],
  });
  const frontRotate = flipMotion.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flipMotion.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const frontOpacity = flipMotion.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipMotion.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  const progressPercent = focusMaterialId
    ? Math.max(6, Math.round((sessionReviewedIds.length / Math.max(total, 1)) * 100))
    : Math.max(6, Math.round(((total - reviewCards.length) / Math.max(total, 1)) * 100));
  return (
    <View style={[styles.app, styles.reviewApp]}>
    <ScrollView ref={scrollRef} style={styles.reviewScroll} contentContainerStyle={[styles.reviewContainer, current && showAnswer ? styles.reviewContainerWithDock : null]}>
      <View style={styles.reviewTopBar}>
        <Pressable onPress={onExit} style={styles.reviewNavButton}><BackGlyph /></Pressable>
        <View style={styles.reviewTopTitle}>
          <Text style={styles.title}>复盘卡片</Text>
          <Text style={styles.sub}>{current ? `${currentIndex}/${Math.max(total, 1)}` : '已清空'}</Text>
        </View>
        <Pressable onPress={jumpToReport} style={styles.reviewReportButton}>
          <ReportGlyph />
          <Text style={styles.reviewReportButtonText}>报告</Text>
        </Pressable>
      </View>
      {lastResult ? (
        <View style={[styles.reviewResult, styles[`reviewResult_${lastResult.quality}`]]}>
          <View style={styles.reviewResultHeader}>
            <View style={[styles.reviewResultMark, styles[`reviewResultMark_${lastResult.quality}`]]}>
              <Text style={[styles.reviewResultMarkText, styles[`reviewResultMarkText_${lastResult.quality}`]]}>
                {lastResult.quality === 'again' ? '×' : lastResult.quality === 'hard' ? '-' : '✓'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reviewResultText, styles[`reviewResultText_${lastResult.quality}`]]}>{lastResult.message}</Text>
              <Text style={styles.reviewResultSub}>
                已复盘 {lastResult.reviewed} 张 · {lastResult.remaining > 0 ? `还剩 ${lastResult.remaining} 张` : '本轮已清空'}
              </Text>
            </View>
            <StatusPill label="已安排" tone={lastResult.quality === 'again' ? 'red' : lastResult.quality === 'hard' ? 'orange' : 'teal'} />
          </View>
          <View style={styles.reviewResultProgress}>
            <View
              style={[
                styles.reviewResultProgressFill,
                styles[`reviewResultProgressFill_${lastResult.quality}`],
                {
                  width: `${Math.max(8, Math.round((lastResult.reviewed / Math.max(lastResult.reviewed + lastResult.remaining, 1)) * 100))}%`,
                },
              ]}
            />
          </View>
          {lastResult.nextPrompt ? (
            <View style={styles.reviewResultNextCard}>
              <Text style={styles.reviewResultNextLabel}>下一张</Text>
              <Text style={styles.reviewResultNext} numberOfLines={1}>{lastResult.nextPrompt}</Text>
            </View>
          ) : (
            <View style={styles.reviewResultDoneActions}>
              <Text style={styles.reviewResultNextDone}>本轮已清空，下一步看报告或回资料库继续整理。</Text>
              <View style={styles.reviewResultActionRow}>
                <Pressable onPress={jumpToReport} style={styles.reviewResultActionPrimary}>
                  <Text style={styles.reviewResultActionPrimaryText}>看报告</Text>
                </Pressable>
                <Pressable onPress={onGoMaterials} style={styles.reviewResultActionSecondary}>
                  <Text style={styles.reviewResultActionSecondaryText}>回资料库</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}

      {current ? (
        <View style={styles.reviewStageRail}>
          <View style={styles.reviewStageRailHeader}>
            <View style={styles.reviewStageIdentity}>
              <ReviewBookGlyph />
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewStageSubject} numberOfLines={1}>{focusMaterial?.title ?? `${current.subject}复盘`}</Text>
                <Text style={styles.reviewStageMeta}>{current.subject} · 还剩 {reviewCards.length} 张</Text>
              </View>
            </View>
            <Text style={styles.reviewStageCount}>{currentIndex}/{Math.max(total, 1)}</Text>
          </View>
          <View style={styles.reviewProgressTrack}>
            <View style={[styles.reviewProgressFill, { width: `${progressPercent}%`, backgroundColor: subjectAccent(current.subject) }]} />
          </View>
          {focusMaterial ? (
            <View style={styles.reviewFocusBanner}>
              <Text style={styles.reviewFocusTitle} numberOfLines={1}>资料专练：{focusMaterial.title}</Text>
              <Text style={styles.reviewFocusMeta}>{focusDueCount > 0 ? `${focusDueCount} 张到期卡优先，其余卡片可提前巩固` : '暂无到期卡，按创建顺序提前巩固'}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {!current ? (
        <View style={styles.reviewCompletePanel}>
          <View style={styles.reviewCompleteQuickExit}>
            <Pressable onPress={onExit} style={styles.reviewCompleteQuickButton}>
              <Text style={styles.reviewCompleteQuickButtonText}>回今日</Text>
            </Pressable>
            <Pressable onPress={onGoMaterials} style={[styles.reviewCompleteQuickButton, styles.reviewCompleteQuickButtonPrimary]}>
              <Text style={styles.reviewCompleteQuickButtonTextPrimary}>资料库</Text>
            </Pressable>
          </View>
          <Image source={reviewHeroImage} style={styles.reviewCompleteImage} resizeMode="cover" />
          <StatusPill label="本轮完成" tone="teal" />
          <Text style={styles.title}>{focusMaterial ? '这份资料练完了' : '今天到期卡已清空'}</Text>
          <Text style={styles.sub}>
            {focusMaterial ? '这份资料本轮卡片已完成。建议看一下督背报告，再回资料库继续整理。' : '当前没有到期卡。可以看报告，或去资料库继续整理内容。'}
          </Text>
          <View style={styles.reviewCompleteFlow}>
            <View style={styles.reviewCompleteFlowStepDone}>
              <Text style={styles.reviewCompleteFlowTextDone}>资料</Text>
            </View>
            <View style={styles.reviewCompleteFlowLine} />
            <View style={styles.reviewCompleteFlowStepDone}>
              <Text style={styles.reviewCompleteFlowTextDone}>复盘</Text>
            </View>
            <View style={styles.reviewCompleteFlowLine} />
            <View style={styles.reviewCompleteFlowStepNow}>
              <Text style={styles.reviewCompleteFlowTextNow}>报告</Text>
            </View>
          </View>
          <View style={styles.reviewCompleteStats}>
            <MetricTile label="全部卡" value={`${usableCards.length}`} tone="blue" />
            <MetricTile label="薄弱卡" value={`${report.weakCards.length}`} tone={report.weakCards.length ? 'orange' : 'teal'} />
            <MetricTile label="薄弱率" value={`${report.weakRate}%`} tone="gray" />
          </View>
          <View style={styles.actionGrid}>
            <AppButton title="看报告" onPress={jumpToReport} style={{ flex: 1 }} />
            <AppButton title="回资料库" variant="secondary" onPress={onGoMaterials} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Animated.View style={[styles.reviewCard, { opacity: cardMotion, transform: [{ translateY: cardTranslate }, { scale: cardScale }] }]}>
          {scoringQuality ? (
            <View pointerEvents="none" style={[styles.reviewTransitionOverlay, styles[`reviewTransitionOverlay_${scoringQuality}`]]}>
              <View style={[styles.reviewTransitionMark, styles[`reviewResultMark_${scoringQuality}`]]}>
                <Text style={[styles.reviewResultMarkText, styles[`reviewResultMarkText_${scoringQuality}`]]}>
                  {scoringQuality === 'again' ? '×' : scoringQuality === 'hard' ? '-' : '✓'}
                </Text>
              </View>
              <Text style={[styles.reviewTransitionTitle, styles[`reviewResultText_${scoringQuality}`]]}>
                {scoringQuality === 'again' ? '已安排稍后再背' : scoringQuality === 'hard' ? '已安排明天巩固' : '已拉长复习间隔'}
              </Text>
              <Text style={styles.reviewTransitionSub}>正在切到下一张</Text>
            </View>
          ) : null}
          <View style={styles.reviewSegment}>
            <Pressable onPress={() => setMode('cloze')} style={[styles.segmentItem, mode === 'cloze' ? styles.segmentItemActive : null]}>
              <Text style={[styles.segmentText, mode === 'cloze' ? styles.segmentTextActive : null]}>挖空</Text>
            </Pressable>
            <Pressable onPress={() => setMode('qa')} style={[styles.segmentItem, mode === 'qa' ? styles.segmentItemActive : null]}>
              <Text style={[styles.segmentText, mode === 'qa' ? styles.segmentTextActive : null]}>问答</Text>
            </Pressable>
          </View>
          <Animated.View style={[styles.reviewFlipArea, showAnswer ? styles.reviewFlipAreaAnswer : null, { transform: [{ scale: faceScale }] }]}>
            <View pointerEvents="none" style={[styles.reviewDeckLayer, styles.reviewDeckLayerBack]} />
            <View pointerEvents="none" style={[styles.reviewDeckLayer, styles.reviewDeckLayerMid]} />
            <Animated.View pointerEvents={showAnswer ? 'none' : 'auto'} style={[styles.reviewFlipFace, { opacity: frontOpacity, transform: [{ perspective: 900 }, { rotateY: frontRotate }] }]}>
              <Pressable onPress={revealAnswer} style={[styles.reviewFace, { borderTopColor: subjectAccent(current.subject) }]}>
                <View pointerEvents="none" style={styles.reviewPaperBgWrap}>
                <ImageBackground source={reviewPaperTexture} style={styles.reviewPaperBg} imageStyle={styles.reviewPaperBgImage} resizeMode="cover">
                <Text style={[styles.reviewCardWatermark, { color: subjectAccent(current.subject) }]}>{mode === 'cloze' ? 'CLOZE' : 'QA'}</Text>
                <View style={styles.rowBetween}>
                  <StatusPill label={current.subject} tone={subjectTone(current.subject)} />
                  <Text style={styles.reviewStar}>☆</Text>
                </View>
                <Text style={styles.reviewPrompt} numberOfLines={7}>{modePrompt(current, mode)}</Text>
                {current.keywords?.length ? (
                  <View style={styles.wrap}>
                    {current.keywords.map((keyword) => <View key={keyword} style={styles.chip}><Text style={styles.chipText}>{keyword}</Text></View>)}
                  </View>
                ) : null}
                <Text style={styles.reviewTapHint}>点按卡片翻开答案</Text>
                </ImageBackground>
                </View>
              </Pressable>
            </Animated.View>
            <Animated.View pointerEvents={showAnswer ? 'auto' : 'none'} style={[styles.reviewFlipFace, styles.reviewFlipBack, { opacity: backOpacity, transform: [{ perspective: 900 }, { rotateY: backRotate }] }]}>
              <View style={[styles.reviewFace, styles.reviewFaceRevealed, { borderTopColor: subjectAccent(current.subject) }]}>
                <View style={styles.reviewPaperBgWrap}>
                <ImageBackground source={reviewPaperTexture} style={styles.reviewPaperBg} imageStyle={styles.reviewPaperBgImage} resizeMode="cover">
                <Text style={[styles.reviewCardWatermark, { color: subjectAccent(current.subject) }]}>复盘</Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.reviewAnswerTitle}>参考答案</Text>
                  <StatusPill label={current.subject} tone={subjectTone(current.subject)} />
                </View>
                <View style={styles.answerPanel}>
                  <View style={styles.answerPanelHeader}>
                    <Text style={styles.commandEyebrow}>答案要点</Text>
                    <Text style={styles.tiny}>先自评，再安排下次复习</Text>
                  </View>
                  <View style={styles.answerFlow}>
                    <View style={styles.answerFlowStepActive}><Text style={styles.answerFlowTextActive}>核对</Text></View>
                    <View style={styles.answerFlowLine} />
                    <View style={styles.answerFlowStepActive}><Text style={styles.answerFlowTextActive}>自评</Text></View>
                    <View style={styles.answerFlowLine} />
                    <View style={styles.answerFlowStepIdle}><Text style={styles.answerFlowTextIdle}>下一张</Text></View>
                  </View>
                  {currentAnswer ? (
                    <View style={styles.reviewAnswerSections}>
                      <View style={styles.reviewAnswerSection}>
                        <Text style={styles.reviewAnswerSectionTitle}>参考答案</Text>
                        <Text style={styles.reviewAnswerText} numberOfLines={4}>{currentAnswer.reference}</Text>
                      </View>
                      <View style={styles.reviewAnswerSectionSoft}>
                        <Text style={styles.reviewAnswerSectionTitle}>答题要点</Text>
                        <Text style={styles.reviewAnswerText} numberOfLines={3}>{currentAnswer.points}</Text>
                      </View>
                      <View style={styles.reviewAnswerSectionWarn}>
                        <Text style={styles.reviewAnswerSectionTitle}>易错提醒</Text>
                        <Text style={styles.reviewAnswerText} numberOfLines={3}>{currentAnswer.warning}</Text>
                      </View>
                    </View>
                  ) : null}
                  {current.keywords?.length ? (
                    <View style={styles.reviewSelfCheck}>
                      <Text style={styles.tiny}>自检要点</Text>
                      <View style={[styles.wrap, { marginTop: 8 }]}>
                        {current.keywords.slice(0, 4).map((keyword) => (
                          <View key={keyword} style={styles.reviewCheckChip}>
                            <Text style={styles.reviewCheckChipText}>{keyword}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  <Text style={[styles.tiny, { marginTop: 10 }]}>已复习 {current.repetitions} 次 · 遗忘 {current.lapses} 次 · 当前间隔 {current.intervalDays} 天</Text>
                  <View style={styles.reviewUtilityRow}>
                    <AppButton title={speechReady ? '朗读答案' : '朗读不可用'} variant="secondary" onPress={() => speakCurrent(true)} style={{ flex: 1 }} disabled={!speechReady} />
                    <AppButton title="收起答案" variant="secondary" onPress={hideAnswer} style={{ flex: 1 }} />
                  </View>
                  <View style={styles.answerQuickScore}>
                    <View style={styles.rowBetween}>
                      <View>
                        <Text style={styles.commandEyebrow}>熟悉度</Text>
                        <Text style={styles.tiny}>选择后自动进入下一张</Text>
                      </View>
                      <StatusPill label={scoring ? '安排中' : '三档评分'} tone="blue" />
                    </View>
                    <View style={styles.answerQuickScoreRow}>
                      <ReviewScoreButton label="不会" detail="今天稍后" quality="again" disabled={scoring} onPress={() => updateCard(current, 'again')} />
                      <ReviewScoreButton label="模糊" detail="明天再来" quality="hard" disabled={scoring} onPress={() => updateCard(current, 'hard')} />
                      <ReviewScoreButton label="熟悉" detail="拉长间隔" quality="good" disabled={scoring} onPress={() => updateCard(current, 'good')} />
                    </View>
                  </View>
                </View>
                </ImageBackground>
                </View>
              </View>
            </Animated.View>
          </Animated.View>
          {!showAnswer ? (
            <View style={styles.reviewUtilityRow}>
              <AppButton title={speechReady ? '朗读题面' : '朗读不可用'} variant="secondary" onPress={() => speakCurrent(false)} style={{ flex: 1 }} disabled={!speechReady} />
            </View>
          ) : null}
          {!showAnswer ? (
            <AppButton title="翻开答案" onPress={revealAnswer} style={{ marginTop: 18 }} />
          ) : (
            <>
              <View style={styles.reviewInlineReport}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.commandEyebrow}>督背报告</Text>
                    <Text style={styles.h3}>本轮表现会影响下一张安排</Text>
                  </View>
                  <Text style={styles.reviewInlineReportToggle}>⌃</Text>
                </View>
                <View style={styles.reviewInlineReportStats}>
                  <View style={styles.reviewInlineReportStat}>
                    <Text style={styles.reviewInlineReportValue}>{sessionReviewedIds.length}</Text>
                    <Text style={styles.reviewInlineReportLabel}>今日复盘</Text>
                    <Text style={styles.reviewInlineReportDelta}>本轮已完成</Text>
                  </View>
                  <View style={styles.reviewInlineReportStat}>
                    <Text style={styles.reviewInlineReportValue}>{Math.max(0, 100 - report.weakRate)}%</Text>
                    <Text style={styles.reviewInlineReportLabel}>稳定度</Text>
                    <Text style={styles.reviewInlineReportDelta}>薄弱率 {report.weakRate}%</Text>
                  </View>
                  <View style={styles.reviewInlineReportStat}>
                    <Text style={styles.reviewInlineReportValue}>{report.due.length}</Text>
                    <Text style={styles.reviewInlineReportLabel}>待优先</Text>
                    <Text style={styles.reviewInlineReportDelta}>下一轮</Text>
                  </View>
                  <View style={styles.reviewInlineReportTrend}>
                    {reportTrend.slice(-4).map((height, index) => (
                      <View key={`${height}-${index}`} style={[styles.reviewInlineReportBar, { height: Math.max(12, Math.round(height * 0.42)) }]} />
                    ))}
                  </View>
                </View>
              </View>
            </>
          )}
        </Animated.View>
      )}

      <View style={styles.reviewSummary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.commandEyebrow}>今日复盘</Text>
          <Text style={styles.sub}>到期 {globalDueCards.length} 张 · 全部 {usableCards.length} 张 · 薄弱率 {report.weakRate}%</Text>
        </View>
        <Image source={reviewHeroImage} style={styles.reviewSummaryImage} resizeMode="cover" />
      </View>

      <View style={styles.coachReportPanel}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commandEyebrow}>督背报告</Text>
            <Text style={styles.h2}>下一轮怎么背</Text>
            <Text style={styles.sub}>{report.suggestion}</Text>
          </View>
          <View style={styles.coachReportBadge}>
            <Text style={styles.coachReportBadgeValue}>{report.weakRate}%</Text>
            <Text style={styles.coachReportBadgeLabel}>薄弱率</Text>
          </View>
        </View>
        <View style={styles.reviewReportStatsRow}>
          <View style={styles.reviewReportStat}>
            <Text style={styles.reviewReportStatLabel}>本轮复盘</Text>
            <Text style={styles.reviewReportStatValue}>{sessionReviewedIds.length} 张</Text>
          </View>
          <View style={styles.reviewReportStatDivider} />
          <View style={styles.reviewReportStat}>
            <Text style={styles.reviewReportStatLabel}>稳定卡</Text>
            <Text style={styles.reviewReportStatValue}>{report.mastered.length} 张</Text>
          </View>
          <View style={styles.reviewReportStatDivider} />
          <View style={styles.reviewReportStat}>
            <Text style={styles.reviewReportStatLabel}>建议优先</Text>
            <Text style={styles.reviewReportStatValue}>{report.due.length} 张</Text>
          </View>
        </View>
        <View style={styles.metricGrid}>
          <MetricTile label="薄弱卡" value={`${report.weakCards.length}`} tone={report.weakCards.length > 0 ? 'orange' : 'teal'} />
          <MetricTile label="稳定卡" value={`${report.mastered.length}`} tone="blue" />
          <MetricTile label="薄弱科目" value={report.weakSubject} tone="gray" />
        </View>
        <View style={styles.reportTrendCard}>
          <View>
            <Text style={styles.h3}>熟悉度趋势</Text>
            <Text style={styles.sub}>根据本地复盘记录估算</Text>
          </View>
          <View style={styles.reportTrendBars}>
            {reportTrend.map((height, index) => (
              <View key={`${height}-${index}`} style={styles.reportTrendBarSlot}>
                <View style={[styles.reportTrendBar, { height }]} />
                <Text style={styles.tiny}>{index === reportTrend.length - 1 ? '今' : `${index + 1}`}</Text>
              </View>
            ))}
          </View>
        </View>
        {report.weakCards.slice(0, 3).map((card, index) => (
          <View key={card.id} style={styles.reportItem}>
            <Text style={styles.h3}>薄弱 {index + 1} · {card.subject}</Text>
            <Text style={styles.sub} numberOfLines={2}>{card.cloze || card.prompt}</Text>
            <Text style={styles.tiny}>遗忘 {card.lapses} 次 · 下次 {isoToLocalDateKey(card.dueAt) || '未知'}</Text>
          </View>
        ))}
        {report.weakCards.length === 0 ? <Text style={styles.sub}>暂时没有薄弱卡，保持当前节奏。</Text> : null}
      </View>
    </ScrollView>
      {current && showAnswer ? (
        <View style={styles.reviewStickyScoreDock}>
          <View style={styles.reviewStickyScoreHeader}>
            <Text style={styles.commandEyebrow}>熟悉度</Text>
            <Text style={styles.tiny}>{scoring ? '正在安排下一张' : '选择后自动进入下一张'}</Text>
          </View>
          <View style={styles.answerQuickScoreRow}>
            <ReviewScoreButton label="不会" detail="今天稍后" quality="again" disabled={scoring} onPress={() => updateCard(current, 'again')} />
            <ReviewScoreButton label="模糊" detail="明天再来" quality="hard" disabled={scoring} onPress={() => updateCard(current, 'hard')} />
            <ReviewScoreButton label="熟悉" detail="拉长间隔" quality="good" disabled={scoring} onPress={() => updateCard(current, 'good')} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
