import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatCurrency } from '@/lib/utils';

interface ActivityItem { id: string; type: string; description: string; amount?: number; actor_name: string; created_at: string; }
const ICONS: Record<string, string> = { expense_added: '💸', expense_edited: '✏️', expense_deleted: '🗑️', settlement: '✅', member_added: '👋' };

export default function ActivityScreen() {
  const { user } = useAuthStore();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchActivity() {
    if (!user) return;
    const { data, error } = await supabase
      .from('activities')
      .select('*, actor:profiles(full_name), expense:expenses(description, amount)')
      .or(`actor_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) {
      setActivities(data.map((a: any) => ({
        id: a.id, type: a.type,
        description: a.expense?.description ?? 'Activity',
        amount: a.expense?.amount,
        actor_name: a.actor?.full_name ?? 'Someone',
        created_at: a.created_at,
      })));
    }
    setLoading(false); setRefreshing(false);
  }

  useEffect(() => { fetchActivity(); }, [user]);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.topBar}><Text style={s.pageTitle}>Activity</Text></View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchActivity(); }} tintColor="#4f46e5" />}
      >
        {loading ? <ActivityIndicator color="#4f46e5" style={{ marginTop: 40 }} /> :
         activities.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🔔</Text>
            <Text style={s.emptyTitle}>No activity yet</Text>
            <Text style={s.emptySub}>Expense activity will appear here</Text>
          </View>
        ) : activities.map((item) => (
          <View key={item.id} style={s.card}>
            <View style={s.iconBox}><Text>{ICONS[item.type] ?? '📌'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.actorText}>
                <Text style={s.actorName}>{item.actor_name} </Text>
                <Text style={s.actorAction}>{item.type === 'expense_added' ? 'added' : item.type.replace('_', ' ')} </Text>
                {item.description}
              </Text>
              {item.amount !== undefined && <Text style={s.amount}>{formatCurrency(item.amount)}</Text>}
              <Text style={s.date}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: '#f8fafc' },
  topBar:     { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 },
  pageTitle:  { color: '#111827', fontSize: 24, fontWeight: 'bold' },
  card:       { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  iconBox:    { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  actorText:  { color: '#111827', fontSize: 14 },
  actorName:  { fontWeight: '600' },
  actorAction:{ color: '#6b7280' },
  amount:     { color: '#6b7280', fontSize: 13, marginTop: 2 },
  date:       { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  empty:      { alignItems: 'center', marginTop: 80 },
  emptyTitle: { color: '#111827', fontWeight: 'bold', fontSize: 18 },
  emptySub:   { color: '#6b7280', fontSize: 14, marginTop: 8, textAlign: 'center' },
});
