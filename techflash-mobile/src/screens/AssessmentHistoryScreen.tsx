import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenStates';
import { colors, radii, typography } from '../theme';
import * as assessmentsApi from '../api/assessmentsApi';
import type { AppStackParamList } from '../navigation/RootNavigator';

type StackNav = NativeStackNavigationProp<AppStackParamList>;
type ScreenRoute = RouteProp<AppStackParamList, 'AssessmentHistory'>;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The technician's own full attempt history. Companies only ever see the single
 * designated result, so this screen is deliberately technician-only.
 */
export default function AssessmentHistoryScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<ScreenRoute>();
  const assessmentSlug = route.params?.assessmentSlug;

  const [attempts, setAttempts] = useState<assessmentsApi.AttemptResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await assessmentsApi.getAttemptHistory(assessmentSlug);
      setAttempts(data.attempts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your attempts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assessmentSlug]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading && attempts.length === 0) return <LoadingState label="Loading your attempts..." />;

  const bestScore = attempts.reduce<number | null>((best, attempt) => {
    if (attempt.score == null) return best;
    return best == null || attempt.score > best ? attempt.score : best;
  }, null);

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
      <Text style={styles.pageTitle}>My attempts</Text>
      <Text style={styles.pageSubtitle}>
        You see every attempt here. Employers only see your best result.
      </Text>

      <ErrorState error={error} />

      {attempts.length === 0 ? (
        <EmptyState label="You have not taken an assessment yet." />
      ) : null}

      {attempts.map((attempt) => {
        const isBest = bestScore != null && attempt.score === bestScore;
        const finished = attempt.status !== 'in_progress';

        return (
          <Pressable
            key={attempt.id}
            onPress={() =>
              finished
                ? navigation.navigate('AssessmentResult', { attemptId: attempt.id })
                : navigation.navigate('AssessmentAttempt', { attemptId: attempt.id })
            }
          >
            <Card style={styles.attemptCard}>
              <View style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.attemptTitle}>
                    {`Attempt ${attempt.attempt_number} · ${attempt.assessment_title}`}
                  </Text>
                  <Text style={styles.attemptMeta}>
                    {[
                      formatDate(attempt.completed_at || attempt.started_at),
                      `v${attempt.version_number}`,
                      attempt.status === 'expired' ? 'Ran out of time' : null,
                      attempt.status === 'in_progress' ? 'In progress' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {attempt.score_band_label ? (
                    <Text style={styles.attemptBand}>{attempt.score_band_label}</Text>
                  ) : null}
                </View>
                <View style={styles.rowEnd}>
                  <Text style={styles.attemptScore}>
                    {attempt.score == null ? '—' : attempt.score}
                  </Text>
                  {isBest ? (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestText}>Shown to employers</Text>
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  pageTitle: { ...typography.title, fontSize: 22, lineHeight: 28 },
  pageSubtitle: { ...typography.body, color: colors.muted, marginTop: 4, marginBottom: 14 },
  attemptCard: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMain: { flex: 1 },
  rowEnd: { alignItems: 'flex-end' },
  attemptTitle: { ...typography.body, fontWeight: '600' },
  attemptMeta: { ...typography.body, fontSize: 12, color: colors.muted, marginTop: 4 },
  attemptBand: { ...typography.body, fontSize: 12, color: colors.primaryBlueDark, marginTop: 4 },
  attemptScore: { ...typography.title, fontSize: 24, lineHeight: 28 },
  bestBadge: {
    marginTop: 4,
    backgroundColor: colors.primaryBlueMuted,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bestText: { fontSize: 10, fontWeight: '700', color: colors.primaryBlueDark },
});
