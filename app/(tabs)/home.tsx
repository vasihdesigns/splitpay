/**
 * Dashboard — Overview of all split balances
 *
 * • Bar chart: one bar per person (green = they owe me, red = I owe them)
 * • Long-press a bar → detail popup
 * • Tap a bar → friend's full expense list
 * • Search bar to filter people
 * • Summary pills: total owed / total you owe
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Alert, TextInput, Modal,
  Pressable, Animated,
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

// ─── Vertical bar chart ──────────────────────────────────────────────────────

const CHART_H = 200;
const BAR_W   = 76;

function BarChart({
  people,
  onPress,
  onLongPress,
  t,
}: {
  people: PersonBalance[];
  onPress: (p: PersonBalance) => void;
  onLongPress: (p: PersonBalance) => void;
  t: ThemeColors;
}) {
  const maxAbs = Math.max(...people.map(p => Math.abs(p.netAmount)), 1);
  if (people.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 14, alignItems: 'flex-end' }}
    >
      {people.map((person) => {
        const isOwed    = person.netAmount > 0;
        const barColor  = isOwed ? '#16a34a' : '#dc2626';
        // Vivid green / red backgrounds so colors are clearly distinguishable
        const barBg     = isOwed ? '#4ade80' : '#f87171';
        const avatarBg  = isOwed ? '#86efac' : '#fca5a5';
        const barH      = Math.max((Math.abs(person.netAmount) / maxAbs) * CHART_H, 60);

        return (
          <TouchableOpacity
            key={person.userId}
            onPress={() => onPress(person)}
            onLongPress={() => onLongPress(person)}
            delayLongPress={400}
            activeOpacity={0.78}
            style={{ alignItems: 'center', width: BAR_W }}
          >
            {/* Bar — colored, amount inside at top */}
            <View style={{
              width: BAR_W,
              height: barH,
              borderRadius: 22,
              backgroundColor: barBg,
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: 12,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
                {Math.round(Math.abs(person.netAmount))}
              </Text>
            </View>

            {/* Avatar below bar */}
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: avatarBg,
              alignItems: 'center', justifyContent: 'center',
              marginTop: 10,
            }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: barColor }}>
                {getInitials(person.name)}
              </Text>
            </View>

            {/* Name below avatar */}
            <Text style={{ fontSize: 12, color: t.subtext, marginTop: 5, textAlign: 'center' }} numberOfLines={1}>
              {person.name.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Month picker modal ───────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function MonthPickerModal({
  visible,
  onClose,
  filterYear,
  filterMonth,
  netBalance,
  currency,
  onApply,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  filterYear: number;
  filterMonth: number;
  netBalance: number;
  currency: string;
  onApply: (year: number, month: number) => void;
  t: ThemeColors;
}) {
  const currentYear = new Date().getFullYear();
  const [pYear,  setPYear]  = useState(filterYear);
  const [pMonth, setPMonth] = useState(filterMonth);

  // Sync when reopened
  useEffect(() => {
    if (visible) { setPYear(filterYear); setPMonth(filterMonth); }
  }, [visible]);

  const years = Array.from({ length: 4 }, (_, i) => currentYear - 2 + i).filter(y => y <= currentYear);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {/* Handle bar */}
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.muted }} />
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: t.text }}>Month</Text>
          <TouchableOpacity
            onPress={onClose}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={18} color={t.subtext} />
          </TouchableOpacity>
        </View>

        {/* Year pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingBottom: 20 }}>
          {years.map(y => (
            <TouchableOpacity
              key={y}
              onPress={() => setPYear(y)}
              style={{
                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22,
                backgroundColor: pYear === y ? t.text : t.card,
                borderWidth: 1, borderColor: pYear === y ? t.text : t.border,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: pYear === y ? t.bg : t.text }}>
                {y}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Month grid */}
        <View style={{ marginHorizontal: 16, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          {[0, 1, 2, 3].map(row => (
            <View key={row} style={{ flexDirection: 'row', borderBottomWidth: row < 3 ? 1 : 0, borderBottomColor: t.border }}>
              {[0, 1, 2].map(col => {
                const mi = row * 3 + col;
                const isSel = pMonth === mi;
                return (
                  <TouchableOpacity
                    key={col}
                    onPress={() => setPMonth(mi)}
                    activeOpacity={0.75}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 20,
                      borderRightWidth: col < 2 ? 1 : 0,
                      borderRightColor: t.border,
                      backgroundColor: isSel ? t.danger : 'transparent',
                      margin: isSel ? 4 : 0,
                      borderRadius: isSel ? 14 : 0,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: isSel ? '700' : '500', color: isSel ? '#fff' : t.text }}>
                      {MONTH_NAMES[mi]}
                    </Text>
                    {isSel && (
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 3, fontWeight: '600' }}>
                        {netBalance < -0.01 ? '−' : netBalance > 0.01 ? '+' : ''}{formatCurrency(Math.abs(netBalance), currency)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        {/* Apply */}
        <TouchableOpacity
          onPress={() => { onApply(pYear, pMonth); onClose(); }}
          activeOpacity={0.85}
          style={{
            marginHorizontal: 24, marginBottom: 40, backgroundColor: t.danger,
            borderRadius: 28, paddingVertical: 16, flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Apply</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Tooltip modal ───────────────────────────────────────────────────────────

function PersonTooltip({
  person,
  onClose,
  onViewDetail,
  t,
}: {
  person: PersonBalance | null;
  onClose: () => void;
  onViewDetail: () => void;
  t: ThemeColors;
}) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (person) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.85);
      opacity.setValue(0);
    }
  }, [person]);

  if (!person) return null;

  const isOwed = person.netAmount > 0;
  const barColor = isOwed ? t.success : t.danger;

  return (
    <Modal transparent visible={!!person} onRequestClose={onClose} animationType="none">
      <Pressable style={styles.tooltipOverlay} onPress={onClose}>
        <Animated.View style={[styles.tooltipCard, { backgroundColor: t.card, transform: [{ scale }], opacity }]}>
          {/* Person header */}
          <View style={styles.tooltipHeader}>
            <View style={[styles.tooltipAvatar, { backgroundColor: isOwed ? '#d1fae5' : '#fee2e2', borderColor: barColor }]}>
              <Text style={[styles.tooltipAvatarText, { color: barColor }]}>{getInitials(person.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tooltipName, { color: t.text }]}>{person.name}</Text>
              <Text style={[styles.tooltipStatus, { color: barColor }]}>
                {isOwed ? 'owes you' : 'you owe'}
              </Text>
            </View>
            <Text style={[styles.tooltipNet, { color: barColor }]}>
              {formatCurrency(Math.abs(person.netAmount), person.currency)}
            </Text>
          </View>

          {/* Breakdown per group */}
          {person.breakdown.length > 1 && (
            <View style={[styles.tooltipBreakdown, { borderTopColor: t.border }]}>
              {person.breakdown.map((b, i) => (
                <View key={i} style={styles.tooltipBreakdownRow}>
                  <Text style={[styles.tooltipGroupName, { color: t.subtext }]} numberOfLines={1}>
                    {b.groupName}
                  </Text>
                  <Text style={[styles.tooltipGroupAmt, { color: b.amount > 0 ? t.success : t.danger }]}>
                    {b.amount > 0 ? '+' : ''}{formatCurrency(b.amount, b.currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={[styles.tooltipActions, { borderTopColor: t.border }]}>
            <TouchableOpacity style={[styles.tooltipBtn, { borderColor: t.border }]} onPress={onClose}>
              <Text style={[styles.tooltipBtnText, { color: t.subtext }]}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tooltipBtn, { backgroundColor: t.primary, borderColor: t.primary }]} onPress={onViewDetail}>
              <Text style={[styles.tooltipBtnText, { color: '#fff' }]}>View Expenses</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
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
  const [searchQuery,     setSearchQuery]     = useState('');
  const [tooltipPerson,   setTooltipPerson]   = useState<PersonBalance | null>(null);
  const [overallCurrency, setOverallCurrency] = useState('USD');
  // ── Month filter ────────────────────────────────────────────────────────────
  const [filterYear,      setFilterYear]      = useState(now.getFullYear());
  const [filterMonth,     setFilterMonth]     = useState(now.getMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  // Always keep a ref to the latest fetchBalances so useFocusEffect never gets stale
  const fetchBalancesRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => {});

  async function fetchBalances(isRefresh = false) {
    if (!user?.id) { setLoading(false); setRefreshing(false); return; }
    if (!isRefresh) setLoading(true);

    // Date range always applied (no "All time" mode)
    const dateStart = new Date(filterYear, filterMonth, 1).toISOString().split('T')[0];
    const dateEnd   = new Date(filterYear, filterMonth + 1, 0).toISOString().split('T')[0];

    try {
      // 1. My unpaid splits (what I owe)
      const { data: myUnpaid, error: e1 } = await supabase
        .from('expense_splits')
        .select('amount, expense_id')
        .eq('user_id', user.id)
        .eq('paid', false);
      if (e1) console.error('myUnpaid:', e1);

      const oweExpenseIds = myUnpaid?.map((s: any) => s.expense_id) ?? [];

      // 2. Expenses I paid for (filtered by date)
      const myExpQ = supabase.from('expenses').select('id, group_id, currency').eq('paid_by', user.id).gte('date', dateStart).lte('date', dateEnd);
      const { data: myExpenses, error: e2 } = await myExpQ;
      if (e2) console.error('myExpenses:', e2);

      const myExpenseIds = myExpenses?.map((e: any) => e.id) ?? [];
      const myExpenseMap: Record<string, any> = {};
      myExpenses?.forEach((e: any) => { myExpenseMap[e.id] = e; });

      // 3. Expense details for splits I owe (NO date filter — outstanding debts are cumulative,
      //    not restricted to the selected month. Old unpaid splits must still appear.)
      let oweExpenseMap: Record<string, any> = {};
      if (oweExpenseIds.length > 0) {
        const { data: oweExpenses, error: e3 } = await supabase
          .from('expenses')
          .select('id, paid_by, group_id, currency')
          .in('id', oweExpenseIds);
        if (e3) console.error('oweExpenses:', e3);
        oweExpenses?.forEach((e: any) => { oweExpenseMap[e.id] = e; });
      }

      // 4. Others' unpaid splits on my expenses
      let othersUnpaid: any[] = [];
      if (myExpenseIds.length > 0) {
        const { data, error: e4 } = await supabase
          .from('expense_splits')
          .select('amount, user_id, expense_id')
          .in('expense_id', myExpenseIds)
          .neq('user_id', user.id)
          .eq('paid', false);
        if (e4) console.error('othersUnpaid:', e4);
        othersUnpaid = data ?? [];
      }

      // 5. Fetch group names separately
      const allExpenseMap = { ...myExpenseMap, ...oweExpenseMap };
      const groupIds = [...new Set(
        Object.values(allExpenseMap).map((e: any) => e.group_id).filter(Boolean)
      )];
      const groupNameMap: Record<string, string> = {};
      if (groupIds.length > 0) {
        const { data: groups } = await supabase
          .from('groups').select('id, name').in('id', groupIds);
        groups?.forEach((g: any) => { groupNameMap[g.id] = g.name; });
      }

      // 6. Build per-person breakdowns
      const breakdowns: Record<string, Record<string, { amount: number; name: string; currency: string }>> = {};

      // What I owe (negative)
      for (const split of (myUnpaid ?? [])) {
        const expense = oweExpenseMap[split.expense_id];
        if (!expense || expense.paid_by === user.id) continue;
        const uid   = expense.paid_by;
        const gid   = expense.group_id ?? '__none__';
        const gname = expense.group_id ? (groupNameMap[expense.group_id] ?? 'Group') : 'Non-group';
        const cur   = expense.currency ?? 'USD';
        if (!breakdowns[uid]) breakdowns[uid] = {};
        if (!breakdowns[uid][gid]) breakdowns[uid][gid] = { amount: 0, name: gname, currency: cur };
        breakdowns[uid][gid].amount -= Number(split.amount);
      }

      // What others owe me (positive)
      for (const split of othersUnpaid) {
        const expense = myExpenseMap[split.expense_id];
        if (!expense) continue;
        const uid   = split.user_id;
        const gid   = expense.group_id ?? '__none__';
        const gname = expense.group_id ? (groupNameMap[expense.group_id] ?? 'Group') : 'Non-group';
        const cur   = expense.currency ?? 'USD';
        if (!breakdowns[uid]) breakdowns[uid] = {};
        if (!breakdowns[uid][gid]) breakdowns[uid][gid] = { amount: 0, name: gname, currency: cur };
        breakdowns[uid][gid].amount += Number(split.amount);
      }

      // 7. Fetch profile names
      const allUids = Object.keys(breakdowns);
      const nameMap: Record<string, string> = {};
      if (allUids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name').in('id', allUids);
        profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name; });
      }

      // 8. Assemble result
      let owed = 0, owe = 0;
      const result: PersonBalance[] = allUids.map((uid) => {
        const bd = breakdowns[uid];
        const breakdown: GroupBreakdown[] = Object.entries(bd)
          .map(([gid, { amount, name, currency }]) => ({ groupId: gid, groupName: name, amount, currency }))
          .filter((b) => Math.abs(b.amount) > 0.01)
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
      console.error('fetchBalances crash:', err);
      Alert.alert('Error loading balances', err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Keep ref in sync so useFocusEffect always calls the freshest version
  fetchBalancesRef.current = fetchBalances;

  useEffect(() => { if (user?.id) fetchBalances(); }, [user?.id]);
  useEffect(() => { if (user?.id) fetchBalances(); }, [filterYear, filterMonth]);
  useFocusEffect(useCallback(() => { fetchBalancesRef.current(); }, []));

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = searchQuery.trim()
    ? people.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : people;

  const active  = filtered.filter(p => Math.abs(p.netAmount) > 0.01);
  const settled = filtered.filter(p => Math.abs(p.netAmount) <= 0.01);

  const netBalance = totalOwed - totalOwe;

  function handlePersonPress(person: PersonBalance) {
    router.push({ pathname: '/friend-detail', params: { userId: person.userId, name: person.name } });
  }

  function handleLongPress(person: PersonBalance) {
    setTooltipPerson(person);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerLabel}>Split Expenses</Text>
          <Text style={s.headerTitle}>
            {netBalance > 0.01
              ? 'You are owed'
              : netBalance < -0.01
              ? 'You owe'
              : 'All settled'}
          </Text>
        </View>
      </View>

      {/* ── Net balance display ── */}
      <View style={s.balanceBig}>
        <Text style={[s.balanceBigAmt, { color: netBalance > 0.01 ? t.success : netBalance < -0.01 ? t.danger : t.subtext }]}>
          {formatCurrency(Math.abs(netBalance), overallCurrency)}
        </Text>
      </View>

      {/* ── Month filter pill ── */}
      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.filterPill, { backgroundColor: t.card, borderColor: t.border }]}
          onPress={() => setShowMonthPicker(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="calendar-outline" size={13} color={t.subtext} />
          <Text style={[s.filterPillText, { color: t.text }]}>
            {`${MONTH_FULL[filterMonth]} ${filterYear}`}
          </Text>
          <Ionicons name="chevron-expand" size={13} color={t.subtext} />
        </TouchableOpacity>

        {/* Summary pills */}
        {totalOwed > 0.01 && (
          <View style={[s.pill, { backgroundColor: t.successBg, borderColor: t.success }]}>
            <Ionicons name="arrow-down-outline" size={12} color={t.success} />
            <Text style={[s.pillText, { color: t.success }]}>+{formatCurrency(totalOwed, overallCurrency)}</Text>
          </View>
        )}
        {totalOwe > 0.01 && (
          <View style={[s.pill, { backgroundColor: t.dangerBg, borderColor: t.danger }]}>
            <Ionicons name="arrow-up-outline" size={12} color={t.danger} />
            <Text style={[s.pillText, { color: t.danger }]}>−{formatCurrency(totalOwe, overallCurrency)}</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchBalances(true); }}
            tintColor={t.primary}
          />
        }
      >
        {/* ── Search bar ── */}
        <View style={[s.searchBar, { backgroundColor: t.inputBg, borderColor: t.border }]}>
          <Ionicons name="search-outline" size={18} color={t.placeholder} />
          <TextInput
            style={[s.searchInput, { color: t.text }]}
            placeholder="Search people…"
            placeholderTextColor={t.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={t.placeholder} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 60 }} />
        ) : active.length === 0 && settled.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="checkmark-circle-outline" size={60} color={t.muted} style={{ marginBottom: 14 }} />
            <Text style={s.emptyTitle}>
              {searchQuery ? 'No results' : 'All settled up!'}
            </Text>
            <Text style={s.emptySub}>
              {searchQuery ? 'Try a different name' : 'No outstanding balances with anyone'}
            </Text>
          </View>
        ) : (
          <>
            {/* ── Bar chart ── */}
            {active.length > 0 && (
              <View style={[s.chartCard, { backgroundColor: t.card, borderColor: t.border }]}>
                <View style={s.chartHeader} />
                <BarChart
                  people={active}
                  onPress={handlePersonPress}
                  onLongPress={handleLongPress}
                  t={t}
                />
              </View>
            )}

            {/* ── Active people list ── */}
            {active.length > 0 && (
              <View style={[s.section, { backgroundColor: t.card, borderColor: t.border }]}>
                <Text style={[s.sectionTitle, { color: t.subtext }]}>OUTSTANDING</Text>
                {active.map((person, i) => (
                  <PersonRow
                    key={person.userId}
                    person={person}
                    isLast={i === active.length - 1}
                    onPress={() => handlePersonPress(person)}
                    onLongPress={() => handleLongPress(person)}
                    t={t}
                  />
                ))}
              </View>
            )}

            {/* ── Settled people ── */}
            {settled.length > 0 && (
              <View style={[s.section, { backgroundColor: t.card, borderColor: t.border, marginTop: 12 }]}>
                <Text style={[s.sectionTitle, { color: t.subtext }]}>SETTLED</Text>
                {settled.map((person, i) => (
                  <PersonRow
                    key={person.userId}
                    person={person}
                    isLast={i === settled.length - 1}
                    onPress={() => handlePersonPress(person)}
                    onLongPress={() => handleLongPress(person)}
                    t={t}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Month picker modal ── */}
      <MonthPickerModal
        visible={showMonthPicker}
        onClose={() => setShowMonthPicker(false)}
        filterYear={filterYear}
        filterMonth={filterMonth}
        netBalance={netBalance}
        currency={overallCurrency}
        onApply={(y, m) => { setFilterYear(y); setFilterMonth(m); }}
        t={t}
      />

      {/* ── Tooltip modal ── */}
      <PersonTooltip
        person={tooltipPerson}
        onClose={() => setTooltipPerson(null)}
        onViewDetail={() => {
          if (tooltipPerson) {
            setTooltipPerson(null);
            handlePersonPress(tooltipPerson);
          }
        }}
        t={t}
      />
    </SafeAreaView>
  );
}

// ─── Person row ───────────────────────────────────────────────────────────────

function PersonRow({
  person, isLast, onPress, onLongPress, t,
}: {
  person: PersonBalance; isLast: boolean;
  onPress: () => void; onLongPress: () => void; t: ThemeColors;
}) {
  const isOwed   = person.netAmount > 0;
  const barColor = isOwed ? t.success : t.danger;
  const avatarBg = isOwed ? '#d1fae5' : '#fee2e2';

  return (
    <TouchableOpacity
      style={[rowStyles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: t.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={[rowStyles.avatar, { backgroundColor: avatarBg, borderColor: barColor }]}>
        <Text style={[rowStyles.avatarText, { color: barColor }]}>{getInitials(person.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[rowStyles.name, { color: t.text }]}>{person.name}</Text>
        {person.breakdown.map((b, i) => (
          <Text key={i} style={[rowStyles.sub, { color: t.subtext }]} numberOfLines={1}>
            {b.groupName} · {b.amount > 0 ? `+${formatCurrency(b.amount, b.currency)}` : formatCurrency(b.amount, b.currency)}
          </Text>
        ))}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[rowStyles.status, { color: barColor }]}>
          {isOwed ? 'owes you' : 'you owe'}
        </Text>
        <Text style={[rowStyles.amount, { color: barColor }]}>
          {formatCurrency(Math.abs(person.netAmount), person.currency)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={t.muted} style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  avatar:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1.5 },
  avatarText: { fontWeight: '800', fontSize: 14 },
  name:       { fontWeight: '600', fontSize: 15, marginBottom: 2 },
  sub:        { fontSize: 12, marginTop: 1 },
  status:     { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  amount:     { fontWeight: '800', fontSize: 16 },
});

// ─── Static tooltip styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tooltipOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  tooltipCard:        { width: '100%', maxWidth: 360, borderRadius: 20, overflow: 'hidden', elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
  tooltipHeader:      { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14 },
  tooltipAvatar:      { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  tooltipAvatarText:  { fontWeight: '800', fontSize: 18 },
  tooltipName:        { fontWeight: '700', fontSize: 17 },
  tooltipStatus:      { fontSize: 13, fontWeight: '600', marginTop: 2 },
  tooltipNet:         { fontWeight: '800', fontSize: 20 },
  tooltipBreakdown:   { borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 12 },
  tooltipBreakdownRow:{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  tooltipGroupName:   { fontSize: 13, flex: 1, marginRight: 12 },
  tooltipGroupAmt:    { fontWeight: '700', fontSize: 13 },
  tooltipActions:     { flexDirection: 'row', borderTopWidth: 1, padding: 14, gap: 10 },
  tooltipBtn:         { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  tooltipBtnText:     { fontWeight: '700', fontSize: 14 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:       { flex: 1 },
    header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    headerLabel:  { color: t.subtext, fontSize: 13, fontWeight: '500' },
    headerTitle:  { color: t.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
    headerAddBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },

    balanceBig:    { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 2 },
    balanceBigAmt: { fontSize: 46, fontWeight: '800', letterSpacing: -1 },

    filterRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 6 },
    filterPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    filterPillText: { fontSize: 13, fontWeight: '600' },
    pill:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    pillText: { fontSize: 12, fontWeight: '700' },

    searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 15, padding: 0 },

    chartCard:   { marginHorizontal: 20, marginBottom: 12, borderRadius: 20, borderWidth: 1, paddingTop: 16, paddingBottom: 4, overflow: 'hidden' },
    chartHeader: {},
    chartTitle:  { fontWeight: '800', fontSize: 17 },

    section:      { marginHorizontal: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },

    empty:      { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
    emptyTitle: { color: t.text, fontWeight: '800', fontSize: 20, marginBottom: 8 },
    emptySub:   { color: t.subtext, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  });
}
