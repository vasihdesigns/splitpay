/**
 * Dashboard — Clean overview of all split balances
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Alert, Modal, Pressable, Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, getInitials } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

interface GroupBreakdown {
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
}

interface PersonBalance {
  userId: string;
  name: string;
  netAmount: number;
  currency: string;
  breakdown: GroupBreakdown[];
}

// ─── Month names ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Greeting helper ──────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Month picker modal ───────────────────────────────────────────────────────

function MonthPickerModal({
  visible, onClose, filterYear, filterMonth, netBalance, currency, onApply, t,
}: {
  visible: boolean; onClose: () => void; filterYear: number; filterMonth: number;
  netBalance: number; currency: string; onApply: (year: number, month: number) => void; t: ThemeColors;
}) {
  const currentYear = new Date().getFullYear();
  const [pYear, setPYear] = useState(filterYear);
  const [pMonth, setPMonth] = useState(filterMonth);

  useEffect(() => {
    if (visible) { setPYear(filterYear); setPMonth(filterMonth); }
  }, [visible]);

  const years = Array.from({ length: 4 }, (_, i) => currentYear - 2 + i).filter(y => y <= currentYear);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.muted }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: t.text }}>Month</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={18} color={t.subtext} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingBottom: 20 }}>
          {years.map(y => (
            <TouchableOpacity key={y} onPress={() => setPYear(y)} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22, backgroundColor: pYear === y ? t.text : t.card, borderWidth: 1, borderColor: pYear === y ? t.text : t.border }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: pYear === y ? t.bg : t.text }}>{y}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ marginHorizontal: 16, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          {[0,1,2,3].map(row => (
            <View key={row} style={{ flexDirection: 'row', borderBottomWidth: row < 3 ? 1 : 0, borderBottomColor: t.border }}>
              {[0,1,2].map(col => {
                const mi = row * 3 + col;
                const isSel = pMonth === mi;
                return (
                  <TouchableOpacity key={col} onPress={() => setPMonth(mi)} activeOpacity={0.75} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderRightWidth: col < 2 ? 1 : 0, borderRightColor: t.border, backgroundColor: isSel ? t.primary : 'transparent', margin: isSel ? 4 : 0, borderRadius: isSel ? 14 : 0 }}>
                    <Text style={{ fontSize: 16, fontWeight: isSel ? '700' : '500', color: isSel ? '#fff' : t.text }}>{MONTH_NAMES[mi]}</Text>
                    {isSel && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 3, fontWeight: '600' }}>{netBalance < -0.01 ? '−' : netBalance > 0.01 ? '+' : ''}{formatCurrency(Math.abs(netBalance), currency)}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => { onApply(pYear, pMonth); onClose(); }} activeOpacity={0.85} style={{ marginHorizontal: 24, marginBottom: 40, backgroundColor: t.primary, borderRadius: 28, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Apply</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Tooltip modal ───────────────────────────────────────────────────────────

function PersonTooltip({ person, onClose, onViewDetail, t }: {
  person: PersonBalance | null; onClose: () => void; onViewDetail: () => void; t: ThemeColors;
}) {
  const scale   = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (person) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.85); opacity.setValue(0);
    }
  }, [person]);

  if (!person) return null;
  const isOwed = person.netAmount > 0;
  const barColor = isOwed ? t.success : t.danger;

  return (
    <Modal transparent visible={!!person} onRequestClose={onClose} animationType="none">
      <Pressable style={ttStyles.overlay} onPress={onClose}>
        <Animated.View style={[ttStyles.card, { backgroundColor: t.card, transform: [{ scale }], opacity }]}>
          <View style={ttStyles.header}>
            <View style={[ttStyles.avatar, { backgroundColor: isOwed ? '#d1fae5' : '#fee2e2', borderColor: barColor }]}>
              <Text style={[ttStyles.avatarText, { color: barColor }]}>{getInitials(person.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ttStyles.name, { color: t.text }]}>{person.name}</Text>
              <Text style={[ttStyles.status, { color: barColor }]}>{isOwed ? 'owes you' : 'you owe'}</Text>
            </View>
            <Text style={[ttStyles.net, { color: barColor }]}>{formatCurrency(Math.abs(person.netAmount), person.currency)}</Text>
          </View>
          {person.breakdown.length > 1 && (
            <View style={[ttStyles.breakdown, { borderTopColor: t.border }]}>
              {person.breakdown.map((b, i) => (
                <View key={i} style={ttStyles.breakdownRow}>
                  <Text style={[ttStyles.groupName, { color: t.subtext }]} numberOfLines={1}>{b.groupName}</Text>
                  <Text style={[ttStyles.groupAmt, { color: b.amount > 0 ? t.success : t.danger }]}>{b.amount > 0 ? '+' : ''}{formatCurrency(b.amount, b.currency)}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={[ttStyles.actions, { borderTopColor: t.border }]}>
            <TouchableOpacity style={[ttStyles.btn, { borderColor: t.border }]} onPress={onClose}>
              <Text style={[ttStyles.btnText, { color: t.subtext }]}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ttStyles.btn, { backgroundColor: t.primary, borderColor: t.primary }]} onPress={onViewDetail}>
              <Text style={[ttStyles.btnText, { color: '#fff' }]}>View Expenses</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Person row ───────────────────────────────────────────────────────────────

function PersonRow({ person, isLast, onPress, onLongPress, hideAmounts, t }: {
  person: PersonBalance; isLast: boolean; onPress: () => void;
  onLongPress: () => void; hideAmounts: boolean; t: ThemeColors;
}) {
  const isOwed   = person.netAmount > 0;
  const color    = isOwed ? t.success : t.danger;
  const avatarBg = isOwed ? '#d1fae5' : '#fee2e2';

  return (
    <TouchableOpacity
      style={[prStyles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}
      onPress={onPress} onLongPress={onLongPress} delayLongPress={400} activeOpacity={0.7}
    >
      {/* Left color bar */}
      <View style={[prStyles.leftDot, { backgroundColor: color }]} />

      {/* Avatar */}
      <View style={[prStyles.avatar, { backgroundColor: avatarBg }]}>
        <Text style={[prStyles.avatarText, { color }]}>{getInitials(person.name)}</Text>
      </View>

      {/* Name + sub */}
      <View style={{ flex: 1 }}>
        <Text style={[prStyles.name, { color: t.text }]}>{person.name}</Text>
        <Text style={[prStyles.sub, { color: t.subtext }]} numberOfLines={1}>
          {isOwed ? 'owes you' : 'you owe'} · {
            person.breakdown.length === 1
              ? person.breakdown[0].groupName
              : `${person.breakdown.length} groups`
          }
        </Text>
      </View>

      {/* Amount */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[prStyles.amount, { color }]}>
          {hideAmounts ? '••••' : formatCurrency(Math.abs(person.netAmount), person.currency)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={t.placeholder} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const t        = useTheme();
  const s        = useMemo(() => makeStyles(t), [t]);

  const now = new Date();
  const [people,          setPeople]          = useState<PersonBalance[]>([]);
  const [totalOwed,       setTotalOwed]       = useState(0);
  const [totalOwe,        setTotalOwe]        = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [tooltipPerson,   setTooltipPerson]   = useState<PersonBalance | null>(null);
  const [overallCurrency, setOverallCurrency] = useState('USD');
  const [personalTotal,   setPersonalTotal]   = useState(0);
  const [personalCurrency,setPersonalCurrency]= useState('USD');
  const [filterYear,      setFilterYear]      = useState(now.getFullYear());
  const [filterMonth,     setFilterMonth]     = useState(now.getMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [hideAmounts,     setHideAmounts]     = useState(false);
  const [showSettled,     setShowSettled]     = useState(false);

  const fetchBalancesRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => {});

  async function fetchBalances(isRefresh = false) {
    if (!user?.id) { setLoading(false); setRefreshing(false); return; }
    if (!isRefresh) setLoading(true);

    const dateStart = new Date(filterYear, filterMonth, 1).toISOString().split('T')[0];
    const dateEnd   = new Date(filterYear, filterMonth + 1, 0).toISOString().split('T')[0];

    try {
      const { data: myUnpaid } = await supabase
        .from('expense_splits').select('amount, expense_id')
        .eq('user_id', user.id).eq('paid', false);

      const oweExpenseIds = myUnpaid?.map((s: any) => s.expense_id) ?? [];

      const { data: myExpenses } = await supabase
        .from('expenses').select('id, group_id, currency')
        .eq('paid_by', user.id).gte('date', dateStart).lte('date', dateEnd);

      const myExpenseIds = myExpenses?.map((e: any) => e.id) ?? [];
      const myExpenseMap: Record<string, any> = {};
      myExpenses?.forEach((e: any) => { myExpenseMap[e.id] = e; });

      let oweExpenseMap: Record<string, any> = {};
      if (oweExpenseIds.length > 0) {
        const { data: oweExpenses } = await supabase
          .from('expenses').select('id, paid_by, group_id, currency').in('id', oweExpenseIds);
        oweExpenses?.forEach((e: any) => { oweExpenseMap[e.id] = e; });
      }

      let othersUnpaid: any[] = [];
      if (myExpenseIds.length > 0) {
        const { data } = await supabase
          .from('expense_splits').select('amount, user_id, expense_id')
          .in('expense_id', myExpenseIds).neq('user_id', user.id).eq('paid', false);
        othersUnpaid = data ?? [];
      }

      const allExpenseMap = { ...myExpenseMap, ...oweExpenseMap };
      const groupIds = [...new Set(Object.values(allExpenseMap).map((e: any) => e.group_id).filter(Boolean))];
      const groupNameMap: Record<string, string> = {};
      if (groupIds.length > 0) {
        const { data: groups } = await supabase.from('groups').select('id, name').in('id', groupIds);
        groups?.forEach((g: any) => { groupNameMap[g.id] = g.name; });
      }

      const breakdowns: Record<string, Record<string, { amount: number; name: string; currency: string }>> = {};

      for (const split of (myUnpaid ?? [])) {
        const expense = oweExpenseMap[split.expense_id];
        if (!expense || expense.paid_by === user.id) continue;
        const uid = expense.paid_by;
        const gid = expense.group_id ?? '__none__';
        const gname = expense.group_id ? (groupNameMap[expense.group_id] ?? 'Group') : 'Non-group';
        const cur = expense.currency ?? 'USD';
        if (!breakdowns[uid]) breakdowns[uid] = {};
        if (!breakdowns[uid][gid]) breakdowns[uid][gid] = { amount: 0, name: gname, currency: cur };
        breakdowns[uid][gid].amount -= Number(split.amount);
      }

      for (const split of othersUnpaid) {
        const expense = myExpenseMap[split.expense_id];
        if (!expense) continue;
        const uid = split.user_id;
        const gid = expense.group_id ?? '__none__';
        const gname = expense.group_id ? (groupNameMap[expense.group_id] ?? 'Group') : 'Non-group';
        const cur = expense.currency ?? 'USD';
        if (!breakdowns[uid]) breakdowns[uid] = {};
        if (!breakdowns[uid][gid]) breakdowns[uid][gid] = { amount: 0, name: gname, currency: cur };
        breakdowns[uid][gid].amount += Number(split.amount);
      }

      const allUids = Object.keys(breakdowns);
      const nameMap: Record<string, string> = {};
      if (allUids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', allUids);
        profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name; });
      }

      let owed = 0, owe = 0;
      const result: PersonBalance[] = allUids.map((uid) => {
        const bd = breakdowns[uid];
        const breakdown: GroupBreakdown[] = Object.entries(bd)
          .map(([gid, { amount, name, currency }]) => ({ groupId: gid, groupName: name, amount, currency }))
          .filter(b => Math.abs(b.amount) > 0.01)
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
        const net = breakdown.reduce((s, b) => s + b.amount, 0);
        const dom = breakdown[0]?.currency ?? 'USD';
        if (net > 0.01) owed += net;
        else if (net < -0.01) owe += Math.abs(net);
        return { userId: uid, name: nameMap[uid] ?? 'Someone', netAmount: net, currency: dom, breakdown };
      }).filter(p => p.breakdown.length > 0)
        .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));

      setTotalOwed(owed);
      setTotalOwe(owe);
      setPeople(result);
      setOverallCurrency(result[0]?.currency ?? 'USD');
    } catch (err: any) {
      Alert.alert('Error loading balances', err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchPersonalTotal() {
    if (!user?.id) return;
    const dateStart = new Date(filterYear, filterMonth, 1).toISOString().split('T')[0];
    const dateEnd   = new Date(filterYear, filterMonth + 1, 0).toISOString().split('T')[0];
    const { data: expenses } = await supabase
      .from('expenses').select('id, amount, currency')
      .eq('paid_by', user.id).is('group_id', null)
      .gte('date', dateStart).lte('date', dateEnd);
    if (!expenses?.length) { setPersonalTotal(0); return; }
    const ids = expenses.map((e: any) => e.id);
    const { data: splits } = await supabase.from('expense_splits').select('expense_id').in('expense_id', ids);
    const countMap: Record<string, number> = {};
    (splits ?? []).forEach((s: any) => { countMap[s.expense_id] = (countMap[s.expense_id] ?? 0) + 1; });
    const soloExpenses = expenses.filter((e: any) => countMap[e.id] === 1);
    const total = soloExpenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    setPersonalTotal(total);
    if (soloExpenses[0]) setPersonalCurrency(soloExpenses[0].currency ?? 'USD');
  }

  fetchBalancesRef.current = fetchBalances;

  useEffect(() => { if (user?.id) { fetchBalances(); fetchPersonalTotal(); } }, [user?.id]);
  useEffect(() => { if (user?.id) { fetchBalances(); fetchPersonalTotal(); } }, [filterYear, filterMonth]);
  useFocusEffect(useCallback(() => { fetchBalancesRef.current(); fetchPersonalTotal(); }, []));

  // ── Derived ────────────────────────────────────────────────────────────────

  const active  = people.filter(p => Math.abs(p.netAmount) > 0.01);
  const settled = people.filter(p => Math.abs(p.netAmount) <= 0.01);
  const netBalance = totalOwed - totalOwe;

  const firstName = (user as any)?.user_metadata?.full_name?.split(' ')[0]
    ?? (user as any)?.email?.split('@')[0]
    ?? 'there';

  // Proportion bar values
  const grandTotal = (totalOwed + totalOwe + personalTotal) || 1;
  const owedFlex   = Math.max(totalOwed    / grandTotal, totalOwed    > 0 ? 0.06 : 0);
  const oweFlex    = Math.max(totalOwe     / grandTotal, totalOwe     > 0 ? 0.06 : 0);
  const persFlex   = Math.max(personalTotal / grandTotal, personalTotal > 0 ? 0.06 : 0);
  const totalFlex  = owedFlex + oweFlex + persFlex || 1;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBalances(true); fetchPersonalTotal(); }} tintColor={t.primary} />
        }
      >

        {/* ── Top bar: greeting + actions ── */}
        <View style={s.topBar}>
          <View>
            <Text style={[s.greeting, { color: t.subtext }]}>{getGreeting()}</Text>
            <Text style={[s.greetingName, { color: t.text }]}>{firstName} 👋</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => setHideAmounts(v => !v)}
            >
              <Ionicons name={hideAmounts ? 'eye-off-outline' : 'eye-outline'} size={19} color={t.subtext} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => setShowMonthPicker(true)}
            >
              <Ionicons name="calendar-outline" size={19} color={t.subtext} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Month label ── */}
        <TouchableOpacity style={s.monthRow} onPress={() => setShowMonthPicker(true)} activeOpacity={0.7}>
          <Text style={[s.monthLabel, { color: t.subtext }]}>
            {MONTH_FULL[filterMonth]} {filterYear}
          </Text>
          <Ionicons name="chevron-down" size={13} color={t.placeholder} />
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* ── Hero balance card ── */}
            <View style={[s.heroCard, { backgroundColor: t.card, borderColor: t.border }]}>

              {/* Net balance */}
              <View style={s.heroTop}>
                <View>
                  <Text style={[s.heroLabel, { color: t.subtext }]}>Net balance</Text>
                  <Text style={[s.heroAmount, {
                    color: netBalance > 0.01 ? t.success : netBalance < -0.01 ? t.danger : t.text
                  }]}>
                    {hideAmounts ? '••••••' : (
                      (netBalance > 0.01 ? '+' : netBalance < -0.01 ? '−' : '') +
                      formatCurrency(Math.abs(netBalance), overallCurrency)
                    )}
                  </Text>
                  <Text style={[s.heroStatus, { color: t.subtext }]}>
                    {netBalance > 0.01 ? 'You are owed overall'
                      : netBalance < -0.01 ? 'You owe overall'
                      : 'All settled up! 🎉'}
                  </Text>
                </View>

                {/* Stacked summary */}
                <View style={s.heroSummaryCol}>
                  <View style={[s.summaryPill, { backgroundColor: '#f0fdf4' }]}>
                    <View style={[s.summaryDot, { backgroundColor: '#22c55e' }]} />
                    <View>
                      <Text style={[s.summaryPillLabel, { color: '#16a34a' }]}>Owed to you</Text>
                      <Text style={[s.summaryPillAmt, { color: '#16a34a' }]}>
                        {hideAmounts ? '••••' : formatCurrency(totalOwed, overallCurrency)}
                      </Text>
                    </View>
                  </View>
                  <View style={[s.summaryPill, { backgroundColor: '#fff7f7' }]}>
                    <View style={[s.summaryDot, { backgroundColor: '#f87171' }]} />
                    <View>
                      <Text style={[s.summaryPillLabel, { color: '#dc2626' }]}>You owe</Text>
                      <Text style={[s.summaryPillAmt, { color: '#dc2626' }]}>
                        {hideAmounts ? '••••' : formatCurrency(totalOwe, overallCurrency)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Proportion bar */}
              {(totalOwed > 0 || totalOwe > 0 || personalTotal > 0) && (
                <View style={s.propBarWrap}>
                  <View style={s.propBar}>
                    {totalOwed > 0 && (
                      <View style={[s.propSegment, { flex: owedFlex / totalFlex, backgroundColor: '#22c55e', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]} />
                    )}
                    {totalOwe > 0 && (
                      <View style={[s.propSegment, { flex: oweFlex / totalFlex, backgroundColor: '#f87171' }]} />
                    )}
                    {personalTotal > 0 && (
                      <View style={[s.propSegment, { flex: persFlex / totalFlex, backgroundColor: '#a78bfa', borderTopRightRadius: 8, borderBottomRightRadius: 8 }]} />
                    )}
                  </View>
                  <View style={s.propLegend}>
                    <Text style={[s.propLegendText, { color: t.placeholder }]}>
                      <Text style={{ color: '#22c55e' }}>■</Text> Owed to you{'   '}
                      <Text style={{ color: '#f87171' }}>■</Text> You owe{'   '}
                      <Text style={{ color: '#a78bfa' }}>■</Text> Personal
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── People list ── */}
            {active.length > 0 && (
              <View style={[s.section, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={s.sectionHeader}>
                  <Text style={[s.sectionTitle, { color: t.text }]}>Balances</Text>
                  <Text style={[s.sectionCount, { color: t.subtext }]}>{active.length} {active.length === 1 ? 'person' : 'people'}</Text>
                </View>
                {active.map((person, i) => (
                  <PersonRow
                    key={person.userId}
                    person={person}
                    isLast={i === active.length - 1}
                    hideAmounts={hideAmounts}
                    onPress={() => router.push({ pathname: '/friend-detail', params: { userId: person.userId, name: person.name } })}
                    onLongPress={() => setTooltipPerson(person)}
                    t={t}
                  />
                ))}
              </View>
            )}

            {/* Settled people toggle */}
            {settled.length > 0 && (
              <TouchableOpacity
                style={s.settledToggle}
                onPress={() => setShowSettled(v => !v)}
                activeOpacity={0.7}
              >
                <Ionicons name={showSettled ? 'chevron-up' : 'chevron-down'} size={14} color={t.placeholder} />
                <Text style={[s.settledToggleText, { color: t.subtext }]}>
                  {showSettled ? `Hide settled (${settled.length})` : `Show settled (${settled.length})`}
                </Text>
              </TouchableOpacity>
            )}

            {showSettled && settled.length > 0 && (
              <View style={[s.section, { backgroundColor: t.card, borderColor: t.border }]}>
                {settled.map((person, i) => (
                  <PersonRow
                    key={person.userId}
                    person={person}
                    isLast={i === settled.length - 1}
                    hideAmounts={hideAmounts}
                    onPress={() => router.push({ pathname: '/friend-detail', params: { userId: person.userId, name: person.name } })}
                    onLongPress={() => setTooltipPerson(person)}
                    t={t}
                  />
                ))}
              </View>
            )}

            {/* Empty state */}
            {active.length === 0 && settled.length === 0 && (
              <View style={s.empty}>
                <View style={[s.emptyIcon, { backgroundColor: t.card }]}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={t.success} />
                </View>
                <Text style={[s.emptyTitle, { color: t.text }]}>All settled up!</Text>
                <Text style={[s.emptySub, { color: t.subtext }]}>No outstanding balances for {MONTH_FULL[filterMonth]}.</Text>
              </View>
            )}

            {/* ── Personal spending card ── */}
            <TouchableOpacity
              style={[s.personalCard, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => router.push('/(tabs)/expenses')}
              activeOpacity={0.75}
            >
              <View style={s.personalLeft}>
                <View style={s.personalIconBox}>
                  <Ionicons name="wallet-outline" size={20} color="#7c3aed" />
                </View>
                <View>
                  <Text style={[s.personalLabel, { color: t.subtext }]}>Personal spending</Text>
                  <Text style={[s.personalMonth, { color: t.subtext }]}>{MONTH_NAMES[filterMonth]} {filterYear}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6, alignSelf: 'center' }}>
                <Text style={[s.personalAmt, { color: personalTotal > 0 ? '#7c3aed' : t.placeholder }]}>
                  {hideAmounts ? '••••' : personalTotal > 0 ? formatCurrency(personalTotal, personalCurrency) : '—'}
                </Text>
                <Ionicons name="chevron-forward" size={15} color={t.placeholder} />
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── Modals ── */}
      <MonthPickerModal
        visible={showMonthPicker} onClose={() => setShowMonthPicker(false)}
        filterYear={filterYear} filterMonth={filterMonth}
        netBalance={netBalance} currency={overallCurrency}
        onApply={(y, m) => { setFilterYear(y); setFilterMonth(m); }}
        t={t}
      />
      <PersonTooltip
        person={tooltipPerson} onClose={() => setTooltipPerson(null)}
        onViewDetail={() => {
          if (tooltipPerson) { setTooltipPerson(null); router.push({ pathname: '/friend-detail', params: { userId: tooltipPerson.userId, name: tooltipPerson.name } }); }
        }}
        t={t}
      />
    </SafeAreaView>
  );
}

