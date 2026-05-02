import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Modal, TextInput,
} from 'react-native';

type GroupFilter = 'none' | 'outstanding' | 'you-owe' | 'owe-you';
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
  const [filter,          setFilter]          = useState<GroupFilter>('none');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
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

  const GROUP_FILTERS: { key: GroupFilter; label: string }[] = [
    { key: 'none',        label: 'None' },
    { key: 'outstanding', label: 'Groups with outstanding balances' },
    { key: 'you-owe',     label: 'Group balances you owe' },
    { key: 'owe-you',     label: 'Group balances you are owed' },
  ];

  const applyGroupFilter = (list: typeof groups) => {
    switch (filter) {
      case 'outstanding': return list.filter(g => Math.abs(g.balance ?? 0) > 0.01);
      case 'you-owe':     return list.filter(g => (g.balance ?? 0) < -0.01);
      case 'owe-you':     return list.filter(g => (g.balance ?? 0) > 0.01);
      default:            return list;
    }
  };

  const applyInformalFilter = (list: InformalGroup[]) => {
    switch (filter) {
      case 'outstanding': return list.filter(ig => Math.abs(ig.balance) > 0.01);
      case 'you-owe':     return list.filter(ig => ig.balance < -0.01);
      case 'owe-you':     return list.filter(ig => ig.balance > 0.01);
      default:            return list;
    }
  };

  const filteredGroups   = applyGroupFilter(groups);
  const filteredInformal = applyInformalFilter(informalGroups);
  const active  = filteredGroups.filter((g) => Math.abs(g.balance ?? 0) > 0.01);
  const settled = filter === 'none' ? filteredGroups.filter((g) => Math.abs(g.balance ?? 0) <= 0.01) : [];

  const totalOwe  = groups.reduce((s, g) => (g.balance ?? 0) < -0.01 ? s + Math.abs(g.balance ?? 0) : s, 0);
  const totalOwed = groups.reduce((s, g) => (g.balance ?? 0) >  0.01 ? s + (g.balance ?? 0) : s, 0);
  const dominantCurrency = groups[0]?.currency ?? 'USD';

  const [showSearch, setShowSearch] = useState(false);
  const [search,     setSearch]     = useState('');

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => setShowSearch(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="search-outline" size={22} color={t.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/group/new')} activeOpacity={0.75}>
          <Text style={s.headerAction}>Create group</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={t.placeholder} style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search groups…"
            placeholderTextColor={t.placeholder}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            autoFocus
          />
        </View>
      )}

      {/* Overall balance + filter */}
      {!loading && (totalOwe > 0 || totalOwed > 0) && (
        <View style={s.overallRow}>
          <View style={{ flex: 1 }}>
            {totalOwe > 0 && (
              <Text style={s.overallText}>
                Overall, you owe <Text style={s.overallOwe}>{formatCurrency(totalOwe, dominantCurrency)}</Text>
              </Text>
            )}
            {totalOwed > 0 && (
              <Text style={s.overallText}>
                {totalOwe > 0 ? 'and ' : 'Overall, '}you are owed{' '}
                <Text style={s.overallOwed}>{formatCurrency(totalOwed, dominantCurrency)}</Text>
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[s.filterBtn, filter !== 'none' && { backgroundColor: t.primary }]}
            onPress={() => setShowFilterSheet(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="options-outline" size={18} color={filter !== 'none' ? '#fff' : t.subtext} />
          </TouchableOpacity>
        </View>
      )}

      {/* Active filter pill */}
      {filter !== 'none' && (
        <View style={s.activeFilterRow}>
          <Text style={s.activeFilterText}>
            {GROUP_FILTERS.find(f => f.key === filter)?.label}
          </Text>
          <TouchableOpacity onPress={() => setFilter('none')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={t.primary} />
          </TouchableOpacity>
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
                {settled.length > 0 && !showSettled && (
                  <View style={s.settledSection}>
                    <Text style={s.settledNote}>
                      Hiding groups you settled up with over 7 days ago
                    </Text>
                    <TouchableOpacity style={s.showSettledBtn} onPress={() => setShowSettled(true)}>
                      <Text style={s.showSettledText}>
                        Show {settled.length} settled-up group{settled.length !== 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {showSettled && settled.map((g) => (
                  <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
                ))}
              </>
            )}

            {/* ── Informal multi-person splits ── */}
            {filteredInformal.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionHeaderText}>Informal splits</Text>
                </View>
                {filteredInformal.map((ig) => (
                  <InformalGroupCard
                    key={ig.key}
                    ig={ig}
                    onPress={() => {/* navigate to informal group detail — future */}}
                  />
                ))}
              </>
            )}

            {/* ── Empty state ── */}
            {filteredGroups.length === 0 && filteredInformal.length === 0 && (
              <View style={s.empty}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>👥</Text>
                <Text style={s.emptyTitle}>No groups yet</Text>
                <Text style={s.emptySub}>Create a group or add a shared expense with 3+ people</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/group/new')}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Create First Group</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Filter bottom sheet ── */}
      <Modal visible={showFilterSheet} transparent animationType="slide" onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setShowFilterSheet(false)}>
          <View style={s.sheetContainer}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>Set filter</Text>
              {GROUP_FILTERS.map((f, i) => (
                <TouchableOpacity
                  key={f.key}
                  style={[s.sheetOption, i < GROUP_FILTERS.length - 1 && s.sheetOptionBorder]}
                  onPress={() => { setFilter(f.key); setShowFilterSheet(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.sheetOptionText, f.key === filter && { color: t.primary }]}>{f.label}</Text>
                  {f.key === filter && <Ionicons name="checkmark" size={18} color={t.primary} />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setShowFilterSheet(false)} activeOpacity={0.7}>
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:          { flex: 1, backgroundColor: t.bg },
    topBar:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                       paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
    headerAction:    { color: t.primary, fontSize: 16, fontWeight: '600' },
    filterBtn:       { width: 36, height: 36, borderRadius: 18,
                       alignItems: 'center', justifyContent: 'center' },
    activeFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20,
                       marginTop: 8, marginBottom: 2, backgroundColor: t.primaryBg, borderRadius: 20,
                       paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
    activeFilterText:{ fontSize: 12, fontWeight: '600', color: t.primary, flexShrink: 1 },
    searchWrap:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20,
                       marginTop: 4, marginBottom: 4, backgroundColor: t.card, borderRadius: 12,
                       paddingHorizontal: 12, paddingVertical: 10,
                       borderWidth: 1, borderColor: t.border },
    searchInput:     { flex: 1, fontSize: 14, color: t.text },
    overallRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
                       paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
                       borderBottomColor: t.border },
    overallText:     { fontSize: 15, fontWeight: '600', color: t.text, lineHeight: 22 },
    overallOwe:      { color: t.danger, fontWeight: '700' },
    overallOwed:     { color: t.success, fontWeight: '700' },
    card:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                       paddingHorizontal: 20, paddingVertical: 16,
                       borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    cardLeft:        { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    iconBox:         { width: 48, height: 48, borderRadius: 12, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
    cardTitle:       { color: t.text, fontWeight: 'bold', fontSize: 16 },
    cardSub:         { color: t.placeholder, fontSize: 12, marginTop: 2 },
    settled:         { color: t.placeholder, fontSize: 13, fontWeight: '500' },
    balanceLabel:    { color: t.subtext, fontSize: 11 },
    balanceAmount:   { fontWeight: 'bold', fontSize: 15, marginTop: 2 },
    settledSection:  { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20,
                       borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, marginTop: 4 },
    settledNote:     { color: t.subtext, fontSize: 13, marginBottom: 14, textAlign: 'center' },
    showSettledBtn:  { borderWidth: 1.5, borderColor: t.primary, borderRadius: 14,
                       paddingHorizontal: 24, paddingVertical: 14, width: '100%', alignItems: 'center' },
    showSettledText: { color: t.primary, fontWeight: '600', fontSize: 15 },
    sectionHeader:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
    sectionHeaderText: { color: t.subtext, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    empty:           { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyTitle:      { color: t.text, fontWeight: 'bold', fontSize: 18 },
    emptySub:        { color: t.subtext, fontSize: 14, marginTop: 8, textAlign: 'center' },
    emptyBtn:        { marginTop: 24, backgroundColor: t.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },

    // Filter sheet
    sheetOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheetContainer:   { gap: 10, paddingHorizontal: 10, paddingBottom: 30 },
    sheet:            { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden' },
    sheetTitle:       { textAlign: 'center', paddingVertical: 14, fontSize: 13, fontWeight: '600',
                        color: t.placeholder, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    sheetOption:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 20, paddingVertical: 18 },
    sheetOptionBorder:{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    sheetOptionText:  { fontSize: 17, color: t.primary },
    sheetCancel:      { backgroundColor: t.card, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
    sheetCancelText:  { fontSize: 17, fontWeight: '600', color: t.primary },
  });
}
