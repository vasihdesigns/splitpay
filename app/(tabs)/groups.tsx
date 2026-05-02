import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useGroupStore } from '@/stores/groupStore';
import { formatCurrency } from '@/lib/utils';
import { Group } from '@/types';
import { useTheme, ThemeColors } from '@/lib/theme';

interface InformalGroup {
  key:         string;    // sorted member IDs joined by ','
  memberIds:   string[];
  memberNames: string[];
  balance:     number;
  currency:    string;
  expenseCount:number;
}

function InformalGroupCard({ ig, onPress }: { ig: InformalGroup; onPress: () => void }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const displayName = ig.memberNames.length <= 3
    ? ig.memberNames.join(', ')
    : `${ig.memberNames.slice(0, 2).join(', ')} +${ig.memberNames.length - 2}`;
  const initials = ig.memberNames
    .slice(0, 3)
    .map(n => n.charAt(0).toUpperCase())
    .join('');
  return (
    <TouchableOpacity style={s.card} onPress={onPress}>
      <View style={s.cardLeft}>
        <View style={[s.iconBox, { backgroundColor: '#fef3c7' }]}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#d97706' }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{displayName}</Text>
          <Text style={s.cardSub}>{ig.expenseCount} expense{ig.expenseCount !== 1 ? 's' : ''} · informal</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 90 }}>
        {Math.abs(ig.balance) < 0.01
          ? <Text style={s.settled}>Settled ✓</Text>
          : <>
              <Text style={s.balanceLabel}>{ig.balance > 0 ? 'you are owed' : 'you owe'}</Text>
              <Text style={[s.balanceAmount, { color: ig.balance > 0 ? t.success : t.danger }]}>
                {formatCurrency(Math.abs(ig.balance), ig.currency)}
              </Text>
            </>
        }
      </View>
    </TouchableOpacity>
  );
}

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const balance = group.balance ?? 0;
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <TouchableOpacity style={s.card} onPress={onPress}>
      <View style={s.cardLeft}>
        <View style={s.iconBox}>
          <Ionicons name="people-outline" size={22} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{group.name}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 90 }}>
        {Math.abs(balance) < 0.01
          ? <Text style={s.settled}>Settled ✓</Text>
          : <>
              <Text style={s.balanceLabel}>{balance > 0 ? 'you are owed' : 'you owe'}</Text>
              <Text style={[s.balanceAmount, { color: balance > 0 ? t.success : t.danger }]}>
                {formatCurrency(Math.abs(balance), group.currency)}
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
  const [refreshing,      setRefreshing]      = useState(false);
  const [showSettled,     setShowSettled]      = useState(false);
  const [informalGroups,  setInformalGroups]   = useState<InformalGroup[]>([]);
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  async function fetchInformalGroups(userId: string) {
    // 1. All my splits — get all expense IDs I'm part of
    const { data: mySplits } = await supabase
      .from('expense_splits')
      .select('expense_id, amount, paid')
      .eq('user_id', userId);

    const myExpenseIds = (mySplits ?? []).map((s: any) => s.expense_id);
    if (!myExpenseIds.length) { setInformalGroups([]); return; }

    // 2. Only no-group expenses
    const { data: noGroupExpenses } = await supabase
      .from('expenses')
      .select('id, paid_by, currency')
      .in('id', myExpenseIds)
      .is('group_id', null);

    const noGroupIds = (noGroupExpenses ?? []).map((e: any) => e.id);
    if (!noGroupIds.length) { setInformalGroups([]); return; }

    // 3. All splits for these no-group expenses
    const { data: allSplits } = await supabase
      .from('expense_splits')
      .select('expense_id, user_id, amount, paid')
      .in('expense_id', noGroupIds);

    // 4. Group splits by expense and keep only those with 3+ participants
    const splitsByExpense: Record<string, any[]> = {};
    (allSplits ?? []).forEach((s: any) => {
      if (!splitsByExpense[s.expense_id]) splitsByExpense[s.expense_id] = [];
      splitsByExpense[s.expense_id].push(s);
    });
    const multiIds = noGroupIds.filter(id => (splitsByExpense[id]?.length ?? 0) >= 3);
    if (!multiIds.length) { setInformalGroups([]); return; }

    // 5. Collect other user IDs for name lookup
    const otherUserIds = new Set<string>();
    multiIds.forEach(id => {
      splitsByExpense[id].forEach((s: any) => {
        if (s.user_id !== userId) otherUserIds.add(s.user_id);
      });
    });
    const nameMap: Record<string, string> = {};
    if (otherUserIds.size) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name').in('id', [...otherUserIds]);
      profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'Someone'; });
    }

    // 6. Build expense lookup
    const expenseMap: Record<string, any> = {};
    (noGroupExpenses ?? []).forEach((e: any) => { expenseMap[e.id] = e; });

    // 7. Group expenses by participant set
    const groupMap: Record<string, InformalGroup> = {};
    for (const expenseId of multiIds) {
      const splits  = splitsByExpense[expenseId];
      const expense = expenseMap[expenseId];
      const memberIds = splits
        .map((s: any) => s.user_id)
        .filter((id: string) => id !== userId)
        .sort();
      const key = memberIds.join(',');

      if (!groupMap[key]) {
        groupMap[key] = {
          key,
          memberIds,
          memberNames: memberIds.map((id: string) => nameMap[id] ?? 'Someone'),
          balance: 0,
          currency: expense.currency ?? 'USD',
          expenseCount: 0,
        };
      }
      groupMap[key].expenseCount++;

      // Compute balance contribution
      if (expense.paid_by === userId) {
        splits.forEach((s: any) => {
          if (s.user_id !== userId && !s.paid) {
            groupMap[key].balance += Number(s.amount);
          }
        });
      } else {
        const mySplit = splits.find((s: any) => s.user_id === userId);
        if (mySplit && !mySplit.paid) {
          groupMap[key].balance -= Number(mySplit.amount);
        }
      }
    }

    setInformalGroups(
      Object.values(groupMap).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    );
  }

  useFocusEffect(useCallback(() => {
    if (user) {
      fetchGroups(user.id);
      fetchInformalGroups(user.id);
    }
  }, [user]));

  const active  = groups.filter((g) => Math.abs(g.balance ?? 0) > 0.01);
  const settled = groups.filter((g) => Math.abs(g.balance ?? 0) <= 0.01);

  const totalOwe  = groups.reduce((s, g) => (g.balance ?? 0) < -0.01 ? s + Math.abs(g.balance ?? 0) : s, 0);
  const totalOwed = groups.reduce((s, g) => (g.balance ?? 0) >  0.01 ? s + (g.balance ?? 0) : s, 0);
  const dominantCurrency = groups[0]?.currency ?? 'USD';

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Groups</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => router.push('/group/new')}>
          <Text style={s.newBtnText}>Create group</Text>
        </TouchableOpacity>
      </View>

      {/* Overall balance summary */}
      {!loading && (totalOwe > 0 || totalOwed > 0) && (
        <View style={s.overallRow}>
          {totalOwe > 0 && (
            <Text style={s.overallText}>
              Overall, you owe <Text style={s.overallOwe}>{formatCurrency(totalOwe, dominantCurrency)}</Text>
              {totalOwed > 0 ? '  ' : ''}
            </Text>
          )}
          {totalOwed > 0 && (
            <Text style={s.overallText}>
              {totalOwe > 0 ? 'and ' : 'Overall, '}you are owed <Text style={s.overallOwed}>{formatCurrency(totalOwed, dominantCurrency)}</Text>
            </Text>
          )}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              if (user) {
                await fetchGroups(user.id);
                await fetchInformalGroups(user.id);
              }
              setRefreshing(false);
            }}
            tintColor={t.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* ── Formal groups ── */}
            {groups.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionHeaderText}>Groups</Text>
                </View>
                {active.map((g) => (
                  <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
                ))}
                {settled.length > 0 && (
                  <View style={s.settledSection}>
                    <Text style={s.settledNote}>
                      Hiding {settled.length} settled group{settled.length !== 1 ? 's' : ''}
                    </Text>
                    <TouchableOpacity style={s.showSettledBtn} onPress={() => setShowSettled((v) => !v)}>
                      <Text style={s.showSettledText}>
                        {showSettled ? 'Hide' : `Show ${settled.length}`}
                      </Text>
                    </TouchableOpacity>
                    {showSettled && settled.map((g) => (
                      <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── Informal multi-person splits ── */}
            {informalGroups.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionHeaderText}>Informal splits</Text>
                </View>
                {informalGroups.map((ig) => (
                  <InformalGroupCard
                    key={ig.key}
                    ig={ig}
                    onPress={() => {/* navigate to informal group detail — future */}}
                  />
                ))}
              </>
            )}

            {/* ── Empty state ── */}
            {groups.length === 0 && informalGroups.length === 0 && (
              <View style={s.empty}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>👥</Text>
                <Text style={s.emptyTitle}>No groups yet</Text>
                <Text style={s.emptySub}>Create a group or add a shared expense with 3+ people</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/group/new')}>
                  <Text style={s.newBtnText}>Create First Group</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:          { flex: 1, backgroundColor: t.bg },
    topBar:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    pageTitle:       { color: t.text, fontSize: 24, fontWeight: 'bold' },
    newBtn:          { backgroundColor: t.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    newBtnText:      { color: '#ffffff', fontWeight: '600', fontSize: 14 },
    overallRow:      { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.borderStrong },
    overallText:     { color: t.subtext, fontSize: 14, lineHeight: 22 },
    overallOwe:      { color: t.danger, fontWeight: '700' },
    overallOwed:     { color: t.success, fontWeight: '700' },
    card:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    cardLeft:        { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    iconBox:         { width: 48, height: 48, borderRadius: 12, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
    cardTitle:       { color: t.text, fontWeight: 'bold', fontSize: 16 },
    cardSub:         { color: t.placeholder, fontSize: 12, marginTop: 2 },
    settled:         { color: t.placeholder, fontSize: 13, fontWeight: '500' },
    balanceLabel:    { color: t.subtext, fontSize: 11 },
    balanceAmount:   { fontWeight: 'bold', fontSize: 15, marginTop: 2 },
    settledSection:  { paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: t.borderStrong, marginTop: 8 },
    settledNote:     { color: t.subtext, fontSize: 13, marginBottom: 8 },
    showSettledBtn:  { borderWidth: 1, borderColor: t.primary, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 },
    showSettledText: { color: t.primary, fontWeight: '600', fontSize: 14 },
    sectionHeader:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
    sectionHeaderText: { color: t.subtext, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    empty:           { alignItems: 'center', marginTop: 80 },
    emptyTitle:      { color: t.text, fontWeight: 'bold', fontSize: 18 },
    emptySub:        { color: t.subtext, fontSize: 14, marginTop: 8, textAlign: 'center' },
    emptyBtn:        { marginTop: 24, backgroundColor: t.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  });
}
