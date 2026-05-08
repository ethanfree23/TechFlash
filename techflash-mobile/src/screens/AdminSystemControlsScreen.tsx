import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, space, radii, typography } from '../theme';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { GhostButton } from '../components/ui/GhostButton';
import {
  adminListTierConfigs,
  adminUpdateTierConfig,
  adminProvisionStripe,
  adminGetLicensingSettings,
  adminUpdateLicensingSettings,
  adminEmailQaListTemplates,
  adminEmailQaSend,
  adminListCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  adminAssignCoupon,
  adminListSimulatedMarkers,
  adminCreateSimulatedMarker,
  adminUpdateSimulatedMarker,
  adminDeleteSimulatedMarker,
} from '../api/adminSystemApi';

type Audience = 'technician' | 'company';

export default function AdminSystemControlsScreen() {
  const [audience, setAudience] = useState<Audience>('technician');
  const [tiers, setTiers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [licensingCodes, setLicensingCodes] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [coupons, setCoupons] = useState<Record<string, unknown>[]>([]);
  const [couponForm, setCouponForm] = useState({
    name: '',
    code: '',
    discount_kind: 'percent',
    discount_value: '10',
  });
  const [couponBusy, setCouponBusy] = useState(false);
  const [assignUserByCouponId, setAssignUserByCouponId] = useState<Record<number, string>>({});
  const [markers, setMarkers] = useState<Record<string, unknown>[]>([]);
  const [markerForm, setMarkerForm] = useState({
    name: '',
    latitude: '',
    longitude: '',
    trade_label: '',
  });
  const [markerBusy, setMarkerBusy] = useState(false);

  const loadTiers = useCallback(async () => {
    const list = await adminListTierConfigs(audience);
    setTiers(list as Record<string, unknown>[]);
  }, [audience]);

  const loadStatic = useCallback(async () => {
    const lic = await adminGetLicensingSettings();
    const codes = lic?.local_only_state_codes || [];
    setLicensingCodes(Array.isArray(codes) ? codes.join(',') : '');
    const tpl = await adminEmailQaListTemplates();
    setTemplates(Array.isArray(tpl) ? tpl : []);
  }, []);

  const loadCouponsMarkers = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([adminListCoupons(), adminListSimulatedMarkers()]);
      setCoupons(Array.isArray(c) ? c : []);
      setMarkers(Array.isArray(m) ? m : []);
    } catch {
      setCoupons([]);
      setMarkers([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setError('');
        try {
          await loadStatic();
          await loadCouponsMarkers();
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadStatic, loadCouponsMarkers])
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const list = await adminListTierConfigs(audience);
        if (!cancelled) setTiers(list as Record<string, unknown>[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load tiers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const saveTierField = async (id: number, patch: Record<string, unknown>) => {
    try {
      await adminUpdateTierConfig(id, patch);
      await loadTiers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveLicensing = async () => {
    const codes = licensingCodes
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    try {
      await adminUpdateLicensingSettings(codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const refreshCoupons = async () => {
    try {
      const c = await adminListCoupons();
      setCoupons(Array.isArray(c) ? c : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load coupons');
    }
  };

  const createCoupon = async () => {
    const name = couponForm.name.trim();
    const code = couponForm.code.trim();
    if (!name || !code) {
      setError('Coupon name and code are required');
      return;
    }
    const dv = parseInt(couponForm.discount_value, 10);
    if (Number.isNaN(dv)) {
      setError('Discount value must be a number');
      return;
    }
    setCouponBusy(true);
    setError('');
    try {
      await adminCreateCoupon({
        name,
        code: code.toUpperCase(),
        discount_kind: couponForm.discount_kind,
        discount_value: dv,
        active: true,
        duration_template: 'one_month',
      });
      setCouponForm({ name: '', code: '', discount_kind: 'percent', discount_value: '10' });
      await refreshCoupons();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create coupon failed');
    } finally {
      setCouponBusy(false);
    }
  };

  const toggleCouponActive = async (c: Record<string, unknown>) => {
    const id = Number(c.id);
    try {
      await adminUpdateCoupon(id, { active: c.active !== true });
      await refreshCoupons();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const confirmDeleteCoupon = (c: Record<string, unknown>) => {
    const id = Number(c.id);
    const label = String(c.code || id);
    Alert.alert('Delete coupon?', `Remove coupon ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminDeleteCoupon(id);
            await refreshCoupons();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  const assignCouponToUser = async (couponId: number) => {
    const raw = (assignUserByCouponId[couponId] || '').trim();
    const uid = parseInt(raw, 10);
    if (!raw || Number.isNaN(uid)) {
      setError('Enter a numeric user ID to assign');
      return;
    }
    setError('');
    try {
      await adminAssignCoupon({ coupon_id: couponId, user_id: uid });
      setAssignUserByCouponId((prev) => ({ ...prev, [couponId]: '' }));
      await refreshCoupons();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    }
  };

  const refreshMarkers = async () => {
    try {
      const m = await adminListSimulatedMarkers();
      setMarkers(Array.isArray(m) ? m : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load markers');
    }
  };

  const createMarker = async () => {
    const name = markerForm.name.trim();
    const lat = parseFloat(markerForm.latitude);
    const lng = parseFloat(markerForm.longitude);
    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      setError('Name, latitude, and longitude are required');
      return;
    }
    setMarkerBusy(true);
    setError('');
    try {
      await adminCreateSimulatedMarker({
        name,
        latitude: lat,
        longitude: lng,
        trade_label: markerForm.trade_label.trim() || null,
        active: true,
      });
      setMarkerForm({ name: '', latitude: '', longitude: '', trade_label: '' });
      await refreshMarkers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create marker failed');
    } finally {
      setMarkerBusy(false);
    }
  };

  const toggleMarkerActive = async (row: Record<string, unknown>) => {
    const id = Number(row.id);
    try {
      await adminUpdateSimulatedMarker(id, { active: row.active !== true });
      await refreshMarkers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const confirmDeleteMarker = (row: Record<string, unknown>) => {
    const id = Number(row.id);
    const label = String(row.name || id);
    Alert.alert('Delete marker?', `Remove simulated marker "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminDeleteSimulatedMarker(id);
            await refreshMarkers();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Delete failed');
          }
        },
      },
    ]);
  };

  if (loading && tiers.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryOrange} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={typography.title}>System controls</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.audienceRow}>
        {(['technician', 'company'] as Audience[]).map((a) => (
          <Pressable
            key={a}
            onPress={() => setAudience(a)}
            style={[styles.audienceChip, audience === a && styles.audienceChipOn]}
          >
            <Text style={[styles.audienceText, audience === a && styles.audienceTextOn]}>{a}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Membership tiers</Text>
      {tiers.map((t) => {
        const id = Number(t.id);
        const feeDollars = ((Number(t.monthly_fee_cents) || 0) / 100).toFixed(2);
        return (
          <TierEditCard
            key={id}
            tier={t}
            feeDollars={feeDollars}
            onSave={(patch) => saveTierField(id, patch)}
            onProvision={async () => {
              try {
                await adminProvisionStripe(id);
                await loadTiers();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Provision failed');
              }
            }}
          />
        );
      })}

      <Text style={styles.section}>Electrical licensing (local-only states)</Text>
      <Card>
        <Text style={styles.help}>Comma-separated state codes (e.g. TX,CA)</Text>
        <TextInput
          value={licensingCodes}
          onChangeText={setLicensingCodes}
          style={styles.textArea}
          multiline
          placeholderTextColor={colors.muted}
        />
        <PrimaryButton label="Save licensing states" onPress={saveLicensing} />
      </Card>

      <Text style={styles.section}>Email QA</Text>
      <Card>
        <Text style={styles.help}>Confirm with SEND_TEST_EMAILS (same as web).</Text>
        <TextInput
          placeholder="Confirmation phrase"
          value={emailConfirm}
          onChangeText={setEmailConfirm}
          style={styles.input}
          placeholderTextColor={colors.muted}
        />
        {templates.map((tpl) => (
          <View key={String(tpl.key)} style={styles.tpl}>
            <Text style={styles.tplName}>{String(tpl.name || tpl.key)}</Text>
            <GhostButton
              label="Send test"
              onPress={async () => {
                try {
                  const key = String(tpl.key || '');
                  await adminEmailQaSend(key, emailConfirm.trim() || 'SEND_TEST_EMAILS');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Send failed');
                }
              }}
            />
          </View>
        ))}
      </Card>

      <Text style={styles.section}>Coupons</Text>
      <Card>
        <Text style={styles.help}>Create simple promo codes (1‑month duration template). Use the web admin for full date windows.</Text>
        <LabeledInput
          label="Name"
          value={couponForm.name}
          onChangeText={(v) => setCouponForm((p) => ({ ...p, name: v }))}
        />
        <LabeledInput
          label="Code"
          value={couponForm.code}
          onChangeText={(v) => setCouponForm((p) => ({ ...p, code: v }))}
        />
        <LabeledInput
          label="Discount value"
          value={couponForm.discount_value}
          onChangeText={(v) => setCouponForm((p) => ({ ...p, discount_value: v }))}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Discount kind</Text>
        <View style={styles.audienceRow}>
          {(['percent', 'fixed_cents'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setCouponForm((p) => ({ ...p, discount_kind: k }))}
              style={[styles.audienceChip, couponForm.discount_kind === k && styles.audienceChipOn]}
            >
              <Text
                style={[styles.audienceText, couponForm.discount_kind === k && styles.audienceTextOn]}
              >
                {k === 'percent' ? '%' : '¢ fixed'}
              </Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Create coupon" onPress={createCoupon} loading={couponBusy} />

        {coupons.map((c) => {
          const id = Number(c.id);
          const assignments = Array.isArray(c.assignments) ? c.assignments : [];
          return (
            <View key={id} style={styles.couponRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponCode}>{String(c.code || '')}</Text>
                <Text style={styles.couponMeta}>{String(c.name || '')}</Text>
                <Text style={styles.couponMeta}>
                  {c.active === false ? 'Inactive' : 'Active'} · {String(c.discount_kind || '')}{' '}
                  {String(c.discount_value ?? '')}
                </Text>
                {assignments.length > 0 && (
                  <Text style={styles.couponAssign}>
                    {assignments.length} assignment{assignments.length === 1 ? '' : 's'}
                  </Text>
                )}
              </View>
              <View style={{ gap: 6 }}>
                <GhostButton label={c.active === false ? 'Activate' : 'Deactivate'} onPress={() => toggleCouponActive(c)} />
                <GhostButton label="Delete" onPress={() => confirmDeleteCoupon(c)} />
              </View>
            </View>
          );
        })}
        {coupons.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: space.md }]}>Assign to user</Text>
            {coupons.map((c) => {
              const id = Number(c.id);
              return (
                <View key={`assign-${id}`} style={styles.assignRow}>
                  <Text style={styles.couponCode}>{String(c.code || id)}</Text>
                  <TextInput
                    placeholder="User ID"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    value={assignUserByCouponId[id] ?? ''}
                    onChangeText={(t) => setAssignUserByCouponId((prev) => ({ ...prev, [id]: t }))}
                    style={[styles.input, { flex: 1, minWidth: 100 }]}
                  />
                  <GhostButton label="Assign" onPress={() => assignCouponToUser(id)} />
                </View>
              );
            })}
          </>
        )}
      </Card>

      <Text style={styles.section}>Simulated map markers</Text>
      <Card>
        <Text style={styles.help}>
          Test pins for map density. Toggle active or delete; coordinates are decimal degrees.
        </Text>
        <LabeledInput
          label="Name"
          value={markerForm.name}
          onChangeText={(v) => setMarkerForm((p) => ({ ...p, name: v }))}
        />
        <LabeledInput
          label="Latitude"
          value={markerForm.latitude}
          onChangeText={(v) => setMarkerForm((p) => ({ ...p, latitude: v }))}
          keyboardType="decimal-pad"
        />
        <LabeledInput
          label="Longitude"
          value={markerForm.longitude}
          onChangeText={(v) => setMarkerForm((p) => ({ ...p, longitude: v }))}
          keyboardType="decimal-pad"
        />
        <LabeledInput
          label="Trade label (optional)"
          value={markerForm.trade_label}
          onChangeText={(v) => setMarkerForm((p) => ({ ...p, trade_label: v }))}
        />
        <PrimaryButton label="Add marker" onPress={createMarker} loading={markerBusy} />

        {markers.map((row) => {
          const id = Number(row.id);
          return (
            <View key={id} style={styles.markerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponCode}>{String(row.name || id)}</Text>
                <Text style={styles.couponMeta}>
                  {Number(row.latitude)?.toFixed(4)}, {Number(row.longitude)?.toFixed(4)}
                </Text>
                {!!row.trade_label && <Text style={styles.couponMeta}>{String(row.trade_label)}</Text>}
              </View>
              <View style={{ gap: 6 }}>
                <GhostButton
                  label={row.active === false ? 'Activate' : 'Deactivate'}
                  onPress={() => toggleMarkerActive(row)}
                />
                <GhostButton label="Delete" onPress={() => confirmDeleteMarker(row)} />
              </View>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

function TierEditCard({
  tier,
  feeDollars,
  onSave,
  onProvision,
}: {
  tier: Record<string, unknown>;
  feeDollars: string;
  onSave: (patch: Record<string, unknown>) => void;
  onProvision: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(String(tier.display_name || ''));
  const [fee, setFee] = useState(feeDollars);
  const [commission, setCommission] = useState(String(tier.commission_percent ?? ''));

  useEffect(() => {
    setDisplayName(String(tier.display_name || ''));
    setFee(((Number(tier.monthly_fee_cents) || 0) / 100).toFixed(2));
    setCommission(String(tier.commission_percent ?? ''));
  }, [tier]);

  return (
    <Card>
      <Text style={typography.heading}>{String(tier.slug)}</Text>
      <Text style={styles.meta}>ID {String(tier.id)}</Text>
      <LabeledInput label="Display name" value={displayName} onChangeText={setDisplayName} />
      <PrimaryButton
        label="Save display name"
        onPress={() => onSave({ display_name: displayName.trim() })}
      />
      <LabeledInput label="Monthly fee ($)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
      <PrimaryButton
        label="Save fee"
        onPress={() => {
          const cents = Math.round(parseFloat(fee) * 100);
          if (!Number.isNaN(cents)) onSave({ monthly_fee_cents: cents });
        }}
      />
      <LabeledInput label="Commission %" value={commission} onChangeText={setCommission} keyboardType="decimal-pad" />
      <PrimaryButton
        label="Save commission"
        onPress={() => {
          const n = parseFloat(commission);
          if (!Number.isNaN(n)) onSave({ commission_percent: n });
        }}
      />
      <GhostButton label="Provision Stripe price" onPress={onProvision} />
    </Card>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={styles.input}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  error: { color: colors.danger, marginBottom: 8 },
  section: { ...typography.caption, marginTop: space.lg, marginBottom: space.sm },
  audienceRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  audienceChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  audienceChipOn: { borderColor: colors.tabActive, backgroundColor: colors.primaryBlueMuted },
  audienceText: { fontWeight: '600', color: colors.muted, textTransform: 'capitalize' },
  audienceTextOn: { color: colors.tabActive },
  meta: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  help: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 10,
    minHeight: 72,
    textAlignVertical: 'top',
    color: colors.text,
    marginBottom: 10,
  },
  tpl: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tplName: { fontWeight: '600', marginBottom: 6, color: colors.text },
  couponRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  couponCode: { fontWeight: '700', color: colors.text, fontSize: 15 },
  couponMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  couponAssign: { color: colors.muted, fontSize: 11, marginTop: 4 },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
    flexWrap: 'wrap',
  },
  markerRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
