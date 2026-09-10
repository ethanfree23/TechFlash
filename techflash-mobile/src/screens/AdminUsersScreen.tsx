import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SectionList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { listAdminUsers, type AdminRoleFilter, type AdminUserListItem } from '../api/adminApi';
import type { AppStackParamList, MainTabParamList } from '../navigation/RootNavigator';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenStates';

type Nav = NativeStackNavigationProp<AppStackParamList, 'MainTabs'>;
type AdminUsersRoute = RouteProp<MainTabParamList, 'AdminUsers'>;

export default function AdminUsersScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<AdminUsersRoute>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<AdminRoleFilter>('all');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AdminUserListItem[]>([]);
  const groupedSections =
    role === 'all'
      ? [
          { title: 'Technicians', data: rows.filter((r) => r.role === 'technician') },
          { title: 'Companies', data: rows.filter((r) => r.role === 'company') },
        ].filter((s) => s.data.length > 0)
      : [{ title: role === 'company' ? 'Companies' : 'Technicians', data: rows }];

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await listAdminUsers(query, role);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, role]);

  useEffect(() => {
    const incoming = route.params?.initialRole;
    if (incoming && incoming !== role) {
      setRole(incoming);
      setLoading(true);
    }
  }, [route.params?.initialRole, role]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.createBtn} onPress={() => navigation.navigate('AdminCreateUser')}>
        <Text style={styles.createBtnText}>Create user</Text>
      </Pressable>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, email, phone, company, trade, ZIP"
          placeholderTextColor={colors.muted}
          style={styles.search}
          autoCapitalize="none"
          onSubmitEditing={() => {
            setLoading(true);
            load();
          }}
        />
        <Pressable style={styles.searchBtn} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.searchBtnText}>Search</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'company', 'technician'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => { setRole(f); setLoading(true); }}
            style={[styles.filterChip, role === f && styles.filterChipOn]}
          >
            <Text style={[styles.filterText, role === f && styles.filterTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorState error={error} />

      {loading ? (
        <LoadingState label="Loading users..." />
      ) : (
        <SectionList
          sections={groupedSections}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryOrange} />}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListEmptyComponent={<EmptyState label="No users found." />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('AdminUserDetail', { userId: item.id })}
            >
              <Text style={styles.cardTitle}>{item.user_name || item.email}</Text>
              <Text style={styles.cardSub}>{item.email}</Text>
              <Text style={styles.cardSub}>Role: {item.role}</Text>
              {!!item.company_name && <Text style={styles.cardSub}>Company: {item.company_name}</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 14 },
  createBtn: {
    backgroundColor: colors.primaryOrange,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 10,
  },
  createBtnText: { color: colors.white, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  search: {
    flex: 1,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  searchBtn: {
    backgroundColor: colors.primaryOrange,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  searchBtnText: { color: colors.white, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  filterChip: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipOn: { borderColor: colors.primaryOrange, backgroundColor: 'rgba(254,103,17,0.08)' },
  filterText: { color: colors.muted, textTransform: 'capitalize' },
  filterTextOn: { color: colors.primaryOrange, fontWeight: '700' },
  error: { color: colors.danger, marginBottom: 8 },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 6,
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  cardSub: { color: colors.muted, marginTop: 4 },
});
