import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { createAdminUser } from '../api/adminApi';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { formatUsPhone, phoneDigits } from '../utils/phone';
import { TRADE_OPTIONS } from '../constants/trades';

type Nav = NativeStackNavigationProp<AppStackParamList, 'AdminCreateUser'>;

export default function AdminCreateUserScreen() {
  const navigation = useNavigation<Nav>();
  const [role, setRole] = useState<'technician' | 'company'>('technician');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [location, setLocation] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [tradePickerOpen, setTradePickerOpen] = useState(false);
  const [tradeFilter, setTradeFilter] = useState('');

  const filteredTrades = useMemo(() => {
    const q = tradeFilter.trim().toLowerCase();
    if (!q) return [...TRADE_OPTIONS];
    return TRADE_OPTIONS.filter((t) => t.toLowerCase().includes(q));
  }, [tradeFilter]);

  const onCreate = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const pw = password.trim();
      const pwC = passwordConfirmation.trim();
      if ((pw || pwC) && (!pw || !pwC)) {
        setError('Enter and confirm the password, or leave both blank to email a setup link.');
        return;
      }
      if (pw && pw !== pwC) {
        setError('Password confirmation does not match.');
        return;
      }

      const base: Record<string, unknown> = {
        role,
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phoneDigits(phone),
      };
      if (pw) {
        base.password = password;
        base.password_confirmation = pwC;
      }

      const payload =
        role === 'company'
          ? {
              ...base,
              company_name: companyName.trim(),
              industry: industry.trim(),
              state: stateVal.trim(),
            }
          : {
              ...base,
              trade_type: tradeType.trim() || 'General',
              location: location.trim(),
            };
      await createAdminUser(payload);
      setNotice('User created.');
      setTimeout(() => navigation.goBack(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create admin-managed user</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      <Text style={styles.label}>Role</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(['technician', 'company'] as const).map((r) => (
          <Pressable key={r} style={[styles.chip, role === r && styles.chipOn]} onPress={() => setRole(r)}>
            <Text style={[styles.chipText, role === r && styles.chipTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Field label="Email" value={email} onChangeText={setEmail} />
      <Field
        label="Password (optional)"
        value={password}
        onChangeText={setPassword}
        secure
        hint="Leave blank to email setup link"
      />
      <Field label="Confirm password" value={passwordConfirmation} onChangeText={setPasswordConfirmation} secure />
      <Field label="First name" value={firstName} onChangeText={setFirstName} />
      <Field label="Last name" value={lastName} onChangeText={setLastName} />
      <Field label="Phone" value={phone} onChangeText={(v) => setPhone(formatUsPhone(v))} />

      {role === 'company' ? (
        <>
          <Field label="Company name" value={companyName} onChangeText={setCompanyName} />
          <Field label="Industry" value={industry} onChangeText={setIndustry} />
          <Field label="State" value={stateVal} onChangeText={setStateVal} />
        </>
      ) : (
        <>
          <Text style={styles.label}>Trade type</Text>
          <TextInput
            value={tradeType}
            onChangeText={setTradeType}
            placeholder="Type or pick from list"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="words"
          />
          <Pressable style={styles.secondaryBtn} onPress={() => setTradePickerOpen(true)}>
            <Text style={styles.secondaryBtnText}>Choose from list</Text>
          </Pressable>
          <Field label="Location" value={location} onChangeText={setLocation} />
        </>
      )}

      <Pressable style={[styles.btn, saving && { opacity: 0.7 }]} onPress={onCreate} disabled={saving}>
        <Text style={styles.btnText}>{saving ? 'Creating...' : 'Create user'}</Text>
      </Pressable>

      <Modal visible={tradePickerOpen} animationType="slide" transparent onRequestClose={() => setTradePickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick a trade</Text>
            <TextInput
              value={tradeFilter}
              onChangeText={setTradeFilter}
              placeholder="Filter..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
            />
            <FlatList
              data={filteredTrades}
              keyExtractor={(item) => item}
              style={styles.tradeList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.tradeRow}
                  onPress={() => {
                    setTradeType(item);
                    setTradePickerOpen(false);
                    setTradeFilter('');
                  }}
                >
                  <Text style={styles.tradeRowText}>{item}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.modalCancel} onPress={() => setTradePickerOpen(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secure,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  hint?: string;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.muted}
        secureTextEntry={secure}
        style={styles.input}
        autoCapitalize="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  error: { color: colors.danger, marginBottom: 8 },
  notice: { color: colors.primaryBlue, marginBottom: 8 },
  label: { marginTop: 10, marginBottom: 4, color: colors.muted, textTransform: 'uppercase', fontSize: 12 },
  fieldHint: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  secondaryBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  secondaryBtnText: { color: colors.primaryBlue, fontWeight: '600', fontSize: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  chipOn: { borderColor: colors.primaryOrange, backgroundColor: 'rgba(254,103,17,0.08)' },
  chipText: { color: colors.muted, textTransform: 'capitalize' },
  chipTextOn: { color: colors.primaryOrange, fontWeight: '700' },
  btn: {
    marginTop: 18,
    backgroundColor: colors.primaryOrange,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: colors.white, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: colors.text },
  tradeList: { maxHeight: 280, marginTop: 8 },
  tradeRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tradeRowText: { fontSize: 16, color: colors.text },
  modalCancel: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { color: colors.muted, fontWeight: '600' },
});
