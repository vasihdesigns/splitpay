/**
 * Activity tab — recent shared expense feed
 *
 * Derived directly from `expenses` + `expense_splits` tables.
 * No separate `activities` table needed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  RefreshControl, StyleSheet, TouchableOpacity, Alert,
  ActionSheetIOS, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, getExpenseIcon, formatRelativeTime } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

interface ActivityItem {
  id:          string;
  description: string;
  amount:      number;
  currency:    string;
  date:        string;
  payerName:   string;
  groupName:   string | null;
  iDidPay:     boolean;
  youGetBack?: number;
  youOwe?:     number;
  splitCount:  number;
}

export default function ActivityScreen() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const t        = useTheme();
  const s        = useMemo(() => makeStyles(t), [t]);

  const [items,      setItems]      = useState<ActivityItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivityRef = useRef<() => Promise<void>>(async () => {});

  async function fetchActivity() {
    if (!user) { setLoading(false); setRefreshing(false); return; }

    // 1. All expense_splits for this user
    const { data: mySplits } = await supabase
      .from('expense_splits')
      .select('expense_id, amount, paid')
      .eq('user_id', user.id);

    const expIds = (mySplits ?? []).map((s: any) => s.expense_id);

    if (!expIds.length) {
      setItems([]); setLoading(false); setRefreshing(false); return;
    }

    // 2. Expense records, newest first (no FK join — fetch groups separately)
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, description, amount, currency, date, paid_by, group_id')
      .in('id', expIds)
      .order('date', { ascending: false })
      .limit(80);

    if (!expenses?.length) {
      setItems([]); setLoading(false); setRefreshing(false); return;
    }

    // 2b. Group names (fetched separately to avoid FK join issues)
    const groupIds = [...new Set(expenses.map((e: any) => e.group_id).filter(Boolean))];
    const groupNameMap: Record<string, string> = {};
    if (groupIds.length) {
      const { data: groups } = await supabase
        .from('groups').select('id, name').in('id', groupIds);
      groups?.forEach((g: any) => { groupNameMap[g.id] = g.name; });
    }

    // 3. All splits for these expenses (to compute "you get back" amounts)
    const { data: allSplits } = await supabase
      .from('expense_splits')
      .select('expense_id, user_id, amount, paid')
      .in('expense_id', expIds);

    // 4. Payer profile names
    const payerIds = [...new Set(expenses.map((e: any) => e.paid_by).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (payerIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', payerIds);
      profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name ?? 'Someone'; });
    }

    // 5. Index my splits and all splits by expense_id
    const myShareMap: Record<string, { amount: number; paid: boolean }> = {};
    (mySplits ?? []).forEach((s: any) => {
      myShareMap[s.expense_id] = { amount: Number(s.amount), paid: s.paid };
    });

    const splitsByExpense: Record<string, any[]> = {};
    (allSplits ?? []).forEach((s: any) => {
      if (!splitsByExpense[s.expense_id]) splitsByExpense[s.expense_id] = [];
      splitsByExpense[s.expense_id].push(s);
    });

    // 6. Build items
    const result: ActivityItem[] = expenses.map((e: any) => {
      const iDidPay = e.paid_by === user.id;
      const myShare = myShareMap[e.id];
      const splits  = splitsByExpense[e.id] ?? [];

      let youGetBack: number | undefined;
      let youOwe: number | undefined;

      if (iDidPay) {
        // Sum of other people's unpaid splits — Number() prevents string concatenation
        const unpaidTotal = splits
          .filter((s: any) => s.user_id !== user.id && !s.paid)
          .reduce((sum: number, s: any) => sum + Number(s.amount), 0);
        if (unpaidTotal > 0.01) youGetBack = unpaidTotal;
      } else if (myShare && !myShare.paid && Number(myShare.amount) > 0.01) {
        youOwe = Number(myShare.amount);
      }

      return {
        id:          e.id,
        description: e.description,
        amount:      Number(e.amount),
        currency:    e.currency ?? 'USD',
        date:        e.date,
        payerName:   iDidPay ? 'You' : (nameMap[e.paid_by] ?? 'Someone'),
        groupName:   groupNameMap[e.group_id] ?? null,
        iDidPay,
        youGetBack,
        youOwe,
        splitCount:  splits.length,
      };
    });

    setItems(result);
    setLoading(false);
    setRefreshing(false);
  }

  fetchActivityRef.current = fetchActivity;
  useEffect(() => { if (user?.id) fetchActivity(); }, [user?.id]);
  useFocusEffect(useCallback(() => { fetchActivityRef.current(); }, []));

  async function handleDelete(id: string) {
    await supabase.from('expense_splits').delete().eq('expense_id', id);
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { Alert.alert('Error', 'Could not delete expense.'); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleSettleUp(id: string) {
    if (!user) return;
    await supabase.from('expense_splits').update({ paid: true }).eq('expense_id', id).eq('user_id', user.id);
    fetchActivityRef.current();
  }

  function showActionSheet(item: ActivityItem) {
    const options = ['Settle Up', 'Edit', 'Delete', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 2, cancelButtonIndex: 3, title: item.description },
        (idx) => {
          if (idx === 0) handleSettleUp(item.id);
          if (idx === 1) router.push({ pathname: '/edit-expense', params: { expenseId: item.id } });
          if (idx === 2) Alert.alert('Delete Expense', `Delete "${item.description}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) },
          ]);
        }
      );
    } else {
      Alert.alert(item.description, undefined, [
        { text: 'Settle Up', onPress: () => handleSettleUp(item.id) },
        { text: 'Edit', onPress: () => router.push({ pathname: '/edit-expense', params: { expenseId: item.id } }) },
        { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete Expense', `Delete "${item.description}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(item.id) },
        ])},
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={s.pageTitle}>Activity</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchActivity(); }}
            tintColor={t.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="time-outline" size={52} color={t.muted} style={{ marginBottom: 14 }} />
            <Text style={s.emptyTitle}>No activity yet</Text>
            <Text style={s.emptySub}>Add a shared expense to see it here</Text>
          </View>
        ) : (
          items.map((item, i) => {
            const icon = getExpenseIcon(item.description);
            const [y, m, d] = item.date.split('-').map(Number);
            const dateLabel = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return (
              <TouchableOpacity
                key={item.id}
                style={[s.card, i < items.length - 1 && s.cardBorder]}
                onPress={() => router.push({ pathname: '/expense-detail', params: { expenseId: item.id } })}
                onLongPress={() => showActionSheet(item)}
                delayLongPress={350}
                activeOpacity={0.7}
              >
                {/* Category icon */}
                <View style={[s.iconBox, { backgroundColor: icon.bg }]}>
                  <Ionicons name={icon.name as any} size={20} color={icon.color} />
                </View>

                {/* Body */}
                <View style={s.body}>
                  {/* Top row: who + action */}
                  <Text style={s.actorLine} numberOfLines={1}>
                    <Text style={s.actorBold}>{item.payerName}</Text>
                    <Text style={s.actorGrey}> added </Text>
                    <Text style={s.actorBold}>"{item.description}"</Text>
                  </Text>

                  {/* Owe / get-back line */}
                  {item.youGetBack != null && (
                    <Text style={s.getBack}>
                      You get back {formatCurrency(item.youGetBack, item.currency)}
                    </Text>
                  )}
                  {item.youOwe != null && (
                    <Text style={s.youOwe}>
                      You owe {formatCurrency(item.youOwe, item.currency)}
                    </Text>
                  )}
                  {item.youGetBack == null && item.youOwe == null && (
                    <Text style={s.settled}>All settled</Text>
                  )}

                  {/* Meta */}
                  <View style={s.metaRow}>
                    {item.groupName && (
                      <View style={s.groupTag}>
                        <Ionicons name="people" size={11} color={t.primary} style={{ marginRight: 3 }} />
                        <Text style={s.groupTagText}>{item.groupName}</Text>
                      </View>
                    )}
                    <Text style={s.dateText}>{dateLabel}</Text>
                  </View>
                </View>

                {/* Right: total amount */}
                <View style={s.rightCol}>
                  <Text style={s.totalAmt}>{formatCurrency(item.amount, item.currency)}</Text>
                  <Text style={s.splitMeta}>
                    {item.splitCount > 1 ? `${item.splitCount} people` : 'only you'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:    { flex: 1, backgroundColor: t.bg },
    topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 4 },
    backBtn:   { padding: 4 },
    pageTitle: { color: t.text, fontSize: 26, fontWeight: '800', flex: 1 },

    card:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20,
                  paddingVertical: 16, backgroundColor: t.card, gap: 12 },
    cardBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },

    iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

    body:       { flex: 1 },
    actorLine:  { fontSize: 14, color: t.text, lineHeight: 20, marginBottom: 2 },
    actorBold:  { fontWeight: '600', color: t.text },
    actorGrey:  { color: t.subtext, fontWeight: '400' },

    getBack:  { color: t.success, fontWeight: '600', fontSize: 13, marginBottom: 4 },
    youOwe:   { color: t.danger, fontWeight: '600', fontSize: 13, marginBottom: 4 },
    settled:  { color: t.placeholder, fontSize: 12, marginBottom: 4 },

    metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    groupTag:     { flexDirection: 'row', alignItems: 'center', backgroundColor: t.primaryBg,
                    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    groupTagText: { color: t.primary, fontSize: 11, fontWeight: '600' },
    dateText:     { color: t.placeholder, fontSize: 12 },

    rightCol:  { alignItems: 'flex-end', minWidth: 72 },
    totalAmt:  { fontSize: 15, fontWeight: '700', color: t.text },
    splitMeta: { fontSize: 11, color: t.placeholder, marginTop: 2 },

    empty:      { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
    emptyTitle: { color: t.text, fontWeight: '700', fontSize: 18, marginBottom: 6 },
    emptySub:   { color: t.subtext, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  });
}
