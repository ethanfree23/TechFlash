import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radii, typography } from '../theme';
import { claimJob, denyJob, extendJob, finishJob, getJobById, reportJobIssue } from '../api/jobsApi';
import { createConversationForJob } from '../api/conversationsApi';
import { MapJobsPreview } from '../components/MapJobsPreview';
import { useAuth } from '../auth/AuthContext';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { Card } from '../components/ui/Card';
import { geocodeAddress } from '../utils/geocode';
import { formatJobAddress } from '../utils/address';

type DetailRoute = RouteProp<AppStackParamList, 'JobDetail'>;
type Nav = NativeStackNavigationProp<AppStackParamList, 'JobDetail'>;

export default function JobDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { jobId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [job, setJob] = useState<Record<string, unknown>>({});
  const [mapMarker, setMapMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [preferredStartAt, setPreferredStartAt] = useState('');
  const [extendEndAt, setExtendEndAt] = useState('');
  const [technicianProfileId, setTechnicianProfileId] = useState('');
  const [reportBody, setReportBody] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await getJobById(jobId);
      const nextJob = (data || {}) as Record<string, unknown>;
      setJob(nextJob);
      let lat = Number(nextJob.latitude);
      let lng = Number(nextJob.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const geo = await geocodeAddress(formatJobAddress(nextJob));
        lat = Number(geo?.latitude);
        lng = Number(geo?.longitude);
      }
      if (Number.isFinite(lat) && Number.isFinite(lng)) setMapMarker({ latitude: lat, longitude: lng });
      else setMapMarker(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onClaim = async () => {
    setSaving(true);
    setError('');
    try {
      await claimJob(jobId, preferredStartAt || undefined);
      setNotice('Job claimed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not claim job');
    } finally {
      setSaving(false);
    }
  };

  const onFinish = async () => {
    setSaving(true);
    setError('');
    try {
      await finishJob(jobId);
      setNotice('Job finished.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish job');
    } finally {
      setSaving(false);
    }
  };

  const onDeny = async () => {
    setSaving(true);
    setError('');
    try {
      await denyJob(jobId);
      setNotice('Claim denied.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not deny claim');
    } finally {
      setSaving(false);
    }
  };

  const onExtend = async () => {
    if (!extendEndAt.trim()) {
      setError('Enter new scheduled end datetime (ISO).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await extendJob(jobId, extendEndAt.trim());
      setNotice('Job extended.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not extend job');
    } finally {
      setSaving(false);
    }
  };

  const onStartConversation = async () => {
    setSaving(true);
    setError('');
    try {
      const conversation = await createConversationForJob(
        jobId,
        technicianProfileId.trim() ? Number(technicianProfileId) : undefined
      );
      const id = Number((conversation as Record<string, unknown>)?.id);
      if (!id) throw new Error('Conversation creation failed');
      navigation.navigate('Conversation', { conversationId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start conversation');
    } finally {
      setSaving(false);
    }
  };

  const onReportJob = async () => {
    if (!reportBody.trim()) {
      setError('Enter report details first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await reportJobIssue(jobId, reportBody.trim(), 'safety');
      setReportBody('');
      setNotice('Report submitted. Our team will review it.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not report job');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primaryOrange} /></View>;
  }

  const isTech = user?.role === 'technician';
  const isCompanyOrAdmin = user?.role === 'company' || user?.role === 'admin';

  const jobMapMarkers =
    mapMarker
      ? [
          {
            id: 'job',
            latitude: mapMarker.latitude,
            longitude: mapMarker.longitude,
            title: String(job.title || `Job #${job.id}`),
            description: formatJobAddress(job),
          },
        ]
      : [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {jobMapMarkers.length > 0 ? (
        <MapJobsPreview markers={jobMapMarkers} height={200} />
      ) : null}
      <Card style={styles.mainCard}>
        <Text style={styles.title}>{String(job.title || `Job #${job.id}`)}</Text>
        <View style={styles.timelineBox}>
          <Text style={styles.section}>Job and payment timeline</Text>
          <Text style={styles.sub}>Posted: {job.created_at ? new Date(String(job.created_at)).toLocaleString() : '—'}</Text>
          {job.go_live_at ? (
            <Text style={styles.sub}>Go live: {new Date(String(job.go_live_at)).toLocaleString()}</Text>
          ) : null}
        </View>
        <View style={styles.paymentBox}>
          <Text style={styles.sub}>
            Payment status:{' '}
            {String((job.payment_summary as Record<string, unknown> | undefined)?.state || 'No card charge on file for this job.')}
          </Text>
        </View>
        <View style={[styles.metaRow, styles.metaRowTop]}>
          <Text style={styles.metaLabel}>Status</Text>
          <Text style={styles.metaValue}>{String(job.status || 'unknown')}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Location</Text>
          <Text style={styles.metaValue}>{formatJobAddress(job)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Company</Text>
          <Text style={styles.metaValue}>{String((job.company_profile as Record<string, unknown> | undefined)?.company_name || '—')}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Industry</Text>
          <Text style={styles.metaValue}>{String((job.company_profile as Record<string, unknown> | undefined)?.industry || 'N/A')}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Start</Text>
          <Text style={styles.metaValue}>
            {job.scheduled_start_at ? new Date(String(job.scheduled_start_at)).toLocaleString() : 'Not scheduled'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Finish</Text>
          <Text style={styles.metaValue}>
            {job.scheduled_end_at ? new Date(String(job.scheduled_end_at)).toLocaleString() : 'Not scheduled'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Start mode</Text>
          <Text style={styles.metaValue}>{String(job.start_mode || 'hard_start')}</Text>
        </View>
        <Text style={[styles.section, { marginTop: 12 }]}>Job Description</Text>
        <Text style={styles.sub}>{String(job.description || '')}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Class</Text>
          <Text style={styles.metaValue}>{String(job.skill_class || 'N/A')}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Experience</Text>
          <Text style={styles.metaValue}>{String(job.minimum_years_experience ?? 'Any')}</Text>
        </View>
        {job.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.section}>Notes and conditions</Text>
            <Text style={styles.sub}>{String(job.notes)}</Text>
          </View>
        ) : null}
        <TextInput
          value={technicianProfileId}
          onChangeText={setTechnicianProfileId}
          placeholder="Technician profile id (optional for company/admin)"
          placeholderTextColor={colors.muted}
          style={[styles.input, { marginTop: 10 }]}
          autoCapitalize="none"
        />
        <Pressable style={styles.btnGhost} onPress={onStartConversation} disabled={saving}>
          <Text style={styles.btnGhostText}>Open conversation</Text>
        </Pressable>
        <TextInput
          value={reportBody}
          onChangeText={setReportBody}
          placeholder="Report unsafe or abusive job content"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />
        <Pressable style={styles.btnGhost} onPress={onReportJob} disabled={saving}>
          <Text style={styles.btnGhostText}>Report this job</Text>
        </Pressable>
      </Card>

      {isTech ? (
        <Card style={styles.actionCard}>
          <Text style={styles.section}>Technician actions</Text>
          <TextInput
            value={preferredStartAt}
            onChangeText={setPreferredStartAt}
            placeholder="Preferred start (optional ISO datetime)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Pressable style={styles.btn} onPress={onClaim} disabled={saving}>
            <Text style={styles.btnText}>{saving ? 'Working...' : 'Claim job'}</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={onFinish} disabled={saving}>
            <Text style={styles.btnGhostText}>Finish job</Text>
          </Pressable>
        </Card>
      ) : null}

      {isCompanyOrAdmin ? (
        <Card style={styles.actionCard}>
          <Text style={styles.section}>Company/admin actions</Text>
          <Pressable style={styles.btnGhost} onPress={() => navigation.navigate('EditJob', { jobId })}>
            <Text style={styles.btnGhostText}>Edit job</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={onFinish} disabled={saving}>
            <Text style={styles.btnGhostText}>Finish job</Text>
          </Pressable>
          <Pressable style={styles.btnGhost} onPress={onDeny} disabled={saving}>
            <Text style={styles.btnGhostText}>Deny claim</Text>
          </Pressable>
          <TextInput
            value={extendEndAt}
            onChangeText={setExtendEndAt}
            placeholder="New end datetime (ISO)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Pressable style={styles.btn} onPress={onExtend} disabled={saving}>
            <Text style={styles.btnText}>{saving ? 'Working...' : 'Extend job'}</Text>
          </Pressable>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  title: { ...typography.title },
  section: { ...typography.heading, color: colors.text, marginBottom: 8 },
  sub: { ...typography.body, color: colors.muted, marginTop: 5 },
  mainCard: { marginTop: 10 },
  actionCard: { marginTop: 10 },
  metaRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metaRowTop: { marginTop: 4 },
  metaLabel: { ...typography.caption, color: colors.muted, textTransform: 'uppercase' },
  metaValue: { color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right', lineHeight: 20 },
  timelineBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 12, marginTop: 10, marginBottom: 10, backgroundColor: colors.white },
  paymentBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 12, marginBottom: 10, backgroundColor: colors.bg },
  notesBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 12, marginTop: 12, backgroundColor: colors.white },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: colors.primaryOrange,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  btnText: { ...typography.body, color: colors.white, fontWeight: '700' },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnGhostText: { ...typography.body, color: colors.text, fontWeight: '600' },
  error: { ...typography.body, color: colors.danger, marginBottom: 8 },
  notice: { ...typography.body, color: colors.primaryBlue, marginBottom: 8 },
});
