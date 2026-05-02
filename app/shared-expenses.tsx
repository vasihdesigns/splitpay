/**
 * Shared Expenses — full list of all split expenses the user is part of
 * Navigated to by tapping the "Shared Splits" card on the Expenses tab
 */
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, getExpenseIcon } from '@/lib/utils';

interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  paid_by: string;
  myShare: number;
  splitCount: number;
}

interface MonthGroup { month: string; rows: ExpenseItem[]; }

export default function SharedExpensesScreen() {
  const router   = useRouter();
  const { user } = useAuthStore();

  const [expenses,   setExpenses]   = useState<ExpenseItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchShared(); }, []);

  async function fetchShared() {
    if (!user) { setLoading(false); return; }

    const { data: mySplits } = await supabase
      .from('expense_splits').select('expense_id, amount').eq('user_id', user.id);

    const expIds = (mySplits ?? []).map((s: any) => s.expense_id);
    if (!expIds.length) { setExpenses([]); setLoading(false); setRefreshing(false); return; }

    // Count splits per expense to find shared ones (>1 person)
    const { data: allSplits } = await supabase
      .from('expense_splits').select('expense_id').in('expense_id', expIds);

    const splitCountMap: Record<string, number> = {};
    (allSplits ?? []).forEach((s: any) => {
      splitCountMap[s.expense_id] = (splitCountMap[s.expense_id] ?? 0) + 1;
    });

    const sharedIds = expIds.filter(id => (splitCountMap[id] ?? 1) > 1);
    if (!sharedIds.length) { setExpenses([]); setLoading(false); setRefreshing(false); return; }

    const { data: expData } = await supabase
      .from('expenses')
      .select('id, description, amount, currency, date, paid_by')
      .in('id', sharedIds)
      .order('date', { ascending: false });

    if (!expData) { setLoading(false); setRefreshing(false); return; }

    const myShareMap: Record<string, number> = {};
    (mySplits ?? []).forEach((s: any) => { myShareMap[s.expense_id] = s.amount; });

    setExpenses(expData.map((e: any) => ({
      id: e.id, description: e.description, amount: e.amount,
      currency: e.currency ?? 'USD', date: e.date, paid_by: e.paid_by,
      myShare: myShareMap[e.id] ?? 0,
      splitCount: splitCountMap[e.id] ?? 1,
    })));
    setLoading(false);
    setRefreshing(false);
  }

  // Group by month
  const monthMap: Record<string, ExpenseItem[]> = {};
  const monthOrder: string[] = [];
  for (const e of expenses) {
    const key = new Date(e.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!monthMap[key]) { monthMap[key] = []; monthOrder.push(key); }
    monthMap[key].push(e);
  }
  const monthGroups: MonthGroup[] = monthOrder.map(k => ({ month: k, rows: monthMap[k] }));

  // Summary stats
  const totalShared   = expenses.reduce((s, e) => s + e.amount, 0);
  const dominantCur   = expenses[0]?.currency ?? 'USD';
  const myTotalShare  = expenses.reduce((s, e) => s + e.myShare, 0);

  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Shared Splits</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#4f46e5" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchShared(); }}
              tintColor="#4f46e5" />
          }
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* Summary banner */}
          {expenses.length > 0 && (
            <View style={s.banner}>
              <View style={s.bannerItem}>
                <Text style={s.bannerValue}>{expenses.length}</Text>
                <Text style={s.bannerLabel}>expenses</Text>
              </View>
              <View style={s.bannerDivider} />
              <View style={s.bannerItem}>
                <Text style={s.bannerValue}>{formatCurrency(totalShared, dominantCur)}</Text>
                <Text style={s.bannerLabel}>total spent</Text>
              </View>
              <View style={s.bannerDivider} />
              <View style={s.bannerItem}>
                <Text style={s.bannerValue}>{formatCurrency(myTotalShare, dominantCur)}</Text>
                <Text style={s.bannerLabel}>your share</Text>
              </View>
            </View>
          )}

          {/* Month-grouped list */}
          {monthGroups.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={48} color="#d1d5db" />
              <Text style={s.emptyText}>No shared expenses</Text>
            </View>
          ) : (
            monthGroups.map(({ month, rows }) => (
              <View key={month}>
                <Text style={s.monthHeader}>{month}</Text>
                {rows.map((e, i) => {
                  const d       = new Date(e.date);
                  const mon     = d.toLocaleDateString('en-US', { month: 'short' });
                  const day     = d.getDate();
                  const icon    = getExpenseIcon(e.description);
                  const iPaid   = e.paid_by === user?.id;
                  const others  = e.splitCount - 1;

                  return (
                    <TouchableOpacity
                      key={e.id}
                      style={[s.row, i === rows.length - 1 && s.rowLast]}
                      onPress={() => router.push({ pathname: '/expense-detail', params: { expenseId: e.id } })}
                      activeOpacity={0.7}
                    >
                      {/* Date */}
                      <View style={s.dateCol}>
                        <Text style={s.dateMon}>{mon}</Text>
                        <Text style={s.dateDay}>{day}</Text>
                      </View>

                      {/* Icon */}
                      <View style={[s.iconBox, { backgroundColor: icon.bg }]}>
                        <Ionicons name={icon.name as any} size={18} color={icon.color} />
                      </View>

                      {/* Body */}
                      <View style={s.rowBody}>
                        <Text style={s.rowDesc} numberOfLines={1}>{e.description}</Text>
                        <Text style={s.rowMeta}>
                          {iPaid ? 'You paid' : 'Someone paid'}
                          {others > 0 ? ` · ${others + 1} people` : ''}
                        </Text>
                      </View>

                      {/* Amounts */}
                      <View style={s.rowRight}>
                        <Text style={s.rowTotal}>{formatCurrency(e.amount, e.currency)}</Text>
                        <Text style={[s.rowShare, { color: iPaid ? '#16a34a' : '#ef4444' }]}>
                          {iPaid ? 'lent ' : 'owe '}{formatCurrency(e.myShare, e.currency)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: '#f4f5f7' },

  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: '#111827' },

  // Summary banner
  banner:        { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16, paddingVertical: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  bannerItem:    { flex: 1, alignItems: 'center' },
  bannerValue:   { fontSize: 16, fontWeight: '800', color: '#111827' },
  bannerLabel:   { fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: '500' },
  bannerDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#e5e7eb' },

  monthHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.3 },

  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9', gap: 12 },
  rowLast:    { borderBottomWidth: 0 },
  dateCol:    { width: 32, alignItems: 'center' },
  dateMon:    { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateDay:    { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 1 },
  iconBox:    { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBody:    { flex: 1 },
  rowDesc:    { fontSize: 15, fontWeight: '500', color: '#111827' },
  rowMeta:    { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  rowRight:   { alignItems: 'flex-end', minWidth: 90 },
  rowTotal:   { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowShare:   { fontSize: 11, fontWeight: '500', marginTop: 2 },

  empty:      { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyText:  { color: '#9ca3af', fontSize: 15 },
});
