import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primaryOrange} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.empty}>{label}</Text>
    </View>
  );
}

export function ErrorState({ error }: { error: string }) {
  if (!error) return null;
  return (
    <View style={styles.errorWrap}>
      <Text style={styles.error}>{error}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 10 },
  muted: { color: colors.muted },
  emptyWrap: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  empty: { textAlign: 'center', color: colors.muted },
  errorWrap: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.dangerBg,
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: colors.danger, textAlign: 'center' },
});
