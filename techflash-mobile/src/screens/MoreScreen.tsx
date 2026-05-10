import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import type { AppStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MainTabs'>;

export default function MoreScreen() {
  const navigation = useNavigation<Nav>();
  const { user, logout } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.flex}>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>
          Role: <Text style={styles.roleStrong}>{user?.role}</Text>
        </Text>
        {(user?.first_name || user?.last_name) && (
          <Text style={styles.name}>
            {user?.first_name} {user?.last_name}
          </Text>
        )}
      </View>
      <Text style={styles.hint}>
        Manage your account, jobs, and messages on mobile. For legal docs and support, use the links below.
      </Text>
      <Pressable style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.9 }]} onPress={() => Linking.openURL('https://techflash.app/privacy-policy')}>
        <Text style={styles.linkBtnText}>Privacy Policy</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.9 }]} onPress={() => Linking.openURL('https://techflash.app/terms-of-service')}>
        <Text style={styles.linkBtnText}>Terms of Service</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.9 }]} onPress={() => Linking.openURL('mailto:support@techflash.app')}>
        <Text style={styles.linkBtnText}>Contact Support</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.settings, pressed && { opacity: 0.9 }]}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.settingsText}>Open settings</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.logout, pressed && { opacity: 0.9 }]} onPress={() => logout()}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 13, color: colors.muted, marginBottom: 4 },
  email: { fontSize: 18, fontWeight: '700', color: colors.text },
  role: { marginTop: 12, fontSize: 15, color: colors.muted },
  roleStrong: { fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  name: { marginTop: 8, fontSize: 16, color: colors.text },
  hint: {
    marginTop: 20,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
  },
  linkBtn: {
    marginTop: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  linkBtnText: { fontSize: 15, fontWeight: '600', color: colors.text },
  logout: {
    marginTop: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: colors.danger },
  settings: {
    marginTop: 22,
    backgroundColor: colors.primaryOrange,
    borderWidth: 1,
    borderColor: colors.primaryOrange,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  settingsText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