// ─── Static styles ────────────────────────────────────────────────────────────

const ttStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:         { width: '100%', maxWidth: 360, borderRadius: 20, overflow: 'hidden', elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14 },
  avatar:       { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarText:   { fontWeight: '800', fontSize: 18 },
  name:         { fontWeight: '700', fontSize: 17 },
  status:       { fontSize: 13, fontWeight: '600', marginTop: 2 },
  net:          { fontWeight: '800', fontSize: 20 },
  breakdown:    { borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  groupName:    { fontSize: 13, flex: 1, marginRight: 12 },
  groupAmt:     { fontWeight: '700', fontSize: 13 },
  actions:      { flexDirection: 'row', borderTopWidth: 1, padding: 14, gap: 10 },
  btn:          { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  btnText:      { fontWeight: '700', fontSize: 14 },
});

const prStyles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  leftDot:    { width: 3, height: 36, borderRadius: 2, marginRight: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontWeight: '700', fontSize: 14 },
  name:       { fontWeight: '600', fontSize: 15, marginBottom: 2 },
  sub:        { fontSize: 12 },
  amount:     { fontWeight: '700', fontSize: 16 },
});

// ─── Theme-dependent styles ───────────────────────────────────────────────────

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1 },

    // Top bar
    topBar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    greeting:     { fontSize: 13, fontWeight: '500' },
    greetingName: { fontSize: 22, fontWeight: '800', marginTop: 2 },
    iconBtn:      { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    // Month label
    monthRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 4 },
    monthLabel:   { fontSize: 13, fontWeight: '600' },

    // Hero card
    heroCard:     { marginHorizontal: 16, borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 16, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    heroTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    heroLabel:    { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
    heroAmount:   { fontSize: 38, fontWeight: '800', letterSpacing: -1 },
    heroStatus:   { fontSize: 13, marginTop: 4, fontWeight: '500' },

    // Summary pills (right side of hero)
    heroSummaryCol:  { gap: 8, alignItems: 'flex-end' },
    summaryPill:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    summaryDot:      { width: 8, height: 8, borderRadius: 4 },
    summaryPillLabel:{ fontSize: 11, fontWeight: '600' },
    summaryPillAmt:  { fontSize: 14, fontWeight: '800', marginTop: 1 },

    // Proportion bar
    propBarWrap:  { marginTop: 4 },
    propBar:      { flexDirection: 'row', height: 8, borderRadius: 8, overflow: 'hidden', gap: 2 },
    propSegment:  {},
    propLegend:   { marginTop: 8 },
    propLegendText: { fontSize: 11, fontWeight: '500' },

    // Section (people list)
    section:       { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
    sectionTitle:  { fontSize: 15, fontWeight: '700' },
    sectionCount:  { fontSize: 13 },

    // Settled toggle
    settledToggle:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
    settledToggleText: { fontSize: 13, fontWeight: '500' },

    // Empty state
    empty:     { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 8 },
    emptySub:  { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    // Personal spending card
    personalCard:    { marginHorizontal: 16, marginTop: 4, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
    personalLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
    personalIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
    personalLabel:   { fontSize: 13, fontWeight: '600', marginBottom: 2 },
    personalMonth:   { fontSize: 11 },
    personalAmt:     { fontSize: 18, fontWeight: '800' },
  });
}
