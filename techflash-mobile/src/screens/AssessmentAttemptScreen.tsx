import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { GhostButton } from '../components/ui/GhostButton';
import { ErrorState, LoadingState } from '../components/ScreenStates';
import { colors, radii, typography } from '../theme';
import * as assessmentsApi from '../api/assessmentsApi';
import { ApiError } from '../api/client';
import type { AppStackParamList } from '../navigation/RootNavigator';

type StackNav = NativeStackNavigationProp<AppStackParamList>;
type ScreenRoute = RouteProp<AppStackParamList, 'AssessmentAttempt'>;

/**
 * Answers the technician has tapped but that the server has not confirmed yet.
 * Kept per attempt so a crash, a force-quit, or going offline mid-question
 * cannot lose work: on reopening we replay whatever is still here.
 */
const pendingKey = (attemptId: number) => `assessment_pending_answers_${attemptId}`;

const FLUSH_DELAY_MS = 900;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function AssessmentAttemptScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<ScreenRoute>();
  const { attemptId } = route.params;

  const [attempt, setAttempt] = useState<assessmentsApi.AssessmentAttempt | null>(null);
  const [selections, setSelections] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'unsaved'>('idle');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Refs, not state: the flush timer and the AppState listener read these from
  // callbacks that were captured before the latest render.
  const pendingRef = useRef<Record<number, number | null>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);

  const persistPending = useCallback(async () => {
    try {
      const entries = Object.entries(pendingRef.current);
      if (entries.length === 0) {
        await AsyncStorage.removeItem(pendingKey(attemptId));
      } else {
        await AsyncStorage.setItem(pendingKey(attemptId), JSON.stringify(pendingRef.current));
      }
    } catch {
      /* a full disk must not break the sitting */
    }
  }, [attemptId]);

  const goToResult = useCallback(
    (message?: string) => {
      finalizedRef.current = true;
      AsyncStorage.removeItem(pendingKey(attemptId)).catch(() => {});
      navigation.replace('AssessmentResult', { attemptId, notice: message });
    },
    [attemptId, navigation]
  );

  /**
   * Sends everything queued. Answers stay queued until the server confirms, so
   * a failed request (offline, flaky signal) simply retries on the next tap,
   * on backgrounding, or at submit.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    const queued = pendingRef.current;
    const answers = Object.entries(queued).map(([questionId, choiceId]) => ({
      question_id: Number(questionId),
      answer_choice_id: choiceId,
    }));
    if (answers.length === 0) return true;

    setSaveState('saving');
    try {
      const response = await assessmentsApi.saveAnswers(attemptId, answers);
      for (const answer of answers) {
        if (queued[answer.question_id] === answer.answer_choice_id) {
          delete queued[answer.question_id];
        }
      }
      await persistPending();
      setSaveState('idle');
      if (response?.remaining_seconds != null) {
        deadlineRef.current = Date.now() + response.remaining_seconds * 1000;
        setSecondsLeft(response.remaining_seconds);
      }
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.data?.code === 'attempt_expired') {
        goToResult('Your time ran out. We scored the answers you submitted.');
        return false;
      }
      setSaveState('unsaved');
      return false;
    }
  }, [attemptId, persistPending, goToResult]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, FLUSH_DELAY_MS);
  }, [flush]);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await assessmentsApi.getAttempt(attemptId);
      if (!data) throw new Error('This attempt could not be found');

      if (data.status !== 'in_progress') {
        goToResult(
          data.status === 'expired'
            ? 'Your time ran out. We scored the answers you submitted.'
            : undefined
        );
        return;
      }

      // Server answers first, then replay anything saved locally that never
      // made it out, so the technician sees their latest taps either way.
      const serverSelections: Record<number, number> = {};
      for (const question of data.questions) {
        if (question.selected_answer_choice_id != null) {
          serverSelections[question.question_id] = question.selected_answer_choice_id;
        }
      }

      let queued: Record<number, number | null> = {};
      try {
        const stored = await AsyncStorage.getItem(pendingKey(attemptId));
        if (stored) queued = JSON.parse(stored) as Record<number, number | null>;
      } catch {
        queued = {};
      }
      pendingRef.current = queued;

      const merged = { ...serverSelections };
      for (const [questionId, choiceId] of Object.entries(queued)) {
        if (choiceId == null) delete merged[Number(questionId)];
        else merged[Number(questionId)] = choiceId;
      }

      setAttempt(data);
      setSelections(merged);

      if (data.remaining_seconds != null) {
        deadlineRef.current = Date.now() + data.remaining_seconds * 1000;
        setSecondsLeft(data.remaining_seconds);
      } else {
        deadlineRef.current = null;
        setSecondsLeft(null);
      }

      // Land on the first unanswered question so resuming picks up where the
      // technician left off rather than at the top.
      const firstUnanswered = data.questions.findIndex(
        (question) => merged[question.question_id] == null
      );
      setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);

      if (Object.keys(queued).length > 0) {
        setSaveState('unsaved');
        flush();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this attempt');
    } finally {
      setLoading(false);
    }
  }, [attemptId, flush, goToResult]);

  useEffect(() => {
    load();
  }, [load]);

  // Backgrounding the app is the most common interruption, so flush on the way
  // out rather than waiting for the debounce that may never fire.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active' && !finalizedRef.current) {
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        flush();
      }
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [flush]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    []
  );

  const handleSubmit = useCallback(
    async (auto: boolean) => {
      if (submitting || finalizedRef.current) return;
      setSubmitting(true);
      setError('');

      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }

      const answers = Object.entries(pendingRef.current).map(([questionId, choiceId]) => ({
        question_id: Number(questionId),
        answer_choice_id: choiceId,
      }));

      try {
        await assessmentsApi.submitAttempt(attemptId, answers);
        goToResult(auto ? 'Time is up. We scored the answers you submitted.' : undefined);
      } catch (e) {
        if (e instanceof ApiError && e.data?.code === 'attempt_expired') {
          goToResult('Your time ran out. We scored the answers you submitted.');
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not submit this assessment');
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, submitting, goToResult]
  );

  // The clock is authoritative on the server; this only drives the display and
  // the courtesy auto-submit when the technician is still on the screen.
  useEffect(() => {
    if (deadlineRef.current == null) return undefined;

    const tick = () => {
      if (deadlineRef.current == null) return;
      const remaining = Math.round((deadlineRef.current - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= 0 && !finalizedRef.current) {
        handleSubmit(true);
      }
    };

    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [attempt?.id, handleSubmit]);

  const onSelect = (questionId: number, choiceId: number) => {
    setSelections((previous) => ({ ...previous, [questionId]: choiceId }));
    pendingRef.current = { ...pendingRef.current, [questionId]: choiceId };
    setSaveState('unsaved');
    persistPending();
    scheduleFlush();
  };

  const questions = attempt?.questions || [];
  const current = questions[index];
  const answeredCount = useMemo(
    () => questions.filter((question) => selections[question.question_id] != null).length,
    [questions, selections]
  );
  const unansweredCount = questions.length - answeredCount;

  const confirmSubmit = () => {
    if (unansweredCount > 0) {
      Alert.alert(
        'Submit assessment?',
        `${unansweredCount} question${unansweredCount === 1 ? '' : 's'} ${
          unansweredCount === 1 ? 'is' : 'are'
        } unanswered and will be marked incorrect.`,
        [
          { text: 'Keep answering', style: 'cancel' },
          { text: 'Submit', style: 'destructive', onPress: () => handleSubmit(false) },
        ]
      );
      return;
    }
    handleSubmit(false);
  };

  if (loading) return <LoadingState label="Loading your assessment..." />;

  if (!attempt || !current) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ErrorState error={error || 'This assessment could not be loaded.'} />
          <GhostButton label="Back to assessments" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const progressPercent = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;
  const lowOnTime = secondsLeft != null && secondsLeft <= 60;
  const isLast = index === questions.length - 1;

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.statusRow}>
          <Text style={styles.statusCounter}>
            {`Question ${index + 1} of ${questions.length}`}
          </Text>
          {secondsLeft != null ? (
            <View style={[styles.clock, lowOnTime && styles.clockLow]}>
              <Ionicons
                name="time-outline"
                size={14}
                color={lowOnTime ? colors.danger : colors.muted}
              />
              <Text style={[styles.clockText, lowOnTime && styles.clockTextLow]}>
                {formatClock(secondsLeft)}
              </Text>
            </View>
          ) : (
            <Text style={styles.statusMeta}>No time limit</Text>
          )}
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <Text style={styles.statusMeta}>
          {saveState === 'saving'
            ? 'Saving...'
            : saveState === 'unsaved'
            ? 'Saved on this device — will sync automatically'
            : `${answeredCount} of ${questions.length} answered`}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ErrorState error={error} />

        {current.category ? (
          <Text style={styles.categoryLabel}>{current.category.name}</Text>
        ) : null}
        <Text style={styles.prompt}>{current.prompt}</Text>

        {current.choices.map((choice, choiceIndex) => {
          const selected = selections[current.question_id] === choice.id;
          return (
            <Pressable
              key={choice.id}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                pressed && styles.choicePressed,
              ]}
              onPress={() => onSelect(current.question_id, choice.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.choiceMarker, selected && styles.choiceMarkerSelected]}>
                <Text style={[styles.choiceLetter, selected && styles.choiceLetterSelected]}>
                  {String.fromCharCode(65 + choiceIndex)}
                </Text>
              </View>
              <Text style={[styles.choiceBody, selected && styles.choiceBodySelected]}>
                {choice.body}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          {attempt.allow_back_navigation && index > 0 ? (
            <Pressable style={styles.backButton} onPress={() => setIndex(index - 1)}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          <View style={styles.nextWrap}>
            {isLast ? (
              <PrimaryButton
                label="Submit assessment"
                loading={submitting}
                onPress={confirmSubmit}
              />
            ) : (
              <PrimaryButton label="Next question" onPress={() => setIndex(index + 1)} />
            )}
          </View>
        </View>
        {!isLast ? (
          <Pressable onPress={confirmSubmit} disabled={submitting}>
            <Text style={styles.submitEarly}>Submit now</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  statusBar: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusCounter: { ...typography.heading, fontSize: 16 },
  statusMeta: { ...typography.body, fontSize: 12, color: colors.muted },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bg,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clockLow: { backgroundColor: colors.dangerBg },
  clockText: { fontSize: 14, fontWeight: '700', color: colors.muted, fontVariant: ['tabular-nums'] },
  clockTextLow: { color: colors.danger },
  progressTrack: { height: 6, borderRadius: radii.full, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: radii.full, backgroundColor: colors.primaryOrange },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  categoryLabel: {
    ...typography.caption,
    color: colors.primaryBlueDark,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  prompt: { ...typography.heading, fontSize: 19, lineHeight: 26, marginBottom: 16 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    minHeight: 56,
  },
  choiceSelected: { borderColor: colors.primaryOrange, backgroundColor: 'rgba(254, 103, 17, 0.06)' },
  choicePressed: { opacity: 0.9 },
  choiceMarker: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceMarkerSelected: { borderColor: colors.primaryOrange, backgroundColor: colors.primaryOrange },
  choiceLetter: { fontSize: 13, fontWeight: '700', color: colors.muted },
  choiceLetterSelected: { color: colors.white },
  choiceBody: { ...typography.body, flex: 1, lineHeight: 21 },
  choiceBodySelected: { fontWeight: '600' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 18,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 14, paddingRight: 6 },
  backLabel: { ...typography.body, fontWeight: '600' },
  backSpacer: { width: 0 },
  nextWrap: { flex: 1 },
  submitEarly: {
    ...typography.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingTop: 8,
    textDecorationLine: 'underline',
  },
});
