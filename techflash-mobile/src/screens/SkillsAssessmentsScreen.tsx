import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { GhostButton } from '../components/ui/GhostButton';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenStates';
import { colors, radii, typography } from '../theme';
import * as assessmentsApi from '../api/assessmentsApi';
import type { AppStackParamList } from '../navigation/RootNavigator';

type StackNav = NativeStackNavigationProp<AppStackParamList>;

function formatMinutes(assessment: assessmentsApi.CatalogAssessment): string {
  const minutes = assessment.estimated_minutes;
  if (!minutes) return 'No time limit';
  return assessment.time_limit_minutes
    ? `${minutes} min limit`
    : `About ${minutes} min`;
}

function formatRetakeDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function MetaPill({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={13} color={colors.muted} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export default function SkillsAssessmentsScreen() {
  const navigation = useNavigation<StackNav>();
  const [catalog, setCatalog] = useState<assessmentsApi.AssessmentCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [startingSlug, setStartingSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setCatalog(await assessmentsApi.getAssessmentCatalog());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load assessments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onStart = async (assessment: assessmentsApi.CatalogAssessment) => {
    setStartingSlug(assessment.slug);
    setError('');
    try {
      const attempt = await assessmentsApi.startAttempt(assessment.slug);
      if (!attempt) throw new Error('Could not start this assessment');
      navigation.navigate('AssessmentAttempt', { attemptId: attempt.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start this assessment');
      load();
    } finally {
      setStartingSlug(null);
    }
  };

  if (loading && !catalog) return <LoadingState label="Loading assessments..." />;

  const assessments = catalog?.assessments || [];
  const contribution = catalog?.profile_contribution || null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.primaryOrange}
        />
      }
    >
      <Text style={styles.pageTitle}>Skills Assessments</Text>
      <Text style={styles.pageSubtitle}>
        Show employers what you know. These are knowledge assessments, not licenses or
        certifications, and they are completely optional.
      </Text>

      <ErrorState error={error} />

      {contribution && contribution.available_strength_percent > 0 ? (
        <Card style={styles.contributionCard}>
          <Text style={styles.contributionLabel}>{contribution.label}</Text>
          {contribution.state === 'completed' ? (
            <Text style={styles.contributionBody}>
              {`Your ${contribution.assessment_title} score of ${contribution.score} is on your profile.`}
            </Text>
          ) : (
            <Text style={styles.contributionBody}>
              {contribution.recommended_assessment_title
                ? `Completing the ${contribution.recommended_assessment_title} adds ${contribution.available_strength_percent}% to your profile strength.`
                : `Completing an assessment adds ${contribution.available_strength_percent}% to your profile strength.`}
            </Text>
          )}
          <Text style={styles.contributionNote}>
            Skipping this never limits the jobs you can see or apply to.
          </Text>
        </Card>
      ) : null}

      {assessments.length === 0 ? (
        <EmptyState label="No assessments are available yet. Check back soon." />
      ) : null}

      {assessments.map((assessment) => {
        const inProgress = assessment.in_progress_attempt;
        const result = assessment.result;
        const retakeAt = formatRetakeDate(assessment.retake_available_at);
        const busy = startingSlug === assessment.slug;

        return (
          <Card key={assessment.slug} style={styles.assessmentCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{assessment.title}</Text>
              {assessment.recommended ? (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>For your trade</Text>
                </View>
              ) : null}
            </View>

            {assessment.description ? (
              <Text style={styles.cardDescription}>{assessment.description}</Text>
            ) : null}

            <View style={styles.pillRow}>
              <MetaPill icon="help-circle-outline" label={`${assessment.question_count} questions`} />
              <MetaPill icon="time-outline" label={formatMinutes(assessment)} />
              {assessment.max_attempts ? (
                <MetaPill
                  icon="repeat-outline"
                  label={`${assessment.attempts_used}/${assessment.max_attempts} attempts`}
                />
              ) : null}
            </View>

            {assessment.topics.length > 0 ? (
              <Text style={styles.topics}>
                {`Covers: ${assessment.topics.map((topic) => topic.name).join(', ')}`}
              </Text>
            ) : null}

            {result ? (
              <Pressable
                style={styles.resultRow}
                onPress={() =>
                  navigation.navigate('AssessmentHistory', { assessmentSlug: assessment.slug })
                }
              >
                <View>
                  <Text style={styles.resultScore}>{`Your score: ${result.score}`}</Text>
                  {result.score_band_label ? (
                    <Text style={styles.resultBand}>{result.score_band_label}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ) : null}

            {inProgress ? (
              <View style={styles.progressWrap}>
                <Text style={styles.progressLabel}>
                  {`In progress — ${inProgress.answered_questions} of ${inProgress.total_questions} answered`}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${inProgress.progress_percent}%` }]}
                  />
                </View>
              </View>
            ) : null}

            {inProgress ? (
              <PrimaryButton
                label="Resume assessment"
                loading={busy}
                onPress={() =>
                  navigation.navigate('AssessmentAttempt', { attemptId: inProgress.id })
                }
              />
            ) : assessment.can_start ? (
              <PrimaryButton
                label={result ? 'Retake assessment' : 'Take Assessment'}
                loading={busy}
                onPress={() => onStart(assessment)}
              />
            ) : (
              <View style={styles.blockedWrap}>
                <Text style={styles.blockedText}>
                  {assessment.start_blocked_message || 'This assessment is not available right now.'}
                </Text>
                {retakeAt ? (
                  <Text style={styles.blockedText}>{`Next attempt opens ${retakeAt}.`}</Text>
                ) : null}
              </View>
            )}

            {assessment.attempts_count > 0 ? (
              <GhostButton
                label={`View my ${assessment.attempts_count} attempt${
                  assessment.attempts_count === 1 ? '' : 's'
                }`}
                onPress={() =>
                  navigation.navigate('AssessmentHistory', { assessmentSlug: assessment.slug })
                }
              />
            ) : null}
          </Card>
        );
      })}

      {catalog?.disclaimer ? (
        <Text style={styles.disclaimer}>{catalog.disclaimer}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { ...typography.title, fontSize: 24, lineHeight: 30 },
  pageSubtitle: { ...typography.body, color: colors.muted, marginTop: 4, marginBottom: 14 },
  contributionCard: { backgroundColor: colors.primaryBlueMuted, borderColor: colors.primaryBlueMuted },
  contributionLabel: { ...typography.caption, color: colors.primaryBlueDark, textTransform: 'uppercase' },
  contributionBody: { ...typography.body, marginTop: 6 },
  contributionNote: { ...typography.body, fontSize: 13, color: colors.muted, marginTop: 6 },
  assessmentCard: { paddingBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { ...typography.heading, flexShrink: 1 },
  recommendedBadge: {
    backgroundColor: colors.primaryBlueMuted,
    borderRadius: radii.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recommendedText: { fontSize: 11, fontWeight: '700', color: colors.primaryBlueDark },
  cardDescription: { ...typography.body, color: colors.muted, marginTop: 6 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bg,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  topics: { ...typography.body, fontSize: 13, color: colors.muted, marginTop: 10 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  resultScore: { ...typography.heading, fontSize: 17 },
  resultBand: { ...typography.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  progressWrap: { marginTop: 14 },
  progressLabel: { ...typography.body, fontSize: 13, color: colors.muted, marginBottom: 6 },
  progressTrack: { height: 8, borderRadius: radii.full, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: radii.full, backgroundColor: colors.primaryOrange },
  blockedWrap: {
    marginTop: 14,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  blockedText: { ...typography.body, fontSize: 13, color: colors.text },
  disclaimer: { ...typography.body, fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 18 },
});
