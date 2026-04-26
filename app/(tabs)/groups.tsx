import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useGroupStore } from '@/stores/groupStore';
import { Group } from '@/types';

const GROUP_ICONS: Record<string, string> = { home: '🏠', trip: '✈️', couple: '💑', other: '👥' };

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const balance = group.balance ?? 0;
  return (
    <TouchableOpacity style={s.card} onPress={onPress}>
      <View style={s.cardLeft}>
        <View style={s.iconBox}>
          <Text style={{ fontSize: 22 }}>{GROUP_ICONS[group.type] ?? '👥'}</Text>
        </View>
        <View>
          <Text style={s.cardTitle}>{group.name}</Text>
          <Text style={s.cardSub}>{group.type.charAt(0).toUpperCase() + group.type.slice(1)}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {balance === 0
          ? <Text style={s.settled}>Settled ✓</Text>
          : <>
              <Text style={s.balanceLabel}>{balance > 0 ? 'you are owed' : 'you owe'}</Text>
              <Text style={[s.balanceAmount, { color: balance > 0 ? '#16a34a' : '#dc2626' }]}>
                ${Math.abs(balance).toFixed(2)}
              </Text>
            </>
        }
      </View>
    </TouchableOpacity>
  );
}

export default function GroupsScreen() {
  const { user } = useAuthStore();
  const { groups, loading, fetchGroups } = useGroupStore();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => { if (user) fetchGroups(user.id); }, [user]);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Groups</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => router.push('/group/new')}>
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); if (user) await fetchGroups(user.id); setRefreshing(false); }} tintColor="#4f46e5" />
        }
      >
        {loading ? <ActivityIndicator color="#4f46e5" style={{ marginTop: 40 }} /> :
         groups.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>👥</Text>
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptySub}>Create a group to start splitting expenses</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/group/new')}>
              <Text style={s.newBtnText}>Create First Group</Text>
            </TouchableOpacity>
          </View>
        ) : groups.map((g) => (
          <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#f8fafc' },
  topBar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 },
  pageTitle:    { color: '#111827', fontSize: 24, fontWeight: 'bold' },
  newBtn:       { backgroundColor: '#4f46e5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  newBtnText:   { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  card:         { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#f1f5f9' },
  cardLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:      { width: 48, height: 48, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { color: '#111827', fontWeight: 'bold', fontSize: 16 },
  cardSub:      { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  settled:      { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  balanceLabel: { color: '#9ca3af', fontSize: 11 },
  balanceAmount:{ fontWeight: 'bold', fontSize: 16 },
  empty:        { alignItems: 'center', marginTop: 80 },
  emptyTitle:   { color: '#111827', fontWeight: 'bold', fontSize: 18 },
  emptySub:     { color: '#6b7280', fontSize: 14, marginTop: 8, textAlign: 'center' },
  emptyBtn:     { marginTop: 24, backgroundColor: '#4f46e5', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
});
