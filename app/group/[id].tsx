import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Expense, Group } from '@/types';

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍔', transport: '🚗', accommodation: '🏨', entertainment: '🎬',
  utilities: '💡', shopping: '🛍️', health: '💊', other: '📦',
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const [group, setGroup]     = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchGroup() {
    if (!id || id === 'new') return;
    const [groupRes, expenseRes] = await Promise.all([
      supabase.from('groups').select('*, members:group_members(*, user:profiles(*))').eq('id', id).single(),
      supabase.from('expenses').select('*, payer:profiles(*), splits:expense_splits(*)').eq('group_id', id).order('date', { ascending: false }),
    ]);
    if (!groupRes.error) setGroup(groupRes.data as Group);
    if (!expenseRes.error) setExpenses(expenseRes.data as Expense[]);
    setLoading(false);
  }

  useEffect(() => { fetchGroup(); }, [id]);
  if (id === 'new') return <CreateGroupScreen />;

  if (loading) {
    return <SafeAreaView style={s.screen}><ActivityIndicator color="#4f46e5" size="large" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const myExpenses = expenses.reduce((t, e) => e.paid_by === user?.id ? t + e.amount : t, 0);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{group?.name}</Text>
        <TouchableOpacity style={s.addBtn}>
          <Text style={s.addBtnText}>+ Expense</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>
        <View style={s.statsRow}>
          {[
            { label: 'Total Spent', value: formatCurrency(expenses.reduce((s, e) => s + e.amount, 0)) },
            { label: 'You Paid',    value: formatCurrency(myExpenses) },
            { label: 'Members',     value: String(group?.members?.length ?? 0) },
          ].map((stat) => (
            <View key={stat.label} style={s.statCard}>
              <Text style={s.statLabel}>{stat.label}</Text>
              <Text style={s.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Expenses</Text>
        {expenses.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>💸</Text>
            <Text style={s.emptyTitle}>No expenses yet</Text>
            <Text style={s.emptySub}>Tap "+ Expense" to start tracking</Text>
          </View>
        ) : expenses.map((e) => (
          <View key={e.id} style={s.expenseCard}>
            <View style={s.expenseIcon}><Text>{CATEGORY_ICONS[e.category] ?? '📦'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.expenseTitle}>{e.description}</Text>
              <Text style={s.expenseSub}>{e.payer?.full_name ?? 'Unknown'} · {formatDate(e.date)}</Text>
            </View>
            <Text style={s.expenseAmount}>{formatCurrency(e.amount)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function CreateGroupScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [name, setName]     = useState('');
  const [type, setType]     = useState<'home' | 'trip' | 'couple' | 'other'>('other');
  const [loading, setLoading] = useState(false);

  const types = [
    { key: 'home' as const, label: 'Home', icon: '🏠' },
    { key: 'trip' as const, label: 'Trip', icon: '✈️' },
    { key: 'couple' as const, label: 'Couple', icon: '💑' },
    { key: 'other' as const, label: 'Other', icon: '👥' },
  ];

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Error', 'Please enter a group name'); return; }
    if (!user) return;
    setLoading(true);
    const { data: group, error } = await supabase.from('groups').insert({ name: name.trim(), type, created_by: user.id }).select().single();
    if (error) { Alert.alert('Error', error.message); setLoading(false); return; }
    await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id });
    setLoading(false);
    router.replace(`/group/${group.id}`);
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Group</Text>
        <View style={{ width: 80 }} />
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 20 }}>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Group Name</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Barcelona Trip"
            placeholderTextColor="#9ca3af"
            value={name}
            onChangeText={setName}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Group Type</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {types.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[s.typeBtn, type === t.key && s.typeBtnActive]}
                onPress={() => setType(t.key)}
              >
                <Text style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</Text>
                <Text style={[s.typeBtnLabel, type === t.key && { color: '#fff' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={s.addBtn2} onPress={handleCreate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.addBtnText}>Create Group</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#f8fafc' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 },
  back:         { color: '#4f46e5', fontSize: 17, fontWeight: '500' },
  headerTitle:  { flex: 1, color: '#111827', fontSize: 18, fontWeight: 'bold' },
  addBtn:       { backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText:   { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  statsRow:     { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard:     { flex: 1, backgroundColor: '#ffffff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  statLabel:    { color: '#9ca3af', fontSize: 11, marginBottom: 4 },
  statValue:    { color: '#111827', fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { color: '#111827', fontWeight: 'bold', fontSize: 18, marginBottom: 12 },
  emptyCard:    { backgroundColor: '#ffffff', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  emptyTitle:   { color: '#111827', fontWeight: 'bold', fontSize: 16 },
  emptySub:     { color: '#6b7280', fontSize: 13, marginTop: 4, textAlign: 'center' },
  expenseCard:  { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  expenseIcon:  { width: 40, height: 40, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  expenseTitle: { color: '#111827', fontWeight: '600', fontSize: 15 },
  expenseSub:   { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  expenseAmount:{ color: '#111827', fontWeight: 'bold', fontSize: 15 },
  label:        { color: '#374151', fontSize: 14, fontWeight: '600' },
  input:        { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827' },
  typeBtn:      { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  typeBtnActive:{ backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  typeBtnLabel: { color: '#374151', fontSize: 12, fontWeight: '600' },
  addBtn2:      { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
});
