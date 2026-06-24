import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import * as jobsApi from '../api/jobsApi';
import * as adminApi from '../api/adminApi';
import * as settingsApi from '../api/settingsApi';
import { colors, radii, typography } from '../theme';
import { Card } from '../components/ui/Card';
import { MapJobsPreview, type MapMarker } from '../components/MapJobsPreview';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { geocodeAddress } from '../utils/geocode';
import { listConversations, type Conversation } from '../api/conversationsApi';
import * as Location from 'expo-location';
import { formatJobAddress } from '../utils/address';

type StackNav = NativeStackNavigationProp<AppStackParamList>;

function pickJobFields(job: unknown): { title: string; subtitle: string } {
  if (!job || typeof job !== 'object') return { title: 'Job', subtitle: '' };
  const j = job as Record<string, unknown>;
  const title = typeof j.title === 'string' ? j.title : 'Job';
  const status = typeof j.status === 'string' ? j.status : '';
  const id = typeof j.id === 'number' ? j.id : '';
  const subtitle = [status && `Status: ${status}`, id && `#${id}`].filter(Boolean).join(' · ');
  return { title, subtitle };
}

export default function DashboardScreen() {
  const navigation = useNavigation<StackNav>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<{ title: string; data: unknown[] }[]>([]);
  const [openRows, setOpenRows] = useState<Record<string, unknown>[]>([]);
  const [adminMetrics, setAdminMetrics] = useState<Record<string, number>>({});
  const [adminFeedback, setAdminFeedback] = useState<Conversation[]>([]);
  const [adminRecentJobs, setAdminRecentJobs] = useState<Record<string, unknown>[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [deviceCenter, setDeviceCenter] = useState<{ latitude: number; longitude: number } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      if (user.role === 'company') {
        const d = await jobsApi.getCompanyDashboardJobs();
        const req = Array.isArray(d.requested) ? d.requested : [];
        const unreq = Array.isArray(d.unrequested) ? d.unrequested : [];
        const exp = Array.isArray(d.expired) ? d.expired : [];
        setSections([
          { title: 'Claimed / in progress', data: req },
          { title: 'Open', data: unreq },
          { title: 'Completed', data: exp },
        ]);
        setMapMarkers([]);
      } else if (user.role === 'technician') {
        const [d, openJobsRaw, profile] = await Promise.all([
          jobsApi.getTechnicianDashboardJobs(),
          jobsApi.getJobs({ status: 'open', include_past: 'true' }),
          settingsApi.getTechnicianProfile(),
        ]);
        const openJobs = Array.isArray(openJobsRaw)
          ? openJobsRaw.filter((row) => {
              const endAt = row?.scheduled_end_at ? new Date(String(row.scheduled_end_at)).getTime() : null;
              return endAt == null || endAt >= Date.now();
            })
          : [];
        setSections([
          { title: 'In progress', data: d.in_progress || [] },
          { title: 'Completed', data: d.completed || [] },
        ]);
        setOpenRows(openJobs as Record<string, unknown>[]);
        const markers: MapMarker[] = [];
        let gpsCenter: { latitude: number; longitude: number } | null = null;
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({});
            gpsCenter = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          }
        } catch (_) {}
        const plat = Number(profile?.latitude);
        const plng = Number(profile?.longitude);
        if (gpsCenter) {
          markers.push({
            id: 'me',
            latitude: gpsCenter.latitude,
            longitude: gpsCenter.longitude,
            title: 'You',
            description: 'Current device location',
          });
        } else if (Number.isFinite(plat) && Number.isFinite(plng)) {
          markers.push({
            id: 'me',
            latitude: plat,
            longitude: plng,
            title: 'You',
            description: 'Saved profile location',
          });
        }
        setDeviceCenter(gpsCenter);
        const jobs = Array.isArray(openJobs) ? openJobs : [];
        for (const job of jobs) {
          const j = job as Record<string, unknown>;
          let lat = Number(j.latitude);
          let lng = Number(j.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            const geo = await geocodeAddress(String(j.location || j.address || '').trim());
            lat = Number(geo?.latitude);
            lng = Number(geo?.longitude);
          }
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          markers.push({
            id: `job-${j.id}`,
            latitude: lat,
            longitude: lng,
            title: typeof j.title === 'string' ? j.title : `Job #${j.id}`,
            description: formatJobAddress(j),
          });
        }
        setMapMarkers(markers);
      } else {
        const categories = ['total_users', 'companies', 'technicians', 'total_jobs'];
        const [insights, conversations, recentJobsRaw] = await Promise.all([
          Promise.all(categories.map((c) => adminApi.getPlatformInsight(c, '7d'))),
          listConversations().catch(() => []),
          jobsApi.getJobs({ include_past: 'true' }).catch(() => []),
        ]);
        const data = insights.filter(Boolean).map((insight, idx) => ({
          id: idx + 1,
          title: String((insight as Record<string, unknown>).label || categories[idx]),
          status: '7d',
        }));
        const nextMetrics: Record<string, number> = {};
        insights.forEach((insight, idx) => {
          const totals = (insight as Record<string, unknown>)?.totals as Record<string, unknown> | undefined;
          nextMetrics[categories[idx]] = Number(totals?.count || 0);
        });
        setAdminMetrics(nextMetrics);
        setSections([{ title: 'Platform overview', data }]);
        setAdminFeedback(
          (conversations || [])
            .filter((row) => row.inbox_category === 'feedback' || row.feedback_kind)
            .slice(0, 6)
        );
        const recentJobs = (Array.isArray(recentJobsRaw) ? recentJobsRaw : [])
          .slice()
          .sort((a, b) => {
            const ams = new Date(String(a?.created_at || 0)).getTime();
            const bms = new Date(String(b?.created_at || 0)).getTime();
            return bms - ams;
          })
          .slice(0, 8);
        setAdminRecentJobs(recentJobs as Record<string, unknown>[]);
        setOpenRows([]);
        setMapMarkers([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load jobs');
      setSections([]);
      setMapMarkers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const displaySections = sections.filter((s) => s.data.length > 0);
  const adminHeader = user?.role === 'admin' ? (
    <View>
      <View style={styles.adminGraphWrap}>
        <Text style={styles.sectionTitle}>Master View</Text>
        <View style={styles.adminTiles}>
          {Object.entries(adminMetrics).map(([k, v]) => (
            <Pressable
              key={`tile-${k}`}
              style={styles.adminTile}
              onPress={() => {
                if (k === 'total_jobs') {
                  navigation.navigate('MainTabs', { screen: 'Jobs' });
                  return;
                }
                if (k === 'companies') {
                  navigation.navigate('MainTabs', {
                    screen: 'AdminUsers',
                    params: { initialRole: 'company' },
                  });
                  return;
                }
                if (k === 'technicians') {
                  navigation.navigate('MainTabs', {
                    screen: 'AdminUsers',
                    params: { initialRole: 'technician' },
                  });
                  return;
                }
                navigation.navigate('MainTabs', {
                  screen: 'AdminUsers',
                  params: { initialRole: 'all' },
                });
              }}
            >
              <Text style={styles.adminTileLabel}>{k.replace('_', ' ')}</Text>
              <Text style={styles.adminTileValue}>{v}</Text>
            </Pressable>
          ))}
        </View>
        {Object.entries(adminMetrics).map(([k, v]) => {
          const width = Math.max(6, Math.min(100, v));
          return (
            <View key={k} style={styles.metricRow}>
              <Text style={styles.metricLabel}>{k.replace('_', ' ')}</Text>
              <View style={styles.metricBarBg}>
                <View style={[styles.metricBarFill, { width: `${width}%` }]} />
              </View>
              <Text style={styles.metricValue}>{v}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.openWrap}>
        <Text style={styles.sectionTitle}>Recent Jobs</Text>
        {adminRecentJobs.length === 0 ? (
          <Text style={styles.empty}>No recent jobs yet.</Text>
        ) : (
          adminRecentJobs.map((row) => (
            <Pressable
              key={`admin-job-${String(row.id)}`}
              onPress={() => navigation.navigate('JobDetail', { jobId: Number(row.id) })}
            >
              <Card style={styles.jobCard}>
                <Text style={styles.cardTitle}>{String(row.title || `Job #${row.id}`)}</Text>
                <Text style={styles.cardSub}>{formatJobAddress(row)}</Text>
              </Card>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.openWrap}>
        <Text style={styles.sectionTitle}>Recent User Feedback</Text>
        {adminFeedback.length === 0 ? (
          <Text style={styles.empty}>No feedback threads yet.</Text>
        ) : (
          adminFeedback.map((row) => (
            <Pressable
              key={`feedback-${row.id}`}
              onPress={() => navigation.navigate('Conversation', { conversationId: row.id })}
            >
              <Card style={styles.jobCard}>
                <Text style={styles.cardTitle}>{row.submitter_email || `Feedback #${row.id}`}</Text>
                <Text style={styles.cardSub}>{`${String(row.feedback_kind || 'general')} · ${String(row.conversation_type || 'thread')}`}</Text>
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </View>
  ) : null;

  const mapHint = useMemo(() => {
    if (user?.role !== 'technician') return '';
    if (mapMarkers.length <= 1) {
      return 'Add coordinates on your technician profile (address + geocode in Settings) and open jobs with locations to see pins.';
    }
    return '';
  }, [user?.role, mapMarkers.length]);

  if (!user) return null;

  if (loading && displaySections.length === 0 && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primaryOrange} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Dashboard</Text>
        <Text style={styles.pageSubtitle}>Monitor jobs and key activity by role.</Text>
      </View>
      {error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}

      {user.role === 'technician' ? (
        <View style={styles.mapWrap}>
          <MapJobsPreview
            markers={mapMarkers}
            height={260}
            emptyHint={mapHint || undefined}
            initialCenter={
              deviceCenter
                ? deviceCenter
                : mapMarkers.find((m) => m.id === 'me')
                ? {
                    latitude: mapMarkers.find((m) => m.id === 'me')!.latitude,
                    longitude: mapMarkers.find((m) => m.id === 'me')!.longitude,
                  }
                : null
            }
          />
        </View>
      ) : null}

      {user.role === 'company' ? (
        <View style={styles.snapshotWrap}>
          <Text style={styles.sectionTitle}>Company Snapshot</Text>
          <View style={styles.adminTiles}>
            {[
              { label: 'In Progress', value: sections.find((s) => s.title.includes('Claimed'))?.data.length || 0 },
              { label: 'Open Jobs', value: sections.find((s) => s.title === 'Open')?.data.length || 0 },
              { label: 'Completed', value: sections.find((s) => s.title === 'Completed')?.data.length || 0 },
            ].map((tile) => (
              <Card key={tile.label} style={styles.adminTile}>
                <Text style={styles.adminTileLabel}>{tile.label}</Text>
                <Text style={styles.adminTileValue}>{tile.value}</Text>
              </Card>
            ))}
          </View>
          <Card style={styles.summaryCard}>
            <Text style={styles.cardTitle}>My Jobs</Text>
            <Text style={styles.cardSub}>
              {`Total: ${
                (sections.find((s) => s.title.includes('Claimed'))?.data.length || 0) +
                (sections.find((s) => s.title === 'Open')?.data.length || 0) +
                (sections.find((s) => s.title === 'Completed')?.data.length || 0)
              } · Tap any job below to open details.`}
            </Text>
          </Card>
        </View>
      ) : null}

      {user.role === 'technician' ? (
        <View style={styles.openWrap}>
          <Text style={styles.sectionTitle}>Open Jobs Nearby</Text>
          {openRows.length === 0 ? (
            <Text style={styles.empty}>No open jobs to display right now.</Text>
          ) : (
            openRows.map((row) => (
              <Pressable
                key={String(row.id)}
                onPress={() => navigation.navigate('JobDetail', { jobId: Number(row.id) })}
              >
                <Card style={styles.jobCard}>
                  <Text style={styles.cardTitle}>{String(row.title || `Job #${row.id}`)}</Text>
                  <Text style={styles.cardSub}>{formatJobAddress(row)}</Text>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      <SectionList
        sections={displaySections}
        keyExtractor={(item, index) => {
          if (item && typeof item === 'object' && 'id' in item && typeof (item as { id: unknown }).id === 'number') {
            return String((item as { id: number }).id);
          }
          return `row-${index}`;
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryOrange} />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const { title, subtitle } = pickJobFields(item);
          const jid =
            item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'number'
              ? (item as { id: number }).id
              : null;
          return (
            <Pressable
              onPress={() => {
                if (jid != null && user.role !== 'admin') navigation.navigate('JobDetail', { jobId: jid });
              }}
            >
              <Card style={styles.jobCard}>
                <Text style={styles.cardTitle}>{title}</Text>
                {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {user.role === 'admin' ? '' : 'No jobs here yet. Pull down to refresh.'}
          </Text>
        }
        ListHeaderComponent={adminHeader}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  pageTitle: { ...typography.title, fontSize: 24, lineHeight: 30 },
  pageSubtitle: { ...typography.body, color: colors.muted, marginTop: 2 },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(254, 103, 17, 0.12)',
  },
  bannerText: { ...typography.body, color: colors.text },
  mapWrap: { paddingHorizontal: 16, paddingTop: 10 },
  openWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  snapshotWrap: { paddingHorizontal: 16, paddingBottom: 4 },
  adminGraphWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  metricRow: { marginTop: 8 },
  adminTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 10 },
  adminTile: {
    minWidth: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  adminTileLabel: { ...typography.caption, color: colors.muted, textTransform: 'uppercase' },
  adminTileValue: { ...typography.title, color: colors.text, marginTop: 4 },
  summaryCard: { marginTop: 2, marginBottom: 6 },
  metricLabel: { ...typography.caption, color: colors.muted, textTransform: 'capitalize' },
  metricBarBg: { height: 8, borderRadius: 8, backgroundColor: colors.bgElevated, marginTop: 5 },
  metricBarFill: { height: 8, borderRadius: 8, backgroundColor: colors.primaryBlue },
  metricValue: { ...typography.heading, color: colors.text, marginTop: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionTitle: {
    ...typography.caption,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  jobCard: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  cardTitle: { ...typography.heading, color: colors.text },
  cardSub: { ...typography.body, marginTop: 6, color: colors.muted },
  empty: { ...typography.body, textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
});
