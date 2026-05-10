import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';
import { useAuth } from '../auth/AuthContext';
import * as settingsApi from '../api/settingsApi';
import { listPublicTierConfigs } from '../api/membershipTierConfigsApi';
import {
  SettingsAccountPanel,
  SettingsNotificationsPanel,
  SettingsPaymentPanel,
  SettingsProfilePanel,
} from '../settings/panels';
import type { AppStackParamList } from '../navigation/RootNavigator';
import type { User } from '../types/user';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { user, applyUserFromMeResponse, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [membership, setMembership] = useState<Record<string, unknown>>({});
  const [membershipLevel, setMembershipLevel] = useState('basic');
  const [tierOptions, setTierOptions] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isAdmin = user?.role === 'admin';
  const sectionIds = useMemo(
    () => ['account', 'profile', 'notifications', 'payment', ...(isAdmin ? ['system_controls', 'job_access'] : [])],
    [isAdmin]
  );

  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      if (user.role === 'admin') {
        setProfile({});
        setMembership({});
        setForm({
          first_name: String(user.first_name || ''),
          last_name: String(user.last_name || ''),
          phone: String(user.phone || ''),
        });
        setMembershipLevel('basic');
        setTierOptions([]);
        return;
      }

      const [m, p] = await Promise.all([
        settingsApi.getMembership(),
        user.role === 'company' ? settingsApi.getCompanyProfile() : settingsApi.getTechnicianProfile(),
      ]);
      const profileObj = (p || {}) as Record<string, unknown>;
      setMembership((m || {}) as Record<string, unknown>);
      setProfile(profileObj);
      const ml = String((m as Record<string, unknown>)?.membership_level || 'basic');
      setMembershipLevel(ml);

      const tiers = await listPublicTierConfigs(user.role === 'company' ? 'company' : 'technician');
      const mapped =
        tiers.map((t) => ({
          id: String((t.slug as string) || '').toLowerCase(),
          name: String((t.display_name as string) || (t.slug as string) || ''),
        })) || [];
      setTierOptions(
        mapped.length > 0
          ? mapped
          : [
              { id: 'basic', name: 'Basic' },
              { id: 'pro', name: 'Pro' },
              { id: 'premium', name: 'Premium' },
            ]
      );

      if (user.role === 'company') {
        setForm({
          first_name: String(user.first_name || ''),
          last_name: String(user.last_name || ''),
          phone: String((profileObj.phone || user.phone || '') as string),
          company_name: String(profileObj.company_name || ''),
          industry: String(profileObj.industry || ''),
          location: String(profileObj.location || ''),
          state: String(profileObj.state || ''),
          electrical_license_number: String(profileObj.electrical_license_number || ''),
          bio: String(profileObj.bio || ''),
        });
      } else {
        setForm({
          first_name: String(user.first_name || ''),
          last_name: String(user.last_name || ''),
          phone: String((profileObj.phone || user.phone || '') as string),
          trade_type: String(profileObj.trade_type || ''),
          experience_years:
            profileObj.experience_years == null ? '' : String(profileObj.experience_years),
          availability: String(profileObj.availability || ''),
          bio: String(profileObj.bio || ''),
          location: String(profileObj.location || ''),
          address: String(profileObj.address || ''),
          city: String(profileObj.city || ''),
          state: String(profileObj.state || 'Texas'),
          zip_code: String(profileObj.zip_code || ''),
          country: String(profileObj.country || 'United States'),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      sectionIds.forEach((id) => {
        next[id] = prev[id] ?? (id === 'account' || id === 'profile');
      });
      return next;
    });
  }, [sectionIds]);

  const onApplied = useCallback(
    async (res: { user?: User } | null | undefined) => {
      await applyUserFromMeResponse(res);
      setNotice('Saved.');
      await load();
    },
    [applyUserFromMeResponse, load]
  );

  if (!user) return null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryOrange} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={typography.title}>Settings</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <View style={styles.expandRow}>
        <Pressable
          style={[styles.toggleAllBtn, styles.toggleAllPrimary]}
          onPress={() => setExpanded(Object.fromEntries(sectionIds.map((id) => [id, true])))}
        >
          <Text style={styles.toggleAllPrimaryText}>Expand all</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleAllBtn, styles.toggleAllGhost]}
          onPress={() => setExpanded(Object.fromEntries(sectionIds.map((id) => [id, false])))}
        >
          <Text style={styles.toggleAllGhostText}>Collapse all</Text>
        </Pressable>
      </View>

      <SettingSection
        title="Account"
        expanded={!!expanded.account}
        onToggle={() => setExpanded((prev) => ({ ...prev, account: !prev.account }))}
      >
        <SettingsAccountPanel user={user} onApplied={onApplied} notice={notice} onDeleted={logout} />
      </SettingSection>

      <SettingSection
        title="Profile"
        expanded={!!expanded.profile}
        onToggle={() => setExpanded((prev) => ({ ...prev, profile: !prev.profile }))}
      >
        <SettingsProfilePanel user={user} profile={profile} form={form} setForm={setForm} onSaved={load} />
      </SettingSection>

      <SettingSection
        title="Notifications"
        expanded={!!expanded.notifications}
        onToggle={() => setExpanded((prev) => ({ ...prev, notifications: !prev.notifications }))}
      >
        <SettingsNotificationsPanel user={user} onApplied={onApplied} />
      </SettingSection>

      <SettingSection
        title="Payment"
        expanded={!!expanded.payment}
        onToggle={() => setExpanded((prev) => ({ ...prev, payment: !prev.payment }))}
      >
        {!isAdmin ? (
          <SettingsPaymentPanel
            user={user}
            membership={membership}
            membershipLevel={membershipLevel}
            setMembershipLevel={setMembershipLevel}
            tierOptions={tierOptions}
            onRefresh={load}
          />
        ) : (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>Admin billing uses the website.</Text>
          </View>
        )}
      </SettingSection>

      {isAdmin ? (
        <SettingSection
          title="System Controls"
          expanded={!!expanded.system_controls}
          onToggle={() => setExpanded((prev) => ({ ...prev, system_controls: !prev.system_controls }))}
        >
          <Pressable style={styles.linkCard} onPress={() => navigation.navigate('AdminSystemControls')}>
            <Text style={styles.linkTitle}>Open system controls</Text>
            <Text style={styles.linkSub}>Pricing tiers, licensing, email QA</Text>
          </Pressable>
        </SettingSection>
      ) : null}

      {isAdmin ? (
        <SettingSection
          title="Job Access"
          expanded={!!expanded.job_access}
          onToggle={() => setExpanded((prev) => ({ ...prev, job_access: !prev.job_access }))}
        >
          <Pressable style={styles.linkCard} onPress={() => navigation.navigate('AdminJobAccess')}>
            <Text style={styles.linkTitle}>Open job access by tier</Text>
            <Text style={styles.linkSub}>Technician tier visibility rules</Text>
          </Pressable>
        </SettingSection>
      ) : null}
    </ScrollView>
  );
}

function SettingSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionChevron}>{expanded ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  error: { color: colors.danger, marginBottom: 8 },
  notice: { color: colors.primaryBlue, marginBottom: 8 },
  expandRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  toggleAllBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  toggleAllPrimary: { backgroundColor: colors.primaryBlue },
  toggleAllGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  toggleAllPrimaryText: { color: colors.white, fontWeight: '700' },
  toggleAllGhostText: { color: colors.text, fontWeight: '700' },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionChevron: { color: colors.primaryBlue, fontWeight: '700' },
  sectionBody: { padding: 12 },
  linkCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  linkTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  linkSub: { color: colors.muted, marginTop: 4, fontSize: 14 },
  hintBox: { padding: 16 },
  hintText: { color: colors.muted },
});
