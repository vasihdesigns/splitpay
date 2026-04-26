import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/lib/utils';

export default function HomeScreen() {
  const { user } = useAuthStore();
  const [totalOwed, setTotalOwed] = useState(0);
  const [totalOwe, setTotalOwe]   = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  async function fetchBalances() {
    if (!user) return;
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*, expense:expenses(paid_by, amount)')
      .eq('user_id', user.id)
      .eq('paid', false);
    if (!error && data) {
      let owed = 0, owe = 0;
      for (const split of data) {
        const paidBy = split.expense?.paid_by;
        if (!paidBy || paidBy === user.id) continue;
        owe += split.amount;
      }
      setTotalOwed(owed);
      setTotalOwe(owe);
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchBalances(); }, [user]);
  const net = totalOwed - totalOwe;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBalances(); }} tintColor="#4f46e5" />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.greeting}>Welcome back,</Text>
          <Text style={s.name}>{user?.full_name ?? 'User'} 👋</Text>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>NET BALANCE</Text>
          <Text style={s.heroAmount}>{net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net))}</Text>
          <Text style={s.heroSub}>{net >= 0 ? 'Overall you are owed' : 'Overall you owe'}</Text>
        </View>

        {/* Balance Cards */}
        <View style={s.row}>
          <View style={s.card}>
            <Text style={s.cardLabel}>YOU ARE OWED</Text>
            <Text style={[s.cardAmount, { color: '#16a34a' }]}>{formatCurrency(totalOwed)}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>YOU OWE</Text>
            <Text style={[s.cardAmount, { color: '#dc2626' }]}>{formatCurrency(totalOwe)}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.row}>
            <TouchableOpacity style={[s.action, { backgroundColor: '#4f46e5' }]} onPress={() => router.push('/group/new')}>
              <Text style={{ fontSize: 24, marginBottom: 4 }}>➕</Text>
              <Text style={[s.actionText, { color: '#fff' }]}>New Group</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.action, s.actionOutline]} onPress={() => router.push('/(tabs)/groups')}>
              <Text style={{ fontSize: 24, marginBottom: 4 }}>💸</Text>
              <Text style={s.actionText}>Add Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.action, s.actionOutline]} onPress={() => router.push('/(tabs)/activity')}>
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📊</Text>
              <Text style={s.actionText}>Activity</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Balances */}
        <View style={[s.section, { paddingBottom: 32 }]}>
          <Text style={s.sectionTitle}>Balances</Text>
          {loading ? <ActivityIndicator color="#4f46e5" /> : (
            <View style={s.emptyCard}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>🎉</Text>
              <Text style={s.emptyTitle}>All settled up!</Text>
              <Text style={s.emptySubtitle}>No outstanding balances</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#f8fafc' },
  header:       { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  greeting:     { color: '#6b7280', fontSize: 14 },
  name:         { color: '#111827', fontSize: 24, fontWeight: 'bold' },
  hero:         { marginHorizontal: 24, marginTop: 16, marginBottom: 16, backgroundColor: '#4f46e5', borderRadius: 20, padding: 24 },
  heroLabel:    { color: '#c7d2fe', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  heroAmount:   { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  heroSub:      { color: '#c7d2fe', fontSize: 13, marginTop: 4 },
  row:          { flexDirection: 'row', paddingHorizontal: 24, gap: 12, marginBottom: 8 },
  card:         { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  cardLabel:    { color: '#6b7280', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  cardAmount:   { fontSize: 20, fontWeight: 'bold' },
  section:      { paddingHorizontal: 24, marginTop: 16 },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  action:       { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center' },
  actionOutline:{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#f1f5f9' },
  actionText:   { color: '#374151', fontSize: 12, fontWeight: '600' },
  emptyCard:    { backgroundColor: '#ffffff', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  emptyTitle:   { color: '#111827', fontWeight: 'bold', fontSize: 16 },
  emptySubtitle:{ color: '#6b7280', fontSize: 13, marginTop: 4 },
});
