import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { colors, space, typography } from '../theme';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { GhostButton } from '../components/ui/GhostButton';
import * as settingsApi from '../api/settingsApi';
import * as savedApi from '../api/savedJobSearchesApi';
import { getLicensingSettings } from '../api/licensingSettingsApi';
import { listPublicTierConfigs } from '../api/membershipTierConfigsApi';
import type { User } from '../types/user';
import {
  getPushOptIn,
  openSystemSettings,
  requestExpoPushPermissions,
  setPushOptIn,
} from '../notifications/pushPrefs';
import { geocodeAddress } from '../utils/geocode';
import { formatUsPhone, phoneDigits } from '../utils/phone';
import * as Location from 'expo-location';

type MeApply = (res: { user?: User } | null | undefined) => Promise<void>;

const EMAIL_CATEGORIES: { key: string; label: string }[] = [
  { key: 'messages', label: 'Messages' },
  { key: 'job_lifecycle', label: 'Job lifecycle' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'membership_updates', label: 'Membership updates' },
];

export function SettingsAccountPanel({
  user,
  onApplied,
  notice,
  onDeleted,
}: {
  user: User;
  onApplied: MeApply;
  notice: string;
  onDeleted: () => Promise<void>;
}) {
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<Array<Record<string, unknown>>>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);

  useEffect(() => {
    setEmail(user.email || '');
  }, [user.email]);

  const loadBlocks = useCallback(async () => {
    setBlocksLoading(true);
    try {
      const data = await settingsApi.listBlockedUsers();
      setBlockedUsers(Array.isArray(data?.blocked_users) ? data.blocked_users : []);
    } finally {
      setBlocksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocks().catch(() => {});
  }, [loadBlocks]);

  const onSave = async () => {
    setSaving(true);
    setSaveErr('');
    try {
      const payload: Record<string, unknown> = { email: email.trim() };
      if (password.trim()) {
        payload.password = password;
        payload.password_confirmation = passwordConfirmation;
      }
      const res = await settingsApi.updateMe(payload);
      await onApplied(res);
      setPassword('');
      setPasswordConfirmation('');
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not update account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Text style={typography.heading}>Account</Text>
      <Text style={styles.help}>Your email is your username. Change password here.</Text>
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField label="New password (optional)" value={password} onChangeText={setPassword} secureTextEntry />
      <TextField label="Confirm password" value={passwordConfirmation} onChangeText={setPasswordConfirmation} secureTextEntry />
      <PrimaryButton label={saving ? 'Saving...' : 'Update account'} onPress={onSave} loading={saving} disabled={saving} />
      {!!saveErr ? <Text style={styles.err}>{saveErr}</Text> : null}
      {!!notice && !saveErr ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={[typography.heading, { marginTop: space.lg }]}>Legal and support</Text>
      <GhostButton label="Open Privacy Policy" onPress={() => Linking.openURL('https://techflash.app/privacy-policy')} />
      <GhostButton label="Open Terms of Service" onPress={() => Linking.openURL('https://techflash.app/terms-of-service')} />
      <GhostButton label="Contact support" onPress={() => Linking.openURL('mailto:support@techflash.app')} />

      <Text style={[typography.heading, { marginTop: space.lg }]}>Blocked users</Text>
      {blocksLoading ? <Text style={styles.help}>Loading blocked users...</Text> : null}
      {!blocksLoading && blockedUsers.length === 0 ? (
        <Text style={styles.help}>No blocked users.</Text>
      ) : null}
      {blockedUsers.map((row) => {
        const id = Number(row.id);
        const name = `${String(row.first_name || '')} ${String(row.last_name || '')}`.trim() || String(row.email || `User #${id}`);
        return (
          <View key={String(id)} style={styles.tplRow}>
            <Text style={styles.tplText}>{name}</Text>
            <Pressable
              onPress={async () => {
                await settingsApi.unblockUser(id);
                await loadBlocks();
              }}
            >
              <Text style={styles.remove}>Unblock</Text>
            </Pressable>
          </View>
        );
      })}

      <Text style={[typography.heading, { marginTop: space.lg }]}>Account deletion</Text>
      <Text style={styles.help}>Delete your account and profile data from the mobile app.</Text>
      <PrimaryButton
        label={deleteBusy ? 'Deleting account...' : 'Delete account permanently'}
        loading={deleteBusy}
        disabled={deleteBusy}
        onPress={() =>
          Alert.alert('Delete account?', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                setDeleteBusy(true);
                try {
                  await settingsApi.deleteMe();
                  await onDeleted();
                } catch (e) {
                  setSaveErr(e instanceof Error ? e.message : 'Could not delete account');
                } finally {
                  setDeleteBusy(false);
                }
              },
            },
          ])
        }
      />
    </Card>
  );
}

