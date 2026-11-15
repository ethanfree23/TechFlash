import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import { formatUsPhone, phoneDigits } from '../utils/phone';
import { TRADE_OPTIONS } from '../constants/trades';
import {
  TECHNICIAN_CLASS_OPTIONS,
  technicianClassLabel,
} from '../constants/technicianClass';
import {
  PASSWORD_REQUIREMENT_HINT,
  validatePasswordConfirmation,
} from '../utils/passwordRules';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [role, setRole] = useState<'technician' | 'company'>('technician');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [address, setAddress] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [skillClass, setSkillClass] = useState('journeyman');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [tradePickerOpen, setTradePickerOpen] = useState(false);
  const [tradeFilter, setTradeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredTrades = useMemo(() => {
    const q = tradeFilter.trim().toLowerCase();
    if (!q) return [...TRADE_OPTIONS];
    return TRADE_OPTIONS.filter((t) => t.toLowerCase().includes(q));
  }, [tradeFilter]);

  const onSubmit = async () => {
    setError('');
    const pwErr = validatePasswordConfirmation(password, passwordConfirmation);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (!email.trim() || !firstName.trim() || !lastName.trim() || !phoneDigits(phone)) {
      setError('Email, name, and phone are required.');
      return;
    }
    if (!city.trim() || !stateVal.trim() || !zipCode.trim()) {
      setError('City, state, and ZIP are required. These are used when location permission is denied.');
      return;
    }
    if (role === 'technician') {
      if (!tradeType.trim()) {
        setError('Select a trade for technician signup.');
        return;
      }
      if (!skillClass.trim()) {
        setError('Select Apprentice, Journeyman, or Master.');
        return;
      }
    } else if (!companyName.trim() || !industry.trim()) {
      setError('Company name and industry are required.');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        password_confirmation: passwordConfirmation,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phoneDigits(phone),
        city: city.trim(),
        state: stateVal.trim(),
        zip_code: zipCode.trim(),
        address: address.trim(),
        role,
        membership_tier: 'basic',
        honeypot: '',
        ...(role === 'technician'
          ? { trade_type: tradeType.trim(), skill_class: technicianClassLabel(skillClass) }
          : { company_name: companyName.trim(), industry: industry.trim() }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const openTradePicker = () => {
    setTradeFilter('');
    setTradePickerOpen(true);
  };

  const applyTrade = (trade: string) => {
    if (role === 'technician') setTradeType(trade);
    else setIndustry(trade);
    setTradePickerOpen(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>
          Basic membership signup (no card required). Paid tiers can be managed on the website.
        </Text>
        {error ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>I am a…</Text>
        <View style={styles.roleRow}>
          <Pressable
            style={[styles.roleChip, role === 'technician' && styles.roleChipOn]}
            onPress={() => setRole('technician')}
          >
            <Text style={[styles.roleChipText, role === 'technician' && styles.roleChipTextOn]}>Technician</Text>
          </Pressable>
          <Pressable
            style={[styles.roleChip, role === 'company' && styles.roleChipOn]}
            onPress={() => setRole('company')}
          >
            <Text style={[styles.roleChipText, role === 'company' && styles.roleChipTextOn]}>Company</Text>
          </Pressable>
        </View>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>{PASSWORD_REQUIREMENT_HINT}</Text>
        <Field label="Password" value={password} onChangeText={setPassword} secure />
        <Field label="Confirm password" value={passwordConfirmation} onChangeText={setPasswordConfirmation} secure />
        <Field label="First name" value={firstName} onChangeText={setFirstName} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} />
        <Field label="Phone" value={phone} onChangeText={(v) => setPhone(formatUsPhone(v))} keyboardType="phone-pad" />
        <Field label="City" value={city} onChangeText={setCity} />
        <Field label="State" value={stateVal} onChangeText={setStateVal} placeholder="e.g. TX" />
        <Field label="ZIP" value={zipCode} onChangeText={setZipCode} keyboardType="numbers-and-punctuation" />
        <Field label="Street address (optional)" value={address} onChangeText={setAddress} />

        {role === 'technician' ? (
          <>
            <Text style={styles.label}>Trade</Text>
            <Pressable style={styles.pickerBtn} onPress={openTradePicker}>
              <Text style={tradeType ? styles.pickerValue : styles.pickerPlaceholder}>
                {tradeType || 'Select trade'}
              </Text>
            </Pressable>
            <Text style={styles.label}>Class</Text>
            <View style={styles.roleRow}>
              {TECHNICIAN_CLASS_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.classChip, skillClass === opt && styles.roleChipOn]}
                  onPress={() => setSkillClass(opt)}
                >
                  <Text style={[styles.roleChipText, skillClass === opt && styles.roleChipTextOn]}>
                    {technicianClassLabel(opt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <Field label="Company name" value={companyName} onChangeText={setCompanyName} />
            <Text style={styles.label}>Industry / trade</Text>
            <Pressable style={styles.pickerBtn} onPress={openTradePicker}>
              <Text style={industry ? styles.pickerValue : styles.pickerPlaceholder}>
                {industry || 'Select industry'}
              </Text>
            </Pressable>
          </>
        )}

        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Creating…' : 'Create account'}</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkWrap}>
          <Text style={styles.link}>Already have an account? Log in</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={tradePickerOpen} animationType="slide" transparent onRequestClose={() => setTradePickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{role === 'technician' ? 'Pick a trade' : 'Pick an industry'}</Text>
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
                <Pressable style={styles.tradeRow} onPress={() => applyTrade(item)}>
                  <Text style={styles.tradeRowText}>{item}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.secondaryBtn} onPress={() => setTradePickerOpen(false)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secure,
  keyboardType,
  autoCapitalize,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numbers-and-punctuation';
  autoCapitalize?: 'none' | 'sentences';
  placeholder?: string;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  note: { color: colors.muted, marginBottom: 12, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.muted, fontSize: 13, marginBottom: 8, lineHeight: 18 },
  errBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errText: { color: colors.danger, fontSize: 14 },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  roleChip: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  classChip: {
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  roleChipOn: {
    borderColor: colors.primaryOrange,
    backgroundColor: 'rgba(254, 103, 17, 0.08)',
  },
  roleChipText: { fontWeight: '600', color: colors.muted },
  roleChipTextOn: { color: colors.primaryOrange },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    marginBottom: 14,
    color: colors.text,
  },
  pickerBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    marginBottom: 14,
  },
  pickerValue: { fontSize: 16, color: colors.text },
  pickerPlaceholder: { fontSize: 16, color: colors.muted },
  btn: {
    backgroundColor: colors.primaryOrange,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  linkWrap: { marginTop: 20, alignItems: 'center' },
  link: { color: colors.primaryBlue, fontWeight: '600', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 10 },
  tradeList: { marginBottom: 10 },
  tradeRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tradeRowText: { fontSize: 16, color: colors.text },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '600', color: colors.text },
});
