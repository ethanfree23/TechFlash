import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { GhostButton } from '../components/ui/GhostButton';
import { ErrorState, LoadingState } from '../components/ScreenStates';
import { colors, radii, typography } from '../theme';
import * as assessmentsApi from '../api/assessmentsApi';
import type { AppStackParamList } from '../navigation/RootNavigator';

type StackNav = NativeStackNavigationProp<AppStackParamList>;
type ScreenRoute = RouteProp<AppStackParamList, 'AssessmentResult'>;

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  return `${minutes} min`;
}

export default function AssessmentResultScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<ScreenRoute>();
  const { attemptId, notice } = route.params;

  const [result, setResult] = useState<assessmentsApi.AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const load = useCallback(
    async (includeReview: boolean) => {
      setError('');
      try {
        const data = await assessmentsApi.getAttempt(attemptId, { includeReview });
        if (!data) throw new Error('This result could not be found');
        setResult(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load your result');
      } finally {
        setLoading(false);
        setReviewLoading(false);
      }
    },
    [attemptId]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const onToggleReview = async () => {
    if (showReview) {
      setShowReview(false);
      return;
    }
    if (result?.review) {
      setShowReview(true);
      return;
    }
    setReviewLoading(true);
    await load(true);
    setShowReview(true);
  };

  if (loading) return <LoadingState label="Scoring your assessment..." />;

  if (!result) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ErrorState error={error || 'This result could not be loaded.'} />
        <GhostButton
          label="Back to assessments"
          onPress={() => navigation.navigate('SkillsAssessments')}
        />
      </ScrollView>
    );
  }

  const duration = formatDuration(result.duration_seconds);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ErrorState error={error} />

      {notice ? (
        <View style={styles.noticeCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.text} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <Card style={styles.scoreCard}>
        <Text style={styles.assessmentTitle}>{result.assessment_title}</Text>
        <Text style={styles.score}>{result.score ?? 0}</Text>
        <Text style={styles.scoreOutOf}>out of 100</Text>
        {result.score_band_label ? (
          <View style={styles.bandBadge}>
            <Text style={styles.bandText}>{result.score_band_label}</Text>
          </View>
        ) : null}
        <Text style={styles.scoreMeta}>
          {[
            `${result.correct_answers} of ${result.total_questions} correct`,
            duration,
            `Attempt ${result.attempt_number}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {result.passed != null ? (
          <Text style={styles.scoreMeta}>
            {result.passed ? 'Met the benchmark for this assessment' : 'Below the benchmark for this assessment'}
          </Text>
        ) : null}
      </Card>

      {result.category_results.length > 0 ? (
        <Card>
          <Text style={styles.sectionTitle}>By topic</Text>
          {result.category_results.map((category) => (
            <View key={category.slug} style={styles.categoryRow}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryScore}>{`${category.score}`}</Text>
              </View>
              <View style={styles.categoryTrack}>
                <View style={[styles.categoryFill, { width: `${category.score}%` }]} />
              </View>
              <Text style={styles.categoryMeta}>
                {`${category.correct_count} of ${category.questions_count} correct`}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.disclaimerCard}>
        <Text style={styles.disclaimerTitle}>What this score is</Text>
        <Text style={styles.disclaimerText}>{result.disclaimer}</Text>
      </Card>

      <GhostButton
        label={showReview ? 'Hide answer review' : 'Review my answers'}
        onPress={onToggleReview}
        disabled={reviewLoading}
      />

      {showReview && result.review
        ? result.review.map((entry) => {
            const selected = entry.choices.find(
              (choice) => choice.id === entry.selected_answer_choice_id
            );
            const correct = entry.choices.find(
              (choice) => choice.id === entry.correct_answer_choice_id
            );

            return (
              <Card key={entry.question_id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewPosition}>{`Question ${entry.position}`}</Text>
                  <View
                    style={[
                      styles.reviewBadge,
                      entry.correct ? styles.reviewBadgeCorrect : styles.reviewBadgeWrong,
                    ]}
                  >
                    <Text
                      style={[
                        styles.reviewBadgeText,
                        entry.correct ? styles.reviewBadgeTextCorrect : styles.reviewBadgeTextWrong,
                      ]}
                    >
                      {entry.correct ? 'Correct' : entry.answered ? 'Incorrect' : 'Skipped'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reviewPrompt}>{entry.prompt}</Text>
                {entry.answered ? (
                  <Text style={styles.reviewLine}>
                    {`Your answer: ${selected?.body ?? '—'}`}
                  </Text>
                ) : (
                  <Text style={styles.reviewLine}>You did not answer this one.</Text>
                )}
                {!entry.correct && correct ? (
                  <Text style={styles.reviewCorrectLine}>{`Correct answer: ${correct.body}`}</Text>
                ) : null}
                {entry.explanation ? (
                  <Text style={styles.reviewExplanation}>{entry.explanation}</Text>
                ) : null}
              </Card>
            );
          })
        : null}

      <PrimaryButton
        label="Back to assessments"
        onPress={() => navigation.navigate('SkillsAssessments')}
      />
      <GhostButton
        label="See all my attempts"
        onPress={() =>
          navigation.navigate('AssessmentHistory', { assessmentSlug: result.assessment_slug })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: { ...typography.body, flex: 1, fontSize: 14 },
  scoreCard: { alignItems: 'center', paddingVertical: 24 },
  assessmentTitle: { ...typography.body, color: colors.muted, textAlign: 'center' },
  score: { fontSize: 56, fontWeight: '800', color: colors.text, lineHeight: 62, marginTop: 4 },
  scoreOutOf: { ...typography.body, fontSize: 13, color: colors.muted },
  bandBadge: {
    marginTop: 12,
    backgroundColor: colors.primaryBlueMuted,
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  bandText: { fontSize: 14, fontWeight: '700', color: colors.primaryBlueDark },
  scoreMeta: { ...typography.body, fontSize: 13, color: colors.muted, marginTop: 10, textAlign: 'center' },
  sectionTitle: { ...typography.caption, color: colors.muted, textTransform: 'uppercase', marginBottom: 12 },
  categoryRow: { marginBottom: 14 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryName: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  categoryScore: { ...typography.heading, fontSize: 16 },
  categoryTrack: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  categoryFill: { height: 8, borderRadius: radii.full, backgroundColor: colors.primaryBlue },
  categoryMeta: { ...typography.body, fontSize: 12, color: colors.muted, marginTop: 4 },
  disclaimerCard: { backgroundColor: colors.bg },
  disclaimerTitle: { ...typography.caption, color: colors.muted, textTransform: 'uppercase' },
  disclaimerText: { ...typography.body, fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
  reviewCard: { marginTop: 12 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewPosition: { ...typography.caption, color: colors.muted, textTransform: 'uppercase' },
  reviewBadge: { borderRadius: radii.full, paddingHorizontal: 10, paddingVertical: 4 },
  reviewBadgeCorrect: { backgroundColor: 'rgba(5, 150, 105, 0.12)' },
  reviewBadgeWrong: { backgroundColor: colors.dangerBg },
  reviewBadgeText: { fontSize: 11, fontWeight: '700' },
  reviewBadgeTextCorrect: { color: colors.success },
  reviewBadgeTextWrong: { color: colors.danger },
  reviewPrompt: { ...typography.body, fontWeight: '600', marginTop: 8, lineHeight: 21 },
  reviewLine: { ...typography.body, fontSize: 14, color: colors.muted, marginTop: 8 },
  reviewCorrectLine: { ...typography.body, fontSize: 14, color: colors.success, marginTop: 4 },
  reviewExplanation: { ...typography.body, fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 19 },
});