export function SettingsProfilePanel({
  user,
  profile,
  form,
  setForm,
  onSaved,
}: {
  user: User;
  profile: Record<string, unknown>;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [licenseStates, setLicenseStates] = useState<string[]>([]);

  useEffect(() => {
    getLicensingSettings()
      .then((r) => setLicenseStates(Array.isArray(r?.local_only_state_codes) ? r.local_only_state_codes : []))
      .catch(() => setLicenseStates([]));
  }, []);

  const handleChange = (name: string, value: string) => {
    if (name === 'phone') {
      setForm((prev) => ({ ...prev, [name]: formatUsPhone(value) }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onGeocode = async () => {
    if (user.role !== 'technician') return;
    const q = [form.address, form.city, form.state, form.zip_code].filter(Boolean).join(', ');
    if (!q.trim()) return;
    setGeoBusy(true);
    try {
      const g = await geocodeAddress(q);
      if (g) {
        await settingsApi.updateTechnicianProfile(Number(profile.id), {
          latitude: g.latitude,
          longitude: g.longitude,
        });
        setForm((prev) => ({ ...prev, location: g.formatted_address || prev.location }));
        await onSaved();
      }
    } finally {
      setGeoBusy(false);
    }
  };

  const onSubmit = async () => {
    const firstName = (form.first_name || '').trim();
    const lastName = (form.last_name || '').trim();
    const rawPhoneDigits = phoneDigits(String(form.phone || ''));
    if (!firstName || !lastName) return;
    if (!rawPhoneDigits || rawPhoneDigits.length < 10) return;
    setSaving(true);
    try {
      await settingsApi.updateMe({
        first_name: firstName,
        last_name: lastName,
        phone: rawPhoneDigits,
      });
      const phoneTrim = rawPhoneDigits;
      if (user.role === 'company') {
        const state = (form.state || '').trim();
        const needsElectrical =
          licenseStates.includes(state.toUpperCase()) && !(form.electrical_license_number || '').trim();
        if (needsElectrical) {
          throw new Error('Electrical license number is required for this state.');
        }
        const { first_name: _a, last_name: _b, ...rest } = form;
        await settingsApi.updateCompanyProfile(Number(profile.id), {
          ...rest,
          phone: phoneTrim,
          state,
          electrical_license_number: (form.electrical_license_number || '').trim(),
        });
      } else if (user.role === 'technician') {
        const { first_name: _c, last_name: _d, ...techPayload } = form;
        await settingsApi.updateTechnicianProfile(Number(profile.id), {
          ...techPayload,
          phone: phoneTrim,
          experience_years:
            form.experience_years === '' ? null : parseInt(form.experience_years, 10),
        });
      } else if (user.role === 'admin') {
        await settingsApi.updateMe({
          first_name: firstName,
          last_name: lastName,
          phone: phoneTrim,
        });
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (user.role === 'admin') {
    return (
      <Card>
        <Text style={typography.heading}>Profile</Text>
        <Text style={styles.help}>Admin accounts can update name and phone.</Text>
        <TextField label="First name" value={form.first_name || ''} onChangeText={(v) => handleChange('first_name', v)} />
        <TextField label="Last name" value={form.last_name || ''} onChangeText={(v) => handleChange('last_name', v)} />
        <TextField label="Phone" value={form.phone || ''} onChangeText={(v) => handleChange('phone', v)} keyboardType="phone-pad" />
        <PrimaryButton label={saving ? 'Saving...' : 'Save profile'} onPress={onSubmit} loading={saving} />
      </Card>
    );
  }

  if (user.role === 'company') {
    return (
      <Card>
        <Text style={typography.heading}>Company profile</Text>
        <TextField label="First name" value={form.first_name || ''} onChangeText={(v) => handleChange('first_name', v)} />
        <TextField label="Last name" value={form.last_name || ''} onChangeText={(v) => handleChange('last_name', v)} />
        <TextField label="Phone" value={form.phone || ''} onChangeText={(v) => handleChange('phone', v)} keyboardType="phone-pad" />
        <TextField label="Company name" value={form.company_name || ''} onChangeText={(v) => handleChange('company_name', v)} />
        <TextField label="Industry" value={form.industry || ''} onChangeText={(v) => handleChange('industry', v)} />
        <TextField label="State (2-letter)" value={form.state || ''} onChangeText={(v) => handleChange('state', v)} autoCapitalize="characters" />
        <TextField
          label="Electrical license # (if required)"
          value={form.electrical_license_number || ''}
          onChangeText={(v) => handleChange('electrical_license_number', v)}
        />
        <TextField label="Location" value={form.location || ''} onChangeText={(v) => handleChange('location', v)} />
        <TextField label="Bio" value={form.bio || ''} onChangeText={(v) => handleChange('bio', v)} multiline />
        <PrimaryButton label={saving ? 'Saving...' : 'Save profile'} onPress={onSubmit} loading={saving} />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={typography.heading}>Technician profile</Text>
      <TextField label="First name" value={form.first_name || ''} onChangeText={(v) => handleChange('first_name', v)} />
      <TextField label="Last name" value={form.last_name || ''} onChangeText={(v) => handleChange('last_name', v)} />
      <TextField label="Phone" value={form.phone || ''} onChangeText={(v) => handleChange('phone', v)} keyboardType="phone-pad" />
      <TextField label="Trade type" value={form.trade_type || ''} onChangeText={(v) => handleChange('trade_type', v)} />
      <TextField label="Experience (years)" value={form.experience_years || ''} onChangeText={(v) => handleChange('experience_years', v)} keyboardType="numeric" />
      <TextField label="Availability" value={form.availability || ''} onChangeText={(v) => handleChange('availability', v)} />
      <TextField label="Street address" value={form.address || ''} onChangeText={(v) => handleChange('address', v)} />
      <TextField label="City" value={form.city || ''} onChangeText={(v) => handleChange('city', v)} />
      <TextField label="State" value={form.state || ''} onChangeText={(v) => handleChange('state', v)} />
      <TextField label="ZIP" value={form.zip_code || ''} onChangeText={(v) => handleChange('zip_code', v)} keyboardType="numeric" />
      <GhostButton label={geoBusy ? 'Geocoding...' : 'Save coordinates from address'} onPress={onGeocode} disabled={geoBusy} />
      <TextField label="Bio" value={form.bio || ''} onChangeText={(v) => handleChange('bio', v)} multiline />
      <PrimaryButton label={saving ? 'Saving...' : 'Save profile'} onPress={onSubmit} loading={saving} />
    </Card>
  );
}

export function SettingsNotificationsPanel({
  user,
  onApplied,
}: {
  user: User;
  onApplied: MeApply;
}) {
  const [saving, setSaving] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [perm, setPerm] = useState<string>('undetermined');

  const prefs = {
    emailMaster: user.email_notifications_enabled !== false,
    jobAlerts: user.job_alert_notifications_enabled !== false,
    categories: {
      messages: (user.email_notification_preferences as Record<string, boolean> | undefined)?.messages !== false,
      job_lifecycle:
        (user.email_notification_preferences as Record<string, boolean> | undefined)?.job_lifecycle !== false,
      reviews: (user.email_notification_preferences as Record<string, boolean> | undefined)?.reviews !== false,
      membership_updates:
        (user.email_notification_preferences as Record<string, boolean> | undefined)?.membership_updates !== false,
    },
  };

  const [emailMaster, setEmailMaster] = useState(prefs.emailMaster);
  const [jobAlerts, setJobAlerts] = useState(prefs.jobAlerts);
  const [cat, setCat] = useState(prefs.categories);

  useEffect(() => {
    setEmailMaster(user.email_notifications_enabled !== false);
    setJobAlerts(user.job_alert_notifications_enabled !== false);
    setCat({
      messages: (user.email_notification_preferences as Record<string, boolean> | undefined)?.messages !== false,
      job_lifecycle:
        (user.email_notification_preferences as Record<string, boolean> | undefined)?.job_lifecycle !== false,
      reviews: (user.email_notification_preferences as Record<string, boolean> | undefined)?.reviews !== false,
      membership_updates:
        (user.email_notification_preferences as Record<string, boolean> | undefined)?.membership_updates !== false,
    });
  }, [user]);

  useEffect(() => {
    if (user.role === 'company' || user.role === 'technician') {
      getPushOptIn(user.role).then(setPushOn);
      Notifications.getPermissionsAsync().then((r) => setPerm(String(r.status)));
    }
  }, [user.role]);

  const persistEmailPrefs = async (next: {
    email_notifications_enabled: boolean;
    job_alert_notifications_enabled: boolean;
    email_notification_preferences: Record<string, boolean>;
  }) => {
    setSaving(true);
    try {
      const res = await settingsApi.updateMe({
        email_notifications_enabled: next.email_notifications_enabled,
        job_alert_notifications_enabled: next.job_alert_notifications_enabled,
        email_notification_preferences: next.email_notification_preferences,
      });
      await onApplied(res);
    } finally {
      setSaving(false);
    }
  };

  const onPushToggle = async (val: boolean) => {
    if (user.role !== 'company' && user.role !== 'technician') return;
    await setPushOptIn(user.role, val);
    setPushOn(val);
    if (val) {
      const s = await requestExpoPushPermissions();
      setPerm(String(s));
    }
  };

  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [tplForm, setTplForm] = useState({
    tags: '',
    max_distance_miles: '',
    min_hourly_rate: '',
    max_hourly_rate: '',
    min_duration_hours: '',
    max_duration_hours: '',
  });
  const [resolvedCenter, setResolvedCenter] = useState('');

  const loadTpl = useCallback(async () => {
    if (user.role !== 'technician') return;
    const items = await savedApi.listSavedJobSearches();
    setTemplates(items);
  }, [user.role]);

  useEffect(() => {
    loadTpl();
  }, [loadTpl]);

  useEffect(() => {
    const resolveCenter = async () => {
      if (user.role !== 'technician') return;
      const profileAddr = [user.address, user.city, user.state, user.zip_code].filter(Boolean).join(', ');
      if (profileAddr.trim()) {
        const g = await geocodeAddress(profileAddr);
        if (g?.formatted_address) {
          setResolvedCenter(`Profile address (${g.formatted_address})`);
          return;
        }
      }
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          setResolvedCenter(`Device GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
          return;
        }
      } catch (_) {}
      setResolvedCenter('No profile address or GPS permission');
    };
    resolveCenter();
  }, [user]);

  const addTemplate = async () => {
    const tags = tplForm.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await savedApi.createSavedJobSearch({
      skill_tags: tags,
      skill_class: tags.join(',') || null,
      max_distance_miles: tplForm.max_distance_miles === '' ? null : Number(tplForm.max_distance_miles),
      min_hourly_rate_cents: tplForm.min_hourly_rate === '' ? null : Math.round(Number(tplForm.min_hourly_rate) * 100),
      max_hourly_rate_cents: tplForm.max_hourly_rate === '' ? null : Math.round(Number(tplForm.max_hourly_rate) * 100),
      duration_hours_min: tplForm.min_duration_hours === '' ? null : Number(tplForm.min_duration_hours),
      duration_hours_max: tplForm.max_duration_hours === '' ? null : Number(tplForm.max_duration_hours),
    });
    setTplForm({
      tags: '',
      max_distance_miles: '',
      min_hourly_rate: '',
      max_hourly_rate: '',
      min_duration_hours: '',
      max_duration_hours: '',
    });
    await loadTpl();
  };

  const removeTpl = async (id: number) => {
    await savedApi.removeSavedJobSearch(id);
    await loadTpl();
  };

  return (
    <ScrollView>
      {(user.role === 'company' || user.role === 'technician') && (
        <Card>
          <Text style={typography.heading}>Push notifications</Text>
          <Text style={styles.help}>
            Enables alerts on this device when OS permission is granted. (Email preferences below are stored on your
            account.)
          </Text>
          <Text style={styles.status}>Permission: {perm}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.switchLabel}>Allow push on this device</Text>
            <Switch value={pushOn} onValueChange={onPushToggle} />
          </View>
          <GhostButton label="Open system notification settings" onPress={openSystemSettings} />
        </Card>
      )}

      <Card>
        <Text style={typography.heading}>Email notifications</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.switchLabel}>Email notifications</Text>
          <Switch
            value={emailMaster}
            onValueChange={async (v) => {
              setEmailMaster(v);
              await persistEmailPrefs({
                email_notifications_enabled: v,
                job_alert_notifications_enabled: jobAlerts,
                email_notification_preferences: cat,
              });
            }}
            disabled={saving}
          />
        </View>
        {user.role === 'technician' ? (
          <View style={styles.rowBetween}>
            <Text style={styles.switchLabel}>Job alert emails</Text>
            <Switch
              value={jobAlerts}
              onValueChange={async (v) => {
                setJobAlerts(v);
                await persistEmailPrefs({
                  email_notifications_enabled: emailMaster,
                  job_alert_notifications_enabled: v,
                  email_notification_preferences: cat,
                });
              }}
              disabled={saving || !emailMaster}
            />
          </View>
        ) : null}
        {EMAIL_CATEGORIES.map(({ key, label }) => (
          <View key={key} style={styles.rowBetween}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch
              value={cat[key as keyof typeof cat]}
              onValueChange={async (v) => {
                const next = { ...cat, [key]: v };
                setCat(next);
                await persistEmailPrefs({
                  email_notifications_enabled: emailMaster,
                  job_alert_notifications_enabled: jobAlerts,
                  email_notification_preferences: next,
                });
              }}
              disabled={saving || !emailMaster}
            />
          </View>
        ))}
      </Card>

      {user.role === 'technician' ? (
        <Card>
          <Text style={typography.heading}>Job alert templates</Text>
          <Text style={styles.help}>Order: tags, distance from home, pay range, duration range.</Text>
          <Text style={styles.help}>
            Location permission is used only to estimate distance for nearby job matching when your profile address is missing.
          </Text>
          <Text style={styles.status}>Map center for alerts: {resolvedCenter || 'Resolving...'}</Text>
          <TextField label="Tags (comma-separated)" value={tplForm.tags} onChangeText={(v) => setTplForm((p) => ({ ...p, tags: v }))} />
          <TextField
            label="Distance from home (miles)"
            value={tplForm.max_distance_miles}
            onChangeText={(v) => setTplForm((p) => ({ ...p, max_distance_miles: v }))}
            keyboardType="numeric"
          />
          <Text style={styles.rangeLabel}>Pay range</Text>
          <View style={styles.rangeRow}>
            <View style={styles.rangeCol}>
              <TextField
                label="Min pay ($/hr)"
                value={tplForm.min_hourly_rate}
                onChangeText={(v) => setTplForm((p) => ({ ...p, min_hourly_rate: v }))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.rangeCol}>
              <TextField
                label="Max pay ($/hr)"
                value={tplForm.max_hourly_rate}
                onChangeText={(v) => setTplForm((p) => ({ ...p, max_hourly_rate: v }))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <Text style={styles.rangeLabel}>Duration range</Text>
          <View style={styles.rangeRow}>
            <View style={styles.rangeCol}>
              <TextField
                label="Min duration (hours)"
                value={tplForm.min_duration_hours}
                onChangeText={(v) => setTplForm((p) => ({ ...p, min_duration_hours: v }))}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.rangeCol}>
              <TextField
                label="Max duration (hours)"
                value={tplForm.max_duration_hours}
                onChangeText={(v) => setTplForm((p) => ({ ...p, max_duration_hours: v }))}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.addTemplateWrap}>
            <PrimaryButton label="Add template" onPress={addTemplate} />
          </View>
          {templates.map((t) => (
            <View key={String(t.id)} style={styles.tplRow}>
              <Text style={styles.tplText}>
                {`#${String(t.id ?? '')} ${String(t.skill_class ?? '')} · ${String(t.max_distance_miles ?? '')} mi`}
              </Text>
              <Pressable onPress={() => removeTpl(Number(t.id))}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

export function SettingsPaymentPanel({
  user,
  membership,
  membershipLevel,
  setMembershipLevel,
  tierOptions,
  onRefresh,
}: {
  user: User;
  membership: Record<string, unknown>;
  membershipLevel: string;
  setMembershipLevel: (s: string) => void;
  tierOptions: { id: string; name: string }[];
  onRefresh: () => Promise<void>;
}) {
  const openWebPayment = () => {
    Linking.openURL('https://techflash.app/settings?tab=payment');
  };

  return (
    <Card>
      <Text style={typography.heading}>Membership & billing</Text>
      <Text style={styles.meta}>Current tier: {String(membership.membership_level || 'basic')}</Text>
      <Text style={styles.meta}>
        Monthly fee: ${(((membership.monthly_fee_cents as number) || 0) / 100).toFixed(2)}
      </Text>
      <Text style={styles.help}>
        TechFlash memberships support a real-world labor marketplace. Hosted checkout is used for non-IAP billing flows.
      </Text>
      <Text style={styles.help}>
        TODO(AppReview): legal/product must confirm whether any tier unlocks digital-only iOS functionality requiring Apple IAP.
      </Text>
      <View style={styles.tierRow}>
        {tierOptions.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => setMembershipLevel(o.id)}
            style={[styles.tierChip, membershipLevel === o.id && styles.tierChipOn]}
          >
            <Text style={[styles.tierChipText, membershipLevel === o.id && styles.tierChipTextOn]}>{o.name}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton
        label="Update membership"
        onPress={async () => {
          await settingsApi.openMembershipCheckout(
            membershipLevel,
            'https://techflash.app/settings?membership=success',
            'https://techflash.app/settings?membership=cancel'
          );
          await onRefresh();
        }}
      />
      {user.role === 'company' ? (
        <>
          <Text style={[styles.help, { marginTop: space.lg }]}>Card on file is managed securely on the website.</Text>
          <GhostButton label="Open billing on techflash.app" onPress={openWebPayment} />
        </>
      ) : null}
      {user.role === 'technician' ? (
        <GhostButton
          label="Open payout / Stripe Connect"
          onPress={async () => {
            const r = await settingsApi.createConnectAccountLink('https://techflash.app');
            if (r?.url) await Linking.openURL(r.url);
          }}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  help: { ...typography.body, color: colors.muted, marginBottom: space.md },
  meta: { ...typography.body, color: colors.text, marginBottom: 4 },
  notice: { ...typography.body, color: colors.primaryBlue, marginTop: 8 },
  err: { ...typography.body, color: colors.danger, marginTop: 8 },
  status: { ...typography.caption, color: colors.muted, marginBottom: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  switchLabel: { ...typography.body, flex: 1, color: colors.text },
  rangeLabel: { ...typography.caption, marginTop: 2, marginBottom: 2, color: colors.muted, textTransform: 'uppercase' },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeCol: { flex: 1 },
  addTemplateWrap: { marginTop: 8, marginBottom: 6 },
  tplRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tplText: { ...typography.body, flex: 1, color: colors.text },
  remove: { ...typography.body, color: colors.danger, fontWeight: '600' },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tierChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tierChipOn: { borderColor: colors.tabActive, backgroundColor: colors.primaryBlueMuted },
  tierChipText: { ...typography.caption, color: colors.muted },
  tierChipTextOn: { color: colors.tabActive },
});
