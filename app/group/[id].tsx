import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, StyleSheet, RefreshControl, Share,
  Animated, PanResponder,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import { Expense, Group } from '@/types';
import { useTheme, ThemeColors } from '@/lib/theme';

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍔', transport: '🚗', accommodation: '🏨', entertainment: '🎬',
  utilities: '💡', shopping: '🛍️', health: '💊', other: '📦',
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const cg = useMemo(() => makeCgStyles(t), [t]);
  const [group, setGroup]           = useState<Group | null>(null);
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchGroup() {
    if (!id || id === 'new') { setLoading(false); return; }
    const [groupRes, expenseRes] = await Promise.all([
      supabase.from('groups').select('*, members:group_members(*, user:profiles(*))').eq('id', id).single(),
      supabase.from('expenses').select('*, payer:profiles(*), splits:expense_splits(*)').eq('group_id', id).order('date', { ascending: false }),
    ]);
    if (!groupRes.error) setGroup(groupRes.data as Group);
    if (!expenseRes.error) setExpenses(expenseRes.data as Expense[]);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { fetchGroup(); }, [id]));
  if (id === 'new') return <CreateGroupScreen />;

  // ── Computed values ────────────────────────────────────────────────────────
  const myExpenses = expenses.reduce((t, e) => e.paid_by === user?.id ? t + e.amount : t, 0);

  const dominantCurrency = useMemo(() => {
    const count: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const c = e.currency ?? 'USD';
      count[c] = (count[c] ?? 0) + 1;
    });
    return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
  }, [expenses]);

  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    group?.members?.forEach((m: any) => { map[m.user_id] = m.user?.full_name ?? 'Unknown'; });
    return map;
  }, [group]);

  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const expense of expenses) {
      if (!expense.splits) continue;
      for (const split of expense.splits) {
        if (split.paid) continue;
        if (expense.paid_by === user?.id && split.user_id !== user?.id) {
          map[split.user_id] = (map[split.user_id] ?? 0) + split.amount;
        } else if (expense.paid_by !== user?.id && split.user_id === user?.id) {
          map[expense.paid_by] = (map[expense.paid_by] ?? 0) - split.amount;
        }
      }
    }
    return Object.entries(map)
      .filter(([, v]) => Math.abs(v) > 0.01)
      .map(([uid, amt]) => ({ uid, name: memberMap[uid] ?? 'Unknown', amount: amt }))
      .sort((a, b) => a.amount - b.amount);
  }, [expenses, user, memberMap]);

  async function handleDeleteExpense(expenseId: string) {
    // Delete splits first, then the expense
    await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) {
      Alert.alert('Error', 'Could not delete expense. Please try again.');
      return;
    }
    setExpenses(prev => prev.filter(e => e.id !== expenseId));
  }

  async function handleInvite() {
    if (!id) return;
    let inviteCode = (group as any)?.invite_code as string | undefined;
    if (!inviteCode) {
      const { data, error } = await supabase
        .from('groups')
        .select('invite_code')
        .eq('id', id)
        .single();
      if (error || !data?.invite_code) {
        Alert.alert('Error', 'Could not load invite code');
        return;
      }
      inviteCode = data.invite_code;
    }
    await Share.share({
      message: `Join my group on SplitPay! Use code: ${inviteCode}\n\nOr tap: splitpay://join/${inviteCode}`,
      title: 'Join my group',
    });
  }

  if (loading) {
    return <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}><ActivityIndicator color={t.primary} size="large" style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{group?.name}</Text>
        <TouchableOpacity onPress={handleInvite} style={s.inviteBtn}>
          <Ionicons name="person-add-outline" size={18} color={t.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => router.push(`/add-expense?groupId=${id}&groupName=${encodeURIComponent(group?.name ?? '')}`)}
        >
          <Text style={s.addBtnText}>+ Expense</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGroup(); }} tintColor={t.primary} />
        }
      >
        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: 'Total Spent', value: formatCurrency(expenses.reduce((s, e) => s + e.amount, 0), dominantCurrency) },
            { label: 'You Paid',    value: formatCurrency(myExpenses, dominantCurrency) },
            { label: 'Members',     value: String(group?.members?.length ?? 0) },
          ].map((stat) => (
            <View key={stat.label} style={s.statCard}>
              <Text style={s.statLabel}>{stat.label}</Text>
              <Text style={s.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        {/* Members row */}
        <View style={s.membersSection}>
          <Text style={s.sectionTitle}>Members</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {group?.members?.map((m: any) => (
                <View key={m.user_id} style={s.memberChip}>
                  <View style={s.memberAvatar}>
                    <Text style={s.memberAvatarText}>{(m.user?.full_name ?? '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={s.memberChipName} numberOfLines={1}>{m.user?.full_name ?? 'Unknown'}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={s.addMemberBtn}
                onPress={() => router.push(`/invite-member?groupId=${id}&groupName=${encodeURIComponent(group?.name ?? '')}`)}
              >
                <Text style={s.addMemberText}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Balances */}
        {balances.length > 0 && (
          <View style={s.balancesSection}>
            <View style={s.balancesHeader}>
              <Text style={s.sectionTitle}>Balances</Text>
              <TouchableOpacity
                style={s.settleBtn}
                onPress={() => router.push(`/settle-up?groupId=${id}&groupName=${encodeURIComponent(group?.name ?? '')}`)}
              >
                <Text style={s.settleBtnText}>Settle Up</Text>
              </TouchableOpacity>
            </View>
            {balances.map(b => (
              <View key={b.uid} style={s.balanceRow}>
                <Text style={s.balanceName}>{b.name}</Text>
                <Text style={[s.balanceAmt, { color: b.amount > 0 ? t.success : t.danger }]}>
                  {b.amount > 0 ? `owes you ${formatCurrency(b.amount, dominantCurrency)}` : `you owe ${formatCurrency(Math.abs(b.amount), dominantCurrency)}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Expenses */}
        <Text style={s.sectionTitle}>Expenses</Text>
        {expenses.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>💸</Text>
            <Text style={s.emptyTitle}>No expenses yet</Text>
            <Text style={s.emptySub}>Tap "+ Expense" to start tracking</Text>
          </View>
        ) : expenses.map((e) => (
          <SwipeableExpenseRow
            key={e.id}
            expense={e}
            currency={(e as any).currency ?? dominantCurrency}
            onDelete={handleDeleteExpense}
            t={t}
            s={s}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Create Group Screen ──────────────────────────────────────────────────────
interface AppUser { id: string; full_name: string; email: string; }

function CreateGroupScreen() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const cg = useMemo(() => makeCgStyles(t), [t]);

  const [name,       setName]       = useState('');
  const [query,      setQuery]      = useState('');
  const [allUsers,   setAllUsers]   = useState<AppUser[]>([]);
  const [selected,   setSelected]   = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Load all app users (excluding self)
  useEffect(() => {
    async function load() {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .neq('id', user.id)
        .order('full_name');
      setAllUsers(data ?? []);
      setLoadingUsers(false);
    }
    load();
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allUsers;
    return allUsers.filter(u =>
      u.full_name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [allUsers, query]);

  function toggleUser(u: AppUser) {
    setSelected(prev =>
      prev.find(p => p.id === u.id)
        ? prev.filter(p => p.id !== u.id)
        : [...prev, u]
    );
  }

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Error', 'Please enter a group name'); return; }
    if (!user) return;
    setSaving(true);

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: name.trim(), created_by: user.id })
      .select()
      .single();

    if (error) { Alert.alert('Error', error.message); setSaving(false); return; }

    // Add creator + all selected members
    const members = [
      { group_id: group.id, user_id: user.id },
      ...selected.map(u => ({ group_id: group.id, user_id: u.id })),
    ];
    await supabase.from('group_members').insert(members);

    setSaving(false);
    router.replace(`/group/${group.id}`);
  }

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Group</Text>
        <TouchableOpacity onPress={handleCreate} disabled={saving} style={{ padding: 8 }}>
          {saving
            ? <ActivityIndicator color={t.primary} size="small" />
            : <Text style={[s.saveText, !name.trim() && { opacity: 0.4 }]}>Create</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Group name */}
        <View style={cg.section}>
          <Text style={cg.sectionLabel}>GROUP NAME</Text>
          <TextInput
            style={cg.nameInput}
            placeholder="e.g. Barcelona Trip, Roommates…"
            placeholderTextColor="#9ca3af"
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
          />
        </View>

        {/* Selected members chips */}
        {selected.length > 0 && (
          <View style={cg.section}>
            <Text style={cg.sectionLabel}>ADDED ({selected.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {selected.map(u => (
                <TouchableOpacity key={u.id} style={cg.chip} onPress={() => toggleUser(u)} activeOpacity={0.8}>
                  <View style={cg.chipAvatar}>
                    <Text style={cg.chipAvatarText}>{getInitials(u.full_name)}</Text>
                  </View>
                  <Text style={cg.chipName}>{u.full_name.split(' ')[0]}</Text>
                  <Ionicons name="close-circle" size={15} color="#9ca3af" style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search */}
        <View style={cg.section}>
          <Text style={cg.sectionLabel}>ADD PEOPLE</Text>
          <View style={cg.searchBox}>
            <Ionicons name="search" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
            <TextInput
              style={cg.searchInput}
              placeholder="Search by name or email"
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* User list */}
        {loadingUsers ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <View style={cg.emptySearch}>
            <Text style={cg.emptySearchText}>No users found</Text>
          </View>
        ) : (
          <View style={cg.listCard}>
            {filtered.map((u, i) => {
              const isSelected = !!selected.find(p => p.id === u.id);
              const last = i === filtered.length - 1;
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[cg.row, !last && cg.rowBorder]}
                  onPress={() => toggleUser(u)}
                  activeOpacity={0.7}
                >
                  <View style={cg.avatar}>
                    <Text style={cg.avatarText}>{getInitials(u.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cg.userName}>{u.full_name}</Text>
                    <Text style={cg.userEmail} numberOfLines={1}>{u.email}</Text>
                  </View>
                  <View style={[cg.check, isSelected && cg.checkActive]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Swipeable expense row ─────────────────────────────────────────────────────

const DELETE_THRESHOLD = 80;

function SwipeableExpenseRow({
  expense,
  currency,
  onDelete,
  t,
  s,
}: {
  expense: any;
  currency: string;
  onDelete: (id: string) => void;
  t: ThemeColors;
  s: ReturnType<typeof makeStyles>;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(Math.max(g.dx, -DELETE_THRESHOLD - 10));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -DELETE_THRESHOLD / 2) {
          // Snap open
          Animated.spring(translateX, { toValue: -DELETE_THRESHOLD, useNativeDriver: true }).start();
        } else {
          // Snap closed
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  function snapClose() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  }

  function confirmDelete() {
    Alert.alert(
      'Delete Expense',
      `Delete "${expense.description}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: snapClose },
        { text: 'Delete', style: 'destructive', onPress: () => { snapClose(); onDelete(expense.id); } },
      ]
    );
  }

  return (
    <View style={{ overflow: 'hidden', marginBottom: 8 }}>
      {/* Delete action revealed behind */}
      <View style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: DELETE_THRESHOLD, backgroundColor: t.danger,
        borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <TouchableOpacity onPress={confirmDelete} style={{ alignItems: 'center', gap: 4 }} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Draggable row */}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <View style={s.expenseCard}>
          <View style={s.expenseIcon}>
            <Text>{CATEGORY_ICONS[expense.category] ?? '📦'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.expenseTitle}>{expense.description}</Text>
            <Text style={s.expenseSub}>{expense.payer?.full_name ?? 'Unknown'} · {formatDate(expense.date)}</Text>
          </View>
          <Text style={s.expenseAmount}>{formatCurrency(expense.amount, currency)}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:           { flex: 1, backgroundColor: t.bg },
    header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border, gap: 8 },
    back:             { color: t.primary, fontSize: 17, fontWeight: '500' },
    headerTitle:      { flex: 1, color: t.text, fontSize: 18, fontWeight: 'bold' },
    inviteBtn:        { padding: 8, borderRadius: 8 },
    addBtn:           { backgroundColor: t.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
    addBtnText:       { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
    statsRow:         { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard:         { flex: 1, backgroundColor: t.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: t.border },
    statLabel:        { color: t.placeholder, fontSize: 11, marginBottom: 4 },
    statValue:        { color: t.text, fontWeight: 'bold', fontSize: 16 },
    sectionTitle:     { color: t.text, fontWeight: 'bold', fontSize: 17, marginBottom: 10 },
    // Members
    membersSection:   { marginBottom: 16 },
    memberChip:       { alignItems: 'center', gap: 4 },
    memberAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
    memberAvatarText: { color: t.primary, fontWeight: 'bold', fontSize: 16 },
    memberChipName:   { color: t.subtext, fontSize: 11, maxWidth: 52, textAlign: 'center' },
    addMemberBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: t.border, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.borderStrong, borderStyle: 'dashed' },
    addMemberText:    { color: t.subtext, fontSize: 11, fontWeight: '600' },
    // Balances
    balancesSection:  { backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: t.border },
    balancesHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    settleBtn:        { backgroundColor: t.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    settleBtnText:    { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    balanceRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    balanceName:      { color: t.subtext, fontWeight: '500', fontSize: 14 },
    balanceAmt:       { fontWeight: '600', fontSize: 14 },
    // Expenses
    emptyCard:        { backgroundColor: t.card, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: t.border },
    emptyTitle:       { color: t.text, fontWeight: 'bold', fontSize: 16 },
    emptySub:         { color: t.subtext, fontSize: 13, marginTop: 4, textAlign: 'center' },
    expenseCard:      { backgroundColor: t.card, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.border },
    expenseIcon:      { width: 40, height: 40, borderRadius: 10, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
    expenseTitle:     { color: t.text, fontWeight: '600', fontSize: 15 },
    expenseSub:       { color: t.placeholder, fontSize: 12, marginTop: 2 },
    expenseAmount:    { color: t.text, fontWeight: 'bold', fontSize: 15 },
    // Create group form
    label:            { color: t.subtext, fontSize: 14, fontWeight: '600' },
    input:            { backgroundColor: t.card, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: t.text },
    addBtn2:          { backgroundColor: t.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    saveText:         { color: t.primary, fontSize: 16, fontWeight: '700' },
  });
}

function makeCgStyles(t: ThemeColors) {
  return StyleSheet.create({
    section:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
    sectionLabel:  { fontSize: 11, fontWeight: '700', color: t.placeholder, letterSpacing: 1, marginBottom: 10 },

    nameInput:     { backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong,
                     paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: t.text,
                     shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },

    // Selected chips
    chip:          { flexDirection: 'row', alignItems: 'center', backgroundColor: t.primaryBg,
                     borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
    chipAvatar:    { width: 24, height: 24, borderRadius: 12, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
    chipAvatarText:{ color: '#fff', fontSize: 10, fontWeight: '700' },
    chipName:      { color: t.primary, fontSize: 13, fontWeight: '600' },

    // Search
    searchBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 12,
                     borderWidth: 1, borderColor: t.borderStrong, paddingHorizontal: 12, paddingVertical: 10 },
    searchInput:   { flex: 1, fontSize: 15, color: t.text },

    // List
    listCard:      { marginHorizontal: 20, marginTop: 8, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden',
                     shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    row:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    rowBorder:     { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    avatar:        { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
    avatarText:    { color: t.primary, fontWeight: '700', fontSize: 15 },
    userName:      { fontSize: 15, fontWeight: '600', color: t.text },
    userEmail:     { fontSize: 12, color: t.placeholder, marginTop: 2 },
    check:         { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: t.muted,
                     alignItems: 'center', justifyContent: 'center' },
    checkActive:   { backgroundColor: t.primary, borderColor: t.primary },

    emptySearch:     { alignItems: 'center', paddingVertical: 32 },
    emptySearchText: { color: t.placeholder, fontSize: 14 },
  });
}
