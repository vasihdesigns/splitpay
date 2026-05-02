/**
 * Expenses tab — shared expense activity feed + monthly spending chart
 *
 * Shows every split expense the current user is part of.
 * No personal solo tracking — that belongs in a budgeting app.
 * Balances (who owes who) live in the Friends tab.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Alert, ActionSheetIOS, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, getExpenseIcon } from '@/lib/utils';
import { useTheme } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseRow {
  id:          string;
  description: string;
  amount:      number;       // full expense amount
  currency:    string;
  date:        string;       // "YYYY-MM-DD"
  paid_by:     string;       // user_id of payer
  payerName:   string;
  myShare:     number;       // this user's split amount
  splitCount:  number;
  groupName:   string | null;
  iDidPay:     boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short' });
}

function last6MonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(toMonthKey(d));
  }
  return keys;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const t        = useTheme();

  const [rows,       setRows]       = useState<ExpenseRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selMonth,   setSelMonth]   = useState<string>(toMonthKey(new Date()));

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchExpenses() {
    if (!user) { setLoading(false); setRefreshing(false); return; }

    // 1. My splits
    const { data: mySplits } = await supabase
      .from('expense_splits')
      .select('expense_id, amount')
      .eq('user_id', user.id);

    const expIds = (mySplits ?? []).map((s: any) => s.expense_id);
    if (!expIds.length) {
      setRows([]); setLoading(false); setRefreshing(false); return;
    }

    // 2. Expense records with group name
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, description, amount, currency, date, paid_by, group:groups(name)')
      .in('id', expIds)
      .order('date', { ascending: false });

    if (!expenses?.length) { setRows([]); setLoading(false); setRefreshing(false); return; }

    // 3. Split counts
    const { data: allSplits } = await supabase
      .from('expense_splits')
      .select('expense_id, user_id')
      .in('expense_id', expIds);

    const splitCountMap: Record<string, number> = {};
    (allSplits ?? []).forEach((s: any) => {
      splitCountMap[s.expense_id] = (splitCountMap[s.expense_id] ?? 0) + 1;
    });

    // 4. Payer names
    const payerIds = [...new Set(expenses.map((e: any) => e.paid_by).filter(Boolean))];
    const nameMap: Record<string, string> = { [user.id]: 'You' };
    if (payerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', payerIds);
      profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'Someone'; });
    }

    // 5. My share map
    const myShareMap: Record<string, number> = {};
    (mySplits ?? []).forEach((s: any) => { myShareMap[s.expense_id] = s.amount; });

    // 6. Assemble
    const result: ExpenseRow[] = expenses.map((e: any) => ({
      id:          e.id,
      description: e.description,
      amount:      e.amount,
      currency:    e.currency ?? 'USD',
      date:        e.date,
      paid_by:     e.paid_by,
      payerName:   nameMap[e.paid_by] ?? 'Someone',
      myShare:     myShareMap[e.id] ?? 0,
      splitCount:  splitCountMap[e.id] ?? 1,
      groupName:   e.group?.name ?? null,
      iDidPay:     e.paid_by === user.id,
    }));

    setRows(result);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { fetchExpenses(); }, [user]));

  async function handleDelete(expenseId: string) {
    await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
    await supabase.from('expenses').delete().eq('id', expenseId);
    setRows(prev => prev.filter(r => r.id !== expenseId));
  }

  async function handleSettleUp(expenseId: string) {
    await supabase.from('expense_splits').update({ paid: true }).eq('expense_id', expenseId);
    setRows(prev => prev.filter(r => r.id !== expenseId)); // remove settled from list
    await fetchExpenses();
  }

  function showActionSheet(e: ExpenseRow) {
    const options = ['Settle Up', 'Edit', 'Delete', 'Cancel'];
    const destructiveIndex = 2;
    const cancelIndex = 3;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex, title: e.description },
        (idx) => {
          if (idx === 0) handleSettleUp(e.id);
          if (idx === 1) router.push({ pathname: '/edit-expense', params: { expenseId: e.id } });
          if (idx === 2) confirmDelete(e);
        }
      );
    } else {
      Alert.alert(e.description, undefined, [
        { text: 'Settle Up', onPress: () => handleSettleUp(e.id) },
        { text: 'Edit', onPress: () => router.push({ pathname: '/edit-expense', params: { expenseId: e.id } }) },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(e) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function confirmDelete(e: ExpenseRow) {
    Alert.alert('Delete Expense', `Delete "${e.description}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(e.id) },
    ]);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const chartKeys    = useMemo(() => last6MonthKeys(), []);
  const dominantCur  = rows[0]?.currency ?? 'USD';

  // Monthly totals (my share) for chart
  const monthlyTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const k = r.date.slice(0, 7);
      map[k] = (map[k] ?? 0) + r.myShare;
    }
    return map;
  }, [rows]);

  const chartMax = Math.max(...chartKeys.map(k => monthlyTotals[k] ?? 0), 1);

  // Selected month rows
  const selRows    = useMemo(() => rows.filter(r => r.date.startsWith(selMonth)), [rows, selMonth]);
  const selTotal   = selRows.reduce((s, r) => s + r.myShare, 0);
  const selPaid    = selRows.filter(r => r.iDidPay).reduce((s, r) => s + r.amount, 0);
  const selSplit   = selRows.filter(r => !r.iDidPay).reduce((s, r) => s + r.myShare, 0);

  // vs previous month
  const prevKey   = (() => {
    const [y, m] = selMonth.split('-').map(Number);
    return toMonthKey(new Date(y, m - 2, 1));
  })();
  const prevTotal  = rows.filter(r => r.date.startsWith(prevKey)).reduce((s, r) => s + r.myShare, 0);
  const pctChange  = prevTotal > 0 ? ((selTotal - prevTotal) / prevTotal) * 100 : null;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchExpenses(); }}
            tintColor="#4f46e5"
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <View style={s.topBar}>
          <Text style={s.pageTitle}>Expenses</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#4f46e5" style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={56} color="#d1d5db" style={{ marginBottom: 12 }} />
            <Text style={s.emptyTitle}>No shared expenses yet</Text>
            <Text style={s.emptySub}>Add an expense and split it with friends</Text>
          </View>
        ) : (
          <>
            {/* ── Month chips ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipRow}
            >
              {chartKeys.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, selMonth === key && s.chipActive]}
                  onPress={() => setSelMonth(key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.chipText, selMonth === key && s.chipTextActive]}>
                    {new Date(
                      Number(key.split('-')[0]),
                      Number(key.split('-')[1]) - 1, 1,
                    ).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── Hero card ── */}
            <View style={s.heroCard}>
              {/* Amount + change badge */}
              <View style={s.heroTop}>
                <View>
                  <Text style={s.heroLabel}>
                    My share ·{' '}
                    {new Date(
                      Number(selMonth.split('-')[0]),
                      Number(selMonth.split('-')[1]) - 1, 1,
                    ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </Text>
                  <Text style={s.heroAmount}>{formatCurrency(selTotal, dominantCur)}</Text>
                </View>
                {pctChange !== null && (
                  <View style={[s.changeBadge, { backgroundColor: pctChange > 0 ? '#fef2f2' : '#f0fdf4' }]}>
                    <Ionicons
                      name={pctChange > 0 ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={pctChange > 0 ? '#ef4444' : '#16a34a'}
                    />
                    <Text style={[s.changePct, { color: pctChange > 0 ? '#ef4444' : '#16a34a' }]}>
                      {Math.abs(pctChange).toFixed(0)}%
                    </Text>
                  </View>
                )}
              </View>

              {/* You paid / your share split row */}
              <View style={s.heroBreakdown}>
                <View style={s.heroBreakItem}>
                  <View style={[s.heroBreakDot, { backgroundColor: '#4f46e5' }]} />
                  <View>
                    <Text style={s.heroBreakLabel}>You paid for</Text>
                    <Text style={s.heroBreakAmt}>{formatCurrency(selPaid, dominantCur)}</Text>
                  </View>
                </View>
                <View style={s.heroBreakDivider} />
                <View style={s.heroBreakItem}>
                  <View style={[s.heroBreakDot, { backgroundColor: '#f97316' }]} />
                  <View>
                    <Text style={s.heroBreakLabel}>Your share owed</Text>
                    <Text style={s.heroBreakAmt}>{formatCurrency(selSplit, dominantCur)}</Text>
                  </View>
                </View>
              </View>

              {/* Bar chart */}
              <View style={s.chart}>
                {chartKeys.map(key => {
                  const val      = monthlyTotals[key] ?? 0;
                  const barH     = chartMax > 0 ? Math.max((val / chartMax) * 52, val > 0 ? 4 : 0) : 0;
                  const isActive = key === selMonth;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={s.chartCol}
                      onPress={() => setSelMonth(key)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.chartAmt, isActive && { color: '#4f46e5', fontWeight: '700' }]}>
                        {val > 0 ? (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)) : ''}
                      </Text>
                      <View style={s.chartBarWrap}>
                        <View style={[
                          s.chartBar,
                          { height: barH },
                          isActive ? s.chartBarActive : s.chartBarInactive,
                        ]} />
                      </View>
                      <Text style={[s.chartLabel, isActive && { color: '#4f46e5', fontWeight: '700' }]}>
                        {monthLabel(key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Expense activity list ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>
                {selRows.length > 0
                  ? `${selRows.length} EXPENSE${selRows.length !== 1 ? 'S' : ''} THIS MONTH`
                  : 'ACTIVITY'}
              </Text>

              {selRows.length === 0 ? (
                <View style={s.noData}>
                  <Ionicons name="calendar-outline" size={28} color="#d1d5db" />
                  <Text style={s.noDataText}>
                    No expenses in{' '}
                    {new Date(
                      Number(selMonth.split('-')[0]),
                      Number(selMonth.split('-')[1]) - 1, 1,
                    ).toLocaleDateString('en-US', { month: 'long' })}
                  </Text>
                </View>
              ) : (
                <View style={s.listCard}>
                  {selRows.map((e, i) => {
                    const d    = new Date(e.date);
                    const mon  = d.toLocaleDateString('en-US', { month: 'short' });
                    const day  = d.getDate();
                    const icon = getExpenseIcon(e.description);
                    const last = i === selRows.length - 1;
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[s.row, !last && s.rowBorder]}
                        onPress={() => router.push({ pathname: '/expense-detail', params: { expenseId: e.id } })}
                        onLongPress={() => showActionSheet(e)}
                        delayLongPress={350}
                        activeOpacity={0.7}
                      >
                        {/* Date stamp */}
                        <View style={s.dateCol}>
                          <Text style={s.dateMon}>{mon}</Text>
                          <Text style={s.dateDay}>{day}</Text>
                        </View>

                        {/* Category icon */}
                        <View style={[s.iconBox, { backgroundColor: icon.bg }]}>
                          <Ionicons name={icon.name as any} size={18} color={icon.color} />
                        </View>

                        {/* Description + meta */}
                        <View style={s.rowBody}>
                          <Text style={s.rowDesc} numberOfLines={1}>{e.description}</Text>
                          <Text style={s.rowMeta} numberOfLines={1}>
                            {e.iDidPay ? 'You paid' : `${e.payerName} paid`}
                            {e.groupName ? ` · ${e.groupName}` : ''}
                            {e.splitCount > 1 ? ` · ${e.splitCount} people` : ''}
                          </Text>
                        </View>

                        {/* Amount */}
                        <View style={s.amtCol}>
                          <Text style={s.rowAmt}>{formatCurrency(e.myShare, e.currency)}</Text>
                          <Text style={[
                            s.rowAmtLabel,
                            { color: e.iDidPay ? '#16a34a' : '#f97316' },
                          ]}>
                            {e.iDidPay ? 'you paid' : 'your share'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/add-expense')}>
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
        <Text style={s.fabText}>Add expense</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: '#f4f5f7' },
  topBar:    { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { color: '#111827', fontSize: 26, fontWeight: '800' },

  // Chips
  chipRow:        { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive:     { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipText:       { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#fff' },

  // Hero card
  heroCard:   { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 20,
                padding: 20, shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.10, shadowRadius: 16, elevation: 5 },
  heroTop:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroLabel:  { fontSize: 13, color: '#9ca3af', fontWeight: '500', marginBottom: 4 },
  heroAmount: { fontSize: 32, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  changeBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  changePct:  { fontSize: 13, fontWeight: '700' },

  // Breakdown row
  heroBreakdown:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 20 },
  heroBreakItem:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroBreakDot:   { width: 10, height: 10, borderRadius: 5 },
  heroBreakLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  heroBreakAmt:   { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 1 },
  heroBreakDivider: { width: 1, height: 32, backgroundColor: '#e5e7eb', marginHorizontal: 12 },

  // Bar chart
  chart:           { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartCol:        { flex: 1, alignItems: 'center', gap: 4 },
  chartAmt:        { fontSize: 9, color: '#9ca3af', fontWeight: '500', height: 12 },
  chartBarWrap:    { height: 56, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  chartBar:        { width: '60%', borderRadius: 4, minHeight: 0 },
  chartBarActive:  { backgroundColor: '#4f46e5' },
  chartBarInactive:{ backgroundColor: '#e0e7ff' },
  chartLabel:      { fontSize: 10, color: '#9ca3af', fontWeight: '500' },

  // Section
  section:      { marginHorizontal: 16, marginBottom: 16 },
  sectionLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginLeft: 2 },

  // Activity list card
  listCard:  { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
               shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },

  dateCol: { width: 32, alignItems: 'center' },
  dateMon: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateDay: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 1 },

  iconBox: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  rowBody: { flex: 1 },
  rowDesc: { fontSize: 15, fontWeight: '500', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  amtCol:      { alignItems: 'flex-end' },
  rowAmt:      { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowAmtLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  // Empty / no data
  noData:     { alignItems: 'center', paddingVertical: 32, gap: 8 },
  noDataText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  empty:      { alignItems: 'center', marginTop: 80 },
  emptyTitle: { color: '#111827', fontWeight: 'bold', fontSize: 18 },
  emptySub:   { color: '#6b7280', fontSize: 14, marginTop: 8 },

  // FAB
  fab:     { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#4f46e5', borderRadius: 28,
             flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 8,
             shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
