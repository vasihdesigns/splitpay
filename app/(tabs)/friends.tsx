/**
 * Friends tab — list every person you share expenses with,
 * showing their current net balance.
 *
 * • Tap a person → friend-detail page
 * • Settle up button on each row
 * • Search bar
 * • Add friends via the + button
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
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

// ── Single friend row ─────────────────────────────────────────────────────────

function FriendRow({
  person,
  onPress,
  onSettle,
  t,
}: {
  person: PersonBalance;
  onPress: () => void;
  onSettle: () => void;
  t: ThemeColors;
}) {
  const isOwed   = person.netAmount > 0.01;
  const isOwe    = person.netAmount < -0.01;
  const settled  = !isOwed && !isOwe;

  const avatarBg    = isOwed ? '#d1fae5' : isOwe ? '#fee2e2' : t.muted;
  const avatarColor = isOwed ? t.success  : isOwe ? t.danger  : t.placeholder;
  const amtColor    = isOwed ? t.success  : isOwe ? t.danger  : t.placeholder;

  return (
    <TouchableOpacity style={styles(t).row} onPress={onPress} activeOpacity={0.72}>
      {/* Avatar */}
      <View style={[styles(t).avatar, { backgroundColor: avatarBg, borderColor: avatarColor }]}>
        <Text style={[styles(t).avatarText, { color: avatarColor }]}>
          {getInitials(person.name)}
        </Text>
      </View>

      {/* Name + breakdown hint */}
      <View style={{ flex: 1 }}>
        <Text style={styles(t).name} numberOfLines={1}>{person.name}</Text>
        {person.breakdown.length > 0 && (
          <Text style={styles(t).sub} numberOfLines={1}>
            {person.breakdown.map(b => b.groupName).join(', ')}
          </Text>
        )}
      </View>

      {/* Balance + settle button */}
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {settled ? (
          <Text style={[styles(t).amtText, { color: t.placeholder }]}>Settled</Text>
        ) : (
          <>
            <Text style={[styles(t).amtText, { color: amtColor }]}>
              {isOwed ? '+' : '−'}{formatCurrency(Math.abs(person.netAmount), person.currency)}
            </Text>
            <Text style={[styles(t).amtSub, { color: amtColor }]}>
              {isOwed ? 'owes you' : 'you owe'}
            </Text>
          </>
        )}
        {!settled && (
          <TouchableOpacity
            style={[styles(t).settleBtn, { borderColor: amtColor }]}
            onPress={onSettle}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[styles(t).settleBtnText, { color: amtColor }]}>Settle</Text>
          </TouchableOpacity>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={t.muted} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const t        = useTheme();
  const s        = useMemo(() => styles(t), [t]);

  const [people,     setPeople]     = useState<PersonBalance[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchBalancesRef = useRef<(isRefresh?: boolean) => Promise<void>>(async () => {});

  async function fetchBalances(isRefresh = false) {
    if (!user?.id) { setLoading(false); setRefreshing(false); return; }
    if (!isRefresh) setLoading(true);

    try {
      // 1. All my splits (any status) to discover expense IDs I'm part of
      const { data: myAllSplits } = await supabase
        .from('expense_splits')
        .select('expense_id, amount, paid')
        .eq('user_id', user.id);

      const allMyExpenseIds = (myAllSplits ?? []).map((s: any) => s.expense_id);
      if (!allMyExpenseIds.length) {
        setPeople([]); setLoading(false); setRefreshing(false); return;
      }

      // 2. Only direct (no group_id) expenses — group splits belong in Groups tab
      const { data: directExpenses } = await supabase
        .from('expenses')
        .select('id, paid_by, currency')
        .in('id', allMyExpenseIds)
        .is('group_id', null);

      const directIds = (directExpenses ?? []).map((e: any) => e.id);
      if (!directIds.length) {
        setPeople([]); setLoading(false); setRefreshing(false); return;
      }

      // 3. All splits for these direct expenses (to count participants)
      const { data: allSplits } = await supabase
        .from('expense_splits')
        .select('expense_id, user_id, amount, paid')
        .in('expense_id', directIds);

      // 4. Keep only 1-on-1 expenses (exactly 2 splits total)
      const splitCountMap: Record<string, number> = {};
      (allSplits ?? []).forEach((s: any) => {
        splitCountMap[s.expense_id] = (splitCountMap[s.expense_id] ?? 0) + 1;
      });
      const oneOnOneIds = new Set(directIds.filter(id => splitCountMap[id] === 2));

      if (!oneOnOneIds.size) {
        setPeople([]); setLoading(false); setRefreshing(false); return;
      }

      // 5. Build expense lookup for 1-on-1 expenses
      const expenseMap: Record<string, any> = {};
      (directExpenses ?? []).forEach((e: any) => {
        if (oneOnOneIds.has(e.id)) expenseMap[e.id] = e;
      });

      // 6. Compute per-person net balance from unpaid splits only
      const balances: Record<string, { amount: number; currency: string }> = {};

      for (const split of (allSplits ?? [])) {
        if (!oneOnOneIds.has(split.expense_id)) continue;
        if (split.paid) continue;
        const expense = expenseMap[split.expense_id];
        if (!expense) continue;

        if (split.user_id === user.id) {
          // I owe the payer my share
          const uid = expense.paid_by;
          if (uid === user.id) continue;
          if (!balances[uid]) balances[uid] = { amount: 0, currency: expense.currency ?? 'USD' };
          balances[uid].amount -= Number(split.amount);
        } else if (expense.paid_by === user.id) {
          // This person owes me their share
          const uid = split.user_id;
          if (!balances[uid]) balances[uid] = { amount: 0, currency: expense.currency ?? 'USD' };
          balances[uid].amount += Number(split.amount);
        }
      }

      // 7. Profile names
      const allUids = Object.keys(balances);
      const nameMap: Record<string, string> = {};
      if (allUids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name').in('id', allUids);
        profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'Someone'; });
      }

      // 8. Assemble — no group breakdown needed for direct 1-on-1 friends
      const result: PersonBalance[] = allUids.map((uid) => ({
        userId:    uid,
        name:      nameMap[uid] ?? 'Someone',
        netAmount: balances[uid].amount,
        currency:  balances[uid].currency,
        breakdown: [],
      }))
        .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));

      setPeople(result);
    } catch (err: any) {
      Alert.alert('Error loading friends', err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  fetchBalancesRef.current = fetchBalances;

  useEffect(() => { if (user?.id) fetchBalances(); }, [user?.id]);
  useFocusEffect(useCallback(() => { fetchBalancesRef.current(); }, []));

  // ── derived ────────────────────────────────────────────────────────────────

  const filtered = search.trim()
    ? people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : people;

  const active  = filtered.filter(p => Math.abs(p.netAmount) > 0.01);
  const settled = filtered.filter(p => Math.abs(p.netAmount) <= 0.01);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Friends</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/add-friends')} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={t.placeholder} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search friends…"
          placeholderTextColor={t.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBalances(true); }}
              tintColor={t.primary}
            />
          }
        >
          {/* Outstanding */}
          {active.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Outstanding</Text>
              <View style={s.card}>
                {active.map((p, i) => (
                  <View key={p.userId}>
                    <FriendRow
                      person={p}
                      t={t}
                      onPress={() =>
                        router.push({ pathname: '/friend-detail', params: { userId: p.userId, name: p.name } })
                      }
                      onSettle={() =>
                        router.push({ pathname: '/settle-up', params: { friendId: p.userId, friendName: p.name } })
                      }
                    />
                    {i < active.length - 1 && <View style={s.divider} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Settled */}
          {settled.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Settled up</Text>
              <View style={s.card}>
                {settled.map((p, i) => (
                  <View key={p.userId}>
                    <FriendRow
                      person={p}
                      t={t}
                      onPress={() =>
                        router.push({ pathname: '/friend-detail', params: { userId: p.userId, name: p.name } })
                      }
                      onSettle={() => {}}
                    />
                    {i < settled.length - 1 && <View style={s.divider} />}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Empty */}
          {active.length === 0 && settled.length === 0 && (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="person-outline" size={40} color={t.primary} />
              </View>
              <Text style={s.emptyTitle}>
                {search.trim() ? 'No matching friends' : 'No friends yet'}
              </Text>
              <Text style={s.emptySub}>
                {search.trim()
                  ? 'Try a different name'
                  : 'Add a friend or create a shared expense to get started'}
              </Text>
              {!search.trim() && (
                <TouchableOpacity
                  style={s.emptyBtn}
                  onPress={() => router.push('/add-friends')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={s.emptyBtnText}>Add a Friend</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function styles(t: ThemeColors) {
  return StyleSheet.create({
    screen:       { flex: 1 },

    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
    title:        { fontSize: 28, fontWeight: '800', color: t.text },
    addBtn:       { width: 38, height: 38, borderRadius: 19, backgroundColor: t.primary,
                    alignItems: 'center', justifyContent: 'center' },

    searchWrap:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20,
                    marginTop: 12, marginBottom: 4, backgroundColor: t.card, borderRadius: 12,
                    paddingHorizontal: 12, paddingVertical: 10,
                    borderWidth: 1, borderColor: t.border },
    searchInput:  { flex: 1, fontSize: 14, color: t.text },

    section:      { marginTop: 20, marginHorizontal: 16 },
    sectionLabel: { fontSize: 13, fontWeight: '600', color: t.subtext,
                    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
    card:         { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden',
                    borderWidth: 1, borderColor: t.border },
    divider:      { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 72 },

    row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                    paddingVertical: 14, gap: 12 },
    avatar:       { width: 44, height: 44, borderRadius: 22, alignItems: 'center',
                    justifyContent: 'center', borderWidth: 1.5 },
    avatarText:   { fontSize: 14, fontWeight: '800' },
    name:         { fontSize: 15, fontWeight: '600', color: t.text },
    sub:          { fontSize: 12, color: t.subtext, marginTop: 2 },
    amtText:      { fontSize: 15, fontWeight: '700' },
    amtSub:       { fontSize: 11, marginTop: -2 },
    settleBtn:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
    settleBtnText:{ fontSize: 11, fontWeight: '700' },

    empty:        { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyIcon:    { width: 80, height: 80, borderRadius: 40, backgroundColor: t.primaryBg,
                    alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle:   { fontSize: 18, fontWeight: '700', color: t.text, marginBottom: 8 },
    emptySub:     { fontSize: 14, color: t.subtext, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    emptyBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: t.primary,
                    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
    emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
}
