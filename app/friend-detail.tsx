/**
 * Friend Detail — hero header, action pills, month-grouped expense list
 * Actions: Remind · Charts · Convert to USD · Export
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Alert, Share, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, getInitials, getExpenseIcon } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

interface ExpenseRow {
  id: string; description: string; amount: number;
  currency: string; date: string; paid_by: string;
  myShare: number; theirShare: number;
}
interface MonthGroup { month: string; rows: ExpenseRow[]; }

// ─── helpers ─────────────────────────────────────────────────────────────────

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function last6Keys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    keys.push(toMonthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function FriendDetailScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { userId, name } = useLocalSearchParams<{ userId: string; name: string }>();
  const { user } = useAuthStore();
  const t  = useTheme();
  const s  = useMemo(() => makeStyles(t), [t]);
  const cm = useMemo(() => makeCmStyles(t), [t]);

  const [expenses,    setExpenses]    = useState<ExpenseRow[]>([]);
  const [netOwed,     setNetOwed]     = useState(0);
  const [currency,    setCurrency]    = useState('USD');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [settlingUp,  setSettlingUp]  = useState(false);

  // Charts modal
  const [showCharts, setShowCharts] = useState(false);

  useEffect(() => { fetchExpenses(); }, []);

  async function fetchExpenses() {
    if (!user || !userId) { setLoading(false); return; }

    const { data: theirSplits } = await supabase
      .from('expense_splits').select('expense_id, amount, paid').eq('user_id', userId);
    const { data: mySplits } = await supabase
      .from('expense_splits').select('expense_id, amount, paid').eq('user_id', user.id);

    const theirIds  = new Set((theirSplits ?? []).map((s: any) => s.expense_id));
    const myIds     = new Set((mySplits    ?? []).map((s: any) => s.expense_id));
    const sharedIds = [...theirIds].filter(id => myIds.has(id));

    if (!sharedIds.length) { setExpenses([]); setLoading(false); setRefreshing(false); return; }

    const { data: expenseData } = await supabase
      .from('expenses').select('id, description, amount, currency, date, paid_by')
      .in('id', sharedIds).order('date', { ascending: false });

    if (!expenseData) { setLoading(false); setRefreshing(false); return; }

    const myMap:    Record<string, { amount: number; paid: boolean }> = {};
    const theirMap: Record<string, { amount: number; paid: boolean }> = {};
    (mySplits    ?? []).forEach((s: any) => { myMap[s.expense_id]    = { amount: s.amount, paid: s.paid }; });
    (theirSplits ?? []).forEach((s: any) => { theirMap[s.expense_id] = { amount: s.amount, paid: s.paid }; });

    let net = 0;
    const rows: ExpenseRow[] = expenseData.map((e: any) => {
      const myShare    = myMap[e.id]?.amount    ?? 0;
      const theirShare = theirMap[e.id]?.amount ?? 0;
      const theirPaid  = theirMap[e.id]?.paid   ?? false;
      const myPaid     = myMap[e.id]?.paid      ?? false;
      if (e.paid_by === user.id && !theirPaid) net += theirShare;
      if (e.paid_by === userId  && !myPaid)    net -= myShare;
      return { id: e.id, description: e.description, amount: e.amount,
        currency: e.currency ?? 'USD', date: e.date, paid_by: e.paid_by, myShare, theirShare };
    });

    const currencyCount: Record<string, number> = {};
    rows.forEach(r => { currencyCount[r.currency] = (currencyCount[r.currency] ?? 0) + 1; });
    const dominant = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';

    setExpenses(rows);
    setNetOwed(net);
    setCurrency(dominant);
    setLoading(false);
    setRefreshing(false);
  }

  async function handleSettleAll() {
    if (Math.abs(netOwed) < 0.01) return;
    Alert.alert('Settle up', `Mark all expenses with ${firstName} as settled?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Settle up', onPress: async () => {
        setSettlingUp(true);
        const ids = expenses.map(e => e.id);
        if (ids.length) {
          await supabase.from('expense_splits').update({ paid: true })
            .in('expense_id', ids).in('user_id', [user!.id, userId!]);
        }
        setSettlingUp(false);
        fetchExpenses();
      }},
    ]);
  }

  // ── Remind ────────────────────────────────────────────────────────────────
  async function handleRemind() {
    const balanceText = hasBalance
      ? (isOwed
        ? `You owe me ${formatCurrency(Math.abs(netOwed), currency)} on SplitPay.`
        : `I owe you ${formatCurrency(Math.abs(netOwed), currency)} on SplitPay.`)
      : `We're all settled up on SplitPay! 🎉`;

    const message = `Hey ${firstName}! 👋\n\n${balanceText}\n\nLet's settle up — SplitPay makes it easy!`;
    try {
      await Share.share({ message });
    } catch {}
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    let text = `Expenses with ${name}\n${'─'.repeat(28)}\n\n`;
    for (const { month, rows } of monthGroups) {
      text += `${month}\n`;
      for (const e of rows) {
        const d      = new Date(e.date);
        const label  = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const iPaid  = e.paid_by === user?.id;
        const side   = iPaid
          ? `you lent ${formatCurrency(e.theirShare, e.currency)}`
          : `you borrowed ${formatCurrency(e.myShare, e.currency)}`;
        text += `  ${label}  ${e.description}  (${formatCurrency(e.amount, e.currency)}) — ${side}\n`;
      }
      text += '\n';
    }
    text += hasBalance
      ? `Balance: ${isOwed ? `${firstName} owes you` : `You owe ${firstName}`} ${formatCurrency(Math.abs(netOwed), currency)}`
      : 'Balance: All settled up ✓';
    try { await Share.share({ message: text }); } catch {}
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const firstName  = (name ?? '').split(' ')[0];
  const isOwed     = netOwed > 0;
  const hasBalance = Math.abs(netOwed) > 0.01;

  const monthMap:   Record<string, ExpenseRow[]> = {};
  const monthOrder: string[] = [];
  for (const e of expenses) {
    const key = new Date(e.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!monthMap[key]) { monthMap[key] = []; monthOrder.push(key); }
    monthMap[key].push(e);
  }
  const monthGroups: MonthGroup[] = monthOrder.map(k => ({ month: k, rows: monthMap[k] }));

  // monthly chart data
  const chartKeys = useMemo(() => last6Keys(), []);
  const monthlyData = useMemo(() => {
    const map: Record<string, { lent: number; borrowed: number }> = {};
    for (const e of expenses) {
      const k = e.date.slice(0, 7);
      if (!map[k]) map[k] = { lent: 0, borrowed: 0 };
      if (e.paid_by === user?.id) map[k].lent     += e.theirShare;
      else                        map[k].borrowed += e.myShare;
    }
    return map;
  }, [expenses]);
  const chartMax = Math.max(
    ...chartKeys.map(k => Math.max(monthlyData[k]?.lent ?? 0, monthlyData[k]?.borrowed ?? 0)), 1,
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { backgroundColor: t.bg }]}>

      {/* Hero */}
      <View style={[s.hero, { paddingTop: insets.top + 6 }]}>
        <View style={s.heroNav}>
          <TouchableOpacity onPress={() => router.back()} style={s.heroNavBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.heroNavBtn}>
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.heroBody}>
          <View style={s.heroAvatar}>
            <Text style={s.heroAvatarText}>{getInitials(name ?? '')}</Text>
          </View>
          <Text style={s.heroName}>{name}</Text>
          {!loading && (
            hasBalance ? (
              <Text style={[s.heroBalance, { color: isOwed ? '#bbf7d0' : '#fca5a5' }]}>
                {isOwed ? `${firstName} owes you ` : `You owe ${firstName} `}
                {formatCurrency(Math.abs(netOwed), currency)}
              </Text>
            ) : (
              <Text style={s.heroBalance}>You're all settled up</Text>
            )
          )}
        </View>
      </View>

      {/* Action pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.actionRow} contentContainerStyle={s.actionRowContent}>
        {hasBalance && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: isOwed ? t.success : t.danger, borderColor: 'transparent' }]}
            onPress={handleSettleAll} disabled={settlingUp} activeOpacity={0.8}>
            {settlingUp
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[s.actionBtnText, { color: '#fff' }]}>Settle up</Text>}
          </TouchableOpacity>
        )}

        {/* Remind */}
        <TouchableOpacity style={s.actionBtn} onPress={handleRemind} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={13} color={t.text} style={{ marginRight: 4 }} />
          <Text style={s.actionBtnText}>Remind</Text>
        </TouchableOpacity>

        {/* Charts */}
        <TouchableOpacity style={s.actionBtn} onPress={() => setShowCharts(true)} activeOpacity={0.7}>
          <Ionicons name="bar-chart-outline" size={13} color={t.text} style={{ marginRight: 4 }} />
          <Text style={s.actionBtnText}>Charts</Text>
        </TouchableOpacity>

        {/* Export */}
        <TouchableOpacity style={s.actionBtn} onPress={handleExport} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={13} color={t.text} style={{ marginRight: 4 }} />
          <Text style={s.actionBtnText}>Export</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Expense list */}
      {loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: 60 }} />
      ) : expenses.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="receipt-outline" size={48} color={t.muted} />
          <Text style={s.emptyText}>No shared expenses yet</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchExpenses(); }} tintColor={t.primary} />}
          contentContainerStyle={{ paddingBottom: 100 }}>
          {monthGroups.map(({ month, rows }) => (
            <View key={month}>
              <Text style={s.monthHeader}>{month}</Text>
              {rows.map(e => {
                const d      = new Date(e.date);
                const mon    = d.toLocaleDateString('en-US', { month: 'short' });
                const day    = d.getDate();
                const icon   = getExpenseIcon(e.description);
                const iPaid  = e.paid_by === user?.id;
                const lent     = iPaid   ? e.theirShare : 0;
                const borrowed = !iPaid  ? e.myShare    : 0;
                return (
                  <TouchableOpacity key={e.id} style={s.expRow}
                    onPress={() => router.push({ pathname: '/expense-detail', params: { expenseId: e.id, friendId: userId, friendName: name } })}
                    activeOpacity={0.7}>
                    <View style={s.expDate}>
                      <Text style={s.expDateMon}>{mon}</Text>
                      <Text style={s.expDateDay}>{day}</Text>
                    </View>
                    <View style={[s.expIcon, { backgroundColor: icon.bg }]}>
                      <Ionicons name={icon.name as any} size={18} color={icon.color} />
                    </View>
                    <View style={s.expBody}>
                      <Text style={s.expDesc} numberOfLines={1}>{e.description}</Text>
                      <Text style={s.expMeta}>
                        {iPaid ? 'You paid' : `${firstName} paid`}{' '}{formatCurrency(e.amount, e.currency)}
                      </Text>
                    </View>
                    <View style={s.expRight}>
                      {lent > 0 && (<>
                        <Text style={s.expAmtLabel}>you lent</Text>
                        <Text style={[s.expAmt, { color: t.success }]}>{formatCurrency(lent, e.currency)}</Text>
                      </>)}
                      {borrowed > 0 && (<>
                        <Text style={s.expAmtLabel}>you borrowed</Text>
                        <Text style={[s.expAmt, { color: t.danger }]}>{formatCurrency(borrowed, e.currency)}</Text>
                      </>)}
                      {lent === 0 && borrowed === 0 && (
                        <Text style={[s.expAmtLabel, { color: t.placeholder }]}>settled</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/add-expense')}>
        <Ionicons name="receipt-outline" size={20} color="#fff" />
        <Text style={s.fabText}>Add expense</Text>
      </TouchableOpacity>

      {/* ── Charts Modal ── */}
      <Modal visible={showCharts} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowCharts(false)}>
        <View style={cm.screen}>
          {/* Header */}
          <View style={cm.header}>
            <Text style={cm.title}>Spending with {firstName}</Text>
            <TouchableOpacity onPress={() => setShowCharts(false)} style={cm.closeBtn}>
              <Ionicons name="close" size={22} color={t.subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
            {/* Net summary */}
            <View style={cm.summaryCard}>
              <View style={cm.summaryItem}>
                <Text style={cm.summaryLabel}>Total you lent</Text>
                <Text style={[cm.summaryAmt, { color: t.success }]}>
                  {formatCurrency(expenses.filter(e => e.paid_by === user?.id).reduce((s, e) => s + e.theirShare, 0), currency)}
                </Text>
              </View>
              <View style={cm.summaryDivider} />
              <View style={cm.summaryItem}>
                <Text style={cm.summaryLabel}>Total you borrowed</Text>
                <Text style={[cm.summaryAmt, { color: t.danger }]}>
                  {formatCurrency(expenses.filter(e => e.paid_by !== user?.id).reduce((s, e) => s + e.myShare, 0), currency)}
                </Text>
              </View>
            </View>

            {/* Legend */}
            <View style={cm.legend}>
              <View style={cm.legendItem}>
                <View style={[cm.legendDot, { backgroundColor: t.success }]} />
                <Text style={cm.legendText}>You lent</Text>
              </View>
              <View style={cm.legendItem}>
                <View style={[cm.legendDot, { backgroundColor: t.danger }]} />
                <Text style={cm.legendText}>You borrowed</Text>
              </View>
            </View>

            {/* Bar chart */}
            <View style={cm.chart}>
              {chartKeys.map(key => {
                const lent     = monthlyData[key]?.lent     ?? 0;
                const borrowed = monthlyData[key]?.borrowed ?? 0;
                const lentH    = chartMax > 0 ? Math.max((lent     / chartMax) * 100, lent     > 0 ? 4 : 0) : 0;
                const borrowH  = chartMax > 0 ? Math.max((borrowed / chartMax) * 100, borrowed > 0 ? 4 : 0) : 0;
                return (
                  <View key={key} style={cm.chartCol}>
                    <View style={cm.chartBars}>
                      <View style={{ width: 10, height: lentH,    backgroundColor: t.success, borderRadius: 3 }} />
                      <View style={{ width: 10, height: borrowH,  backgroundColor: t.danger, borderRadius: 3 }} />
                    </View>
                    <Text style={cm.chartLabel}>{monthLabel(key)}</Text>
                  </View>
                );
              })}
            </View>

            {/* No data note */}
            {chartKeys.every(k => !monthlyData[k]) && (
              <Text style={{ color: t.placeholder, textAlign: 'center', fontSize: 14 }}>
                No expense data in the last 6 months
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },

  // hero keeps fixed teal brand color regardless of scheme
  hero:           { backgroundColor: '#0d9488', paddingHorizontal: 16, paddingBottom: 28 },
  heroNav:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heroNavBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  heroBody:       { alignItems: 'center', gap: 6 },
  heroAvatar:     { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  heroAvatarText: { color: '#fff', fontWeight: '800', fontSize: 26 },
  heroName:       { color: '#fff', fontSize: 22, fontWeight: '700' },
  heroBalance:    { color: '#ccfbf1', fontSize: 14, fontWeight: '500', marginTop: 2 },

  actionRow:        { backgroundColor: t.card, maxHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  actionRowContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.muted, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  actionBtnText:    { fontSize: 13, fontWeight: '500', color: t.text },

  monthHeader: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 6, fontSize: 13, fontWeight: '700', color: t.subtext, letterSpacing: 0.2 },

  expRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  expDate:    { width: 36, alignItems: 'center', marginRight: 10 },
  expDateMon: { fontSize: 11, color: t.placeholder, textTransform: 'uppercase', letterSpacing: 0.5 },
  expDateDay: { fontSize: 18, fontWeight: '600', color: t.text, marginTop: 1 },
  expIcon:    { width: 40, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  expBody:    { flex: 1, marginRight: 8 },
  expDesc:    { fontSize: 15, fontWeight: '500', color: t.text },
  expMeta:    { fontSize: 12, color: t.placeholder, marginTop: 2 },
  expRight:   { alignItems: 'flex-end', minWidth: 92 },
  expAmtLabel:{ fontSize: 11, color: t.subtext, fontWeight: '500' },
  expAmt:     { fontSize: 15, fontWeight: '700', marginTop: 2 },

  empty:     { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { color: t.placeholder, fontSize: 15 },

  fab:     { position: 'absolute', bottom: 24, right: 20, backgroundColor: '#0d9488', borderRadius: 28, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 8, shadowColor: '#0d9488', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});}

function makeCmStyles(t: ThemeColors) { return StyleSheet.create({
  screen:  { flex: 1, backgroundColor: t.bg },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
             paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
             borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, backgroundColor: t.card },
  title:   { fontSize: 18, fontWeight: '700', color: t.text },
  closeBtn:{ padding: 4 },

  summaryCard:    { flexDirection: 'row', backgroundColor: t.card, borderRadius: 16, padding: 16,
                   shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryLabel:   { fontSize: 12, color: t.placeholder, fontWeight: '500', marginBottom: 6 },
  summaryAmt:     { fontSize: 18, fontWeight: '700' },
  summaryDivider: { width: 1, backgroundColor: t.border, marginHorizontal: 8 },

  legend:     { flexDirection: 'row', gap: 20, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, color: t.text, fontWeight: '500' },

  chart:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8,
              backgroundColor: t.card, borderRadius: 16, padding: 16,
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  chartCol: { flex: 1, alignItems: 'center', gap: 6 },
  chartBars:{ height: 100, flexDirection: 'row', alignItems: 'flex-end', gap: 2, justifyContent: 'center' },
  chartLabel:{ fontSize: 11, color: t.placeholder, fontWeight: '500' },
});}
