import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, Pressable, ActivityIndicator, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { getJobById, updateJob } from '../api/jobsApi';
import type { AppStackParamList } from '../navigation/RootNavigator';

type EditRoute = RouteProp<AppStackParamList, 'EditJob'>;
type Nav = NativeStackNavigationProp<AppStackParamList, 'EditJob'>;

export default function EditJobScreen() {
  const route = useRoute<EditRoute>();
  const navigation = useNavigation<Nav>();
  const { jobId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = (await getJobById(jobId)) as Record<string, unknown>;
      setTitle(String(data?.title || ''));
      setDescription(String(data?.description || ''));
      setLocation(String(data?.location || ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateJob(jobId, {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
      });
      navigation.replace('JobDetail', { jobId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update job');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primaryOrange} /></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Edit Job</Text>
        <Text style={styles.pageSubtitle}>Update the listing while keeping current job flow intact.</Text>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <Field label="Location" value={location} onChangeText={setLocation} />
      <Pressable style={styles.btn} onPress={onSave} disabled={saving}>
        <Text style={styles.btnText}>{saving ? 'Saving...' : 'Save changes'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
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
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { marginBottom: 6 },
  pageTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  pageSubtitle: { color: colors.muted, marginTop: 4 },
  error: { color: colors.danger, marginBottom: 8 },
  label: { marginTop: 10, marginBottom: 4, color: colors.muted, textTransform: 'uppercase', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.white,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  btn: {
    marginTop: 16,
    backgroundColor: colors.primaryOrange,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: colors.white, fontWeight: '700' },
});
