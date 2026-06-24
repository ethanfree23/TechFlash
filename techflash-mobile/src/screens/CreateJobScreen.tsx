import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, Pressable, View, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme';
import { createJob } from '../api/jobsApi';
import type { AppStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'CreateJob'>;
const DRAFT_KEY = 'create_job_draft_v1';

export default function CreateJobScreen() {
  const navigation = useNavigation<Nav>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skillClass, setSkillClass] = useState('');
  const [minimumYearsExperience, setMinimumYearsExperience] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Texas');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('United States');
  const [hourlyRate, setHourlyRate] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('8');
  const [days, setDays] = useState('1');
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [scheduledEndAt, setScheduledEndAt] = useState('');
  const [pickerField, setPickerField] = useState<'start' | 'end' | null>(null);
  const [pickDate, setPickDate] = useState('');
  const [pickTime, setPickTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');

  const dateOptions = useMemo(() => {
    const items: string[] = [];
    const base = new Date();
    for (let i = 0; i < 90; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      items.push(formatDatePart(d));
    }
    return items;
  }, []);

  const timeOptions = useMemo(() => {
    const items: string[] = [];
    for (let h = 0; h < 24; h += 1) {
      for (let m = 0; m < 60; m += 30) {
        items.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return items;
  }, []);

  const openPicker = (field: 'start' | 'end') => {
    const current = field === 'start' ? scheduledStartAt : scheduledEndAt;
    setPickerField(field);
    if (current.includes('T')) {
      const [d, t] = current.split('T');
      setPickDate(d);
      setPickTime((t || '').slice(0, 5));
    } else {
      const now = new Date();
      setPickDate(formatDatePart(now));
      setPickTime('08:00');
    }
  };

  const applyPicker = () => {
    if (!pickerField || !pickDate || !pickTime) return;
    const value = `${pickDate}T${pickTime}`;
    if (pickerField === 'start') setScheduledStartAt(value);
    if (pickerField === 'end') setScheduledEndAt(value);
    setPickerField(null);
  };

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const draft = JSON.parse(raw) as Record<string, string>;
        setTitle(String(draft.title || ''));
        setDescription(String(draft.description || ''));
        setSkillClass(String(draft.skillClass || ''));
        setMinimumYearsExperience(String(draft.minimumYearsExperience || ''));
        setTagsText(String(draft.tagsText || ''));
        setNotes(String(draft.notes || ''));
        setAddress(String(draft.address || ''));
        setCity(String(draft.city || ''));
        setStateName(String(draft.stateName || 'Texas'));
        setZipCode(String(draft.zipCode || ''));
        setCountry(String(draft.country || 'United States'));
        setHourlyRate(String(draft.hourlyRate || ''));
        setHoursPerDay(String(draft.hoursPerDay || '8'));
        setDays(String(draft.days || '1'));
        setScheduledStartAt(String(draft.scheduledStartAt || ''));
        setScheduledEndAt(String(draft.scheduledEndAt || ''));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const payload = {
      title,
      description,
      skillClass,
      minimumYearsExperience,
      tagsText,
      notes,
      address,
      city,
      stateName,
      zipCode,
      country,
      hourlyRate,
      hoursPerDay,
      days,
      scheduledStartAt,
      scheduledEndAt,
    };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload)).catch(() => {});
  }, [
    title,
    description,
    skillClass,
    minimumYearsExperience,
    tagsText,
    notes,
    address,
    city,
    stateName,
    zipCode,
    country,
    hourlyRate,
    hoursPerDay,
    days,
    scheduledStartAt,
    scheduledEndAt,
  ]);

  const onCreate = async () => {
    setValidation('');
    if (!title.trim() || !description.trim()) {
      setValidation('Title and description are required.');
      return;
    }
    if (!city.trim() && !address.trim()) {
      setValidation('Provide at least city or street address.');
      return;
    }
    if (scheduledStartAt && scheduledEndAt) {
      const startMs = new Date(scheduledStartAt).getTime();
      const endMs = new Date(scheduledEndAt).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
        setValidation('End date/time cannot be before start date/time.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const rate = parseFloat(hourlyRate);
      const hpd = parseInt(hoursPerDay, 10);
      const dayCount = parseInt(days, 10);
      const created = await createJob({
        title: title.trim(),
        description: description.trim(),
        status: 'open',
        go_live_at: new Date().toISOString(),
        skill_class: skillClass.trim() || undefined,
        skill_tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        minimum_years_experience: minimumYearsExperience ? Number(minimumYearsExperience) : undefined,
        notes: notes.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateName.trim() || undefined,
        zip_code: zipCode.trim() || undefined,
        country: country.trim() || undefined,
        location: [city.trim(), stateName.trim(), country.trim()].filter(Boolean).join(', ') || undefined,
        hourly_rate_cents: Number.isFinite(rate) ? Math.round(rate * 100) : undefined,
        hours_per_day: Number.isFinite(hpd) ? hpd : undefined,
        days: Number.isFinite(dayCount) ? dayCount : undefined,
        scheduled_start_at: scheduledStartAt.trim() || undefined,
        scheduled_end_at: scheduledEndAt.trim() || undefined,
      });
      const id = Number((created as Record<string, unknown>)?.id);
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      if (id) navigation.replace('JobDetail', { jobId: id });
      else navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Create Job</Text>
        <Text style={styles.pageSubtitle}>Post a clear listing with schedule and pay details.</Text>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!validation && <Text style={styles.error}>{validation}</Text>}
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <Field label="Class" value={skillClass} onChangeText={setSkillClass} />
      <Field
        label="Minimum years experience"
        value={minimumYearsExperience}
        onChangeText={setMinimumYearsExperience}
        keyboardType="numeric"
      />
      <Field
        label="Tags (comma-separated: electrical,hvac,plumbing)"
        value={tagsText}
        onChangeText={setTagsText}
      />
      <Field label="Notes and conditions" value={notes} onChangeText={setNotes} multiline />
      <Field label="Address" value={address} onChangeText={setAddress} />
      <Field label="City" value={city} onChangeText={setCity} />
      <Field label="State" value={stateName} onChangeText={setStateName} />
      <Field label="Zip code" value={zipCode} onChangeText={setZipCode} keyboardType="numeric" />
      <Field label="Country" value={country} onChangeText={setCountry} />

      <Text style={styles.section}>Pricing</Text>
      <Field label="Hourly rate (USD)" value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" />
      <Field label="Hours per day" value={hoursPerDay} onChangeText={setHoursPerDay} keyboardType="numeric" />
      <Field label="Days" value={days} onChangeText={setDays} keyboardType="numeric" />

      <Text style={styles.section}>Schedule</Text>
      <Pressable style={styles.pickerBtn} onPress={() => openPicker('start')}>
        <Text style={styles.pickerLabel}>Start date & time</Text>
        <Text style={styles.pickerValue}>{scheduledStartAt || 'Select start'}</Text>
      </Pressable>
      <Pressable style={styles.pickerBtn} onPress={() => openPicker('end')}>
        <Text style={styles.pickerLabel}>End date & time</Text>
        <Text style={styles.pickerValue}>{scheduledEndAt || 'Select end'}</Text>
      </Pressable>

      <Pressable style={styles.btn} onPress={onCreate} disabled={saving}>
        <Text style={styles.btnText}>{saving ? 'Creating...' : 'Create job'}</Text>
      </Pressable>
      <Modal visible={!!pickerField} animationType="slide" transparent onRequestClose={() => setPickerField(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pickerField === 'start' ? 'Pick start date/time' : 'Pick end date/time'}
            </Text>
            <View style={styles.modalColumns}>
              <View style={styles.modalCol}>
                <Text style={styles.modalColTitle}>Date</Text>
                <ScrollView style={styles.optionList}>
                  {dateOptions.map((opt) => (
                    <Pressable key={opt} style={styles.option} onPress={() => setPickDate(opt)}>
                      <Text style={[styles.optionText, pickDate === opt && styles.optionTextOn]}>{opt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.modalCol}>
                <Text style={styles.modalColTitle}>Time</Text>
                <ScrollView style={styles.optionList}>
                  {timeOptions.map((opt) => (
                    <Pressable key={opt} style={styles.option} onPress={() => setPickTime(opt)}>
                      <Text style={[styles.optionText, pickTime === opt && styles.optionTextOn]}>{toDisplayTime(opt)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setPickerField(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.applyBtn} onPress={applyPicker}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </Pressable>
            </View>
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
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        autoCapitalize="none"
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </>
  );
}

function formatDatePart(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDisplayTime(v: string) {
  const [hh, mm] = v.split(':');
  const h = Number(hh);
  const m = Number(mm);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { marginBottom: 6 },
  pageTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  pageSubtitle: { color: colors.muted, marginTop: 4 },
  error: { color: colors.danger, marginBottom: 8 },
  label: { marginTop: 10, marginBottom: 4, color: colors.muted, textTransform: 'uppercase', fontSize: 12 },
  section: { marginTop: 14, fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  btn: {
    marginTop: 16,
    backgroundColor: colors.primaryOrange,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: colors.white, fontWeight: '700' },
  pickerBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerLabel: { color: colors.muted, fontSize: 12, textTransform: 'uppercase' },
  pickerValue: { color: colors.text, marginTop: 4, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 14,
    maxHeight: '78%',
  },
  modalTitle: { fontSize: 18, color: colors.text, fontWeight: '700', marginBottom: 10 },
  modalColumns: { flexDirection: 'row', gap: 10 },
  modalCol: { flex: 1 },
  modalColTitle: { color: colors.muted, marginBottom: 6, fontWeight: '700' },
  optionList: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, maxHeight: 320 },
  option: { paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.text },
  optionTextOn: { color: colors.primaryBlue, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: colors.text, fontWeight: '700' },
  applyBtn: { flex: 1, backgroundColor: colors.primaryBlue, borderRadius: 10, alignItems: 'center', paddingVertical: 10 },
  applyBtnText: { color: colors.white, fontWeight: '700' },
});
