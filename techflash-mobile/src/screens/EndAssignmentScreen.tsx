import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radii, typography } from '../theme';
import { getTerminationPreview, terminateJob } from '../api/jobsApi';
import { Card } from '../components/ui/Card';
import type { AppStackParamList } from '../navigation/RootNavigator';

type Route = RouteProp<AppStackParamList, 'EndAssignment'>;
type Nav = NativeStackNavigationProp<AppStackParamList, 'EndAssignment'>;

const formatCents = (cents: unknown) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
};

export default function EndAssignmentScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { jobId } = route.params;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [effectiveEnd, setEffectiveEnd] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async (endAt?: string) => {
    setError('');
    try {
      const data = await getTerminationPreview(jobId, endAt);
      const next = ((data as Record<string, unknown>)?.termination_preview || data || {}) as Record<string, unknown>;
      setPreview(next);
      if (!endAt && typeof next.default_effective_end_at === 'string') {
        setEffectiveEnd(next.default_effective_end_at);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load preview');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const timeEntries = (preview.time_entries || {}) as Record<string, unknown>;
  const projected = (preview.projected || {}) as Record<string, unknown>;
  const original = (preview.original || {}) as Record<string, unknown>;
  const reasons = (preview.reasons as Array<{ value: string; label: string }>) || [];
  const submittedCount = Number(timeEntries.submitted_count || 0);
  const gjp = Boolean(preview.guaranteed_job_pay);

  const onConfirm = async () => {
    if (!reason) {
      setError('Select a reason.');
      return;
    }
    if (reason === 'other' && !notes.trim()) {
      setError('Add a note describing why you are ending this assignment.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await terminateJob(jobId, {
        reason,
        notes: notes.trim() || undefined,
        effective_end_at: effectiveEnd || undefined,
      });
      navigation.replace('JobDetail', { jobId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end assignment');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primaryOrange} /></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>End assignment early</Text>
      <Text style={styles.sub}>This ends future work. Approved hours already worked stay payable.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}

      {step === 1 ? (
        <Card style={styles.card}>
          <Text style={styles.section}>When did the work end?</Text>
          <TextInput
            value={effectiveEnd}
            onChangeText={setEffectiveEnd}
            onEndEditing={() => load(effectiveEnd)}
            placeholder="Effective end (ISO datetime)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Text style={styles.caption}>Originally scheduled through {String(original.scheduled_end_at || '—')}</Text>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card style={styles.card}>
          <Text style={styles.section}>Hours worked</Text>
          <Text style={styles.sub}>Approved: {String(timeEntries.approved_hours || 0)} hrs · {formatCents(timeEntries.approved_gross_labor_cents)}</Text>
          <Text style={styles.sub}>Submitted: {String(timeEntries.submitted_count || 0)} entries ({String(timeEntries.submitted_hours || 0)} hrs)</Text>
          <Text style={styles.sub}>Rejected: {String(timeEntries.rejected_hours || 0)} hrs</Text>
          {submittedCount > 0 ? (
            <Text style={styles.error}>Resolve submitted time entries on the job before ending this assignment.</Text>
          ) : null}
        </Card>
      ) : null}

      {step === 3 ? (
        <Card style={styles.card}>
          <Text style={styles.section}>Reason</Text>
          {reasons.map((item) => (
            <Pressable key={item.value} style={[styles.reason, reason === item.value && styles.reasonOn]} onPress={() => setReason(item.value)}>
              <Text style={styles.reasonText}>{item.label}</Text>
            </Pressable>
          ))}
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={reason === 'other' ? 'Required notes' : 'Optional notes'}
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
        </Card>
      ) : null}

      {step === 4 ? (
        <Card style={styles.card}>
          <Text style={styles.section}>Review</Text>
          <Text style={styles.sub}>Approved work: {String(timeEntries.approved_hours || 0)} hrs</Text>
          <Text style={styles.sub}>Canceled future work: {String(preview.canceled_scheduled_hours || 0)} hrs</Text>
          <Text style={styles.sub}>Pay basis: {gjp ? 'Guaranteed Job Pay' : 'Hours Worked Only'}</Text>
          <Text style={styles.sub}>Technician payable: {formatCents(projected.technician_payout_cents)}</Text>
          <Text style={styles.sub}>
            {gjp ? 'No refund — the guarantee still applies.' : `Estimated refund: ${formatCents(projected.refund_cents)}`}
          </Text>
        </Card>
      ) : null}

      <View style={styles.row}>
        <Pressable style={styles.btnGhost} onPress={() => (step === 1 ? navigation.goBack() : setStep(step - 1))} disabled={saving}>
          <Text style={styles.btnGhostText}>{step === 1 ? 'Cancel' : 'Back'}</Text>
        </Pressable>
        {step < 4 ? (
          <Pressable
            style={styles.btn}
            onPress={() => setStep(step + 1)}
            disabled={saving || (step === 2 && submittedCount > 0) || (step === 3 && (!reason || (reason === 'other' && !notes.trim())))}
          >
            <Text style={styles.btnText}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.btn} onPress={onConfirm} disabled={saving}>
            <Text style={styles.btnText}>{saving ? 'Ending…' : 'End assignment'}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  title: { ...typography.title, fontSize: 26, lineHeight: 32 },
  section: { ...typography.heading, color: colors.text, marginBottom: 8 },
  sub: { ...typography.body, color: colors.muted, marginTop: 6 },
  caption: { ...typography.caption, color: colors.muted, marginTop: 6 },
  card: { marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white,
    color: colors.text, paddingHorizontal: 10, paddingVertical: 9, marginTop: 8,
  },
  reason: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 10, marginBottom: 6 },
  reasonOn: { borderColor: colors.primaryOrange, backgroundColor: colors.primaryBlueMuted },
  reasonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, marginTop: 16 },
  btn: { flex: 1, backgroundColor: colors.primaryOrange, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { ...typography.body, color: colors.white, fontWeight: '700' },
  btnGhost: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnGhostText: { ...typography.body, color: colors.text, fontWeight: '600' },
  error: { ...typography.body, color: colors.danger, marginTop: 8 },
});
