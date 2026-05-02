import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet, Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

interface SplitRow {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  paid: boolean;
  payer_id: string;
}

interface UserBalance {
  userId: string;
  name: string;
  amount: number; // positive = they owe me, negative = I owe them
  splitIds: string[]; // IDs of expense_splits to mark as paid when settling
}

export default function SettleUpScreen() {
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();
  const { user } = useAuthStore();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [loading,   setLoading]   = useState(true);
  const [settling,  setSettling]  = useState<string | null>(null);
  const [balances,  setBalances]  = useState<UserBalance[]>([]);
  const [currency,  setCurrency]  = useState('USD');
  const [simplify,  setSimplify]  = useState(false);

  // Debt-squashing algorithm: produces the minimum number of transactions
  function simplifyDebts(raw: UserBalance[]): UserBalance[] {
    // Build a net balance map keyed by userId
    const netMap: Record<string, { amount: number; name: string; splitIds: string[] }> = {};
    for (const b of raw) {
      if (!netMap[b.userId]) netMap[b.userId] = { amount: 0, name: b.name, splitIds: [] };
      netMap[b.userId].amount += b.amount;
      netMap[b.userId].splitIds.push(...b.splitIds);
    }

    // Creditors: amount > 0 (they owe me), Debtors: amount < 0 (I owe them)
    const creditors = Object.entries(netMap)
      .filter(([, v]) => v.amount > 0.01)
      .map(([uid, v]) => ({ userId: uid, name: v.name, amount: v.amount, splitIds: [...v.splitIds] }));
    const debtors = Object.entries(netMap)
      .filter(([, v]) => v.amount < -0.01)
      .map(([uid, v]) => ({ userId: uid, name: v.name, amount: v.amount, splitIds: [...v.splitIds] }));

    const result: UserBalance[] = [];

    let ci = 0; // creditor index
    let di = 0; // debtor index

    while (ci < creditors.length && di < debtors.length) {
      const cred  = creditors[ci];
      const debt  = debtors[di];
      const settle = Math.min(cred.amount, Math.abs(debt.amount));

      result.push({
        userId:   debt.userId,
        name:     debt.name,
        amount:   -settle, // I owe them (debtor perspective relative to current user)
        splitIds: [...new Set([...debt.splitIds, ...cred.splitIds])],
      });

      cred.amount -= settle;
      debt.amount += settle; // debt.amount is negative, adding settle brings it toward 0

      if (Math.abs(cred.amount) <= 0.01) ci++;
      if (Math.abs(debt.amount) <= 0.01) di++;
    }

    // Any remaining creditors (they owe me)
    while (ci < creditors.length) {
      const cred = creditors[ci];
      if (cred.amount > 0.01) {
        result.push({ userId: cred.userId, name: cred.name, amount: cred.amount, splitIds: cred.splitIds });
      }
      ci++;
    }
    // Any remaining debtors (I owe them)
    while (di < debtors.length) {
      const debt = debtors[di];
      if (debt.amount < -0.01) {
        result.push({ userId: debt.userId, name: debt.name, amount: debt.amount, splitIds: debt.splitIds });
      }
      di++;
    }

    return result.sort((a, b) => a.amount - b.amount);
  }

  const displayedBalances = useMemo(
    () => simplify ? simplifyDebts(balances) : balances,
    [simplify, balances],
  );

  useEffect(() => { loadBalances(); }, [groupId]);

  async function loadBalances() {
    if (!user || !groupId) return;
    setLoading(true);

    // Get all expenses in this group
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('id, paid_by, currency')
      .eq('group_id', groupId);

    if (!expensesData || expensesData.length === 0) {
      setBalances([]); setLoading(false); return;
    }

    const expenseIds = expensesData.map(e => e.id);
    const payerMap: Record<string, string> = {};
    expensesData.forEach(e => { payerMap[e.id] = e.paid_by; });

    // Dominant currency
    const currencyCount: Record<string, number> = {};
    expensesData.forEach((e: any) => {
      const c = e.currency ?? 'USD';
      currencyCount[c] = (currencyCount[c] ?? 0) + 1;
    });
    const dominant = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
    setCurrency(dominant);

    // Get all unpaid splits for this group
    const { data: splitsData } = await supabase
      .from('expense_splits')
      .select('id, expense_id, user_id, amount')
      .in('expense_id', expenseIds)
      .eq('paid', false);

    if (!splitsData) { setBalances([]); setLoading(false); return; }

    // Collect all unique user IDs we need names for
    const userIds = new Set<string>();
    splitsData.forEach(s => {
      userIds.add(s.user_id);
      userIds.add(payerMap[s.expense_id]);
    });
    userIds.delete(user.id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(userIds));

    const nameMap: Record<string, string> = {};
    profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name; });

    // Build balance map: userId -> { amount, splitIds }
    const balMap: Record<string, { amount: number; splitIds: string[] }> = {};

    for (const split of splitsData) {
      const payer = payerMap[split.expense_id];
      if (!payer) continue;

      if (payer === user.id && split.user_id !== user.id) {
        // They owe me
        if (!balMap[split.user_id]) balMap[split.user_id] = { amount: 0, splitIds: [] };
        balMap[split.user_id].amount += split.amount;
        balMap[split.user_id].splitIds.push(split.id);
      } else if (payer !== user.id && split.user_id === user.id) {
        // I owe them
        if (!balMap[payer]) balMap[payer] = { amount: 0, splitIds: [] };
        balMap[payer].amount -= split.amount;
        balMap[payer].splitIds.push(split.id);
      }
    }

    const result: UserBalance[] = Object.entries(balMap)
      .filter(([, v]) => Math.abs(v.amount) > 0.01)
      .map(([uid, v]) => ({
        userId: uid,
        name: nameMap[uid] ?? 'Unknown',
        amount: v.amount,
        splitIds: v.splitIds,
      }))
      .sort((a, b) => a.amount - b.amount); // negatives (I owe) first

    setBalances(result);
    setLoading(false);
  }

  async function settle(balance: UserBalance) {
    if (!user || !groupId) return;
    const absAmount = Math.abs(balance.amount);

    Alert.alert(
      'Confirm Settlement',
      balance.amount < 0
        ? `Record that you paid ${balance.name} ${formatCurrency(absAmount, currency)}?`
        : `Record that ${balance.name} paid you ${formatCurrency(absAmount, currency)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', onPress: async () => {
            setSettling(balance.userId);
            const payer_id  = balance.amount < 0 ? user.id    : balance.userId;
            const payee_id  = balance.amount < 0 ? balance.userId : user.id;

            const { error: settleErr } = await supabase.from('settlements').insert({
              group_id: groupId,
              payer_id,
              payee_id,
              amount: absAmount,
              currency,
            });

            if (settleErr) {
              Alert.alert('Error', settleErr.message);
              setSettling(null);
              return;
            }

            // Mark splits as paid
            await supabase
              .from('expense_splits')
              .update({ paid: true })
              .in('id', balance.splitIds);

            setSettling(null);
            Alert.alert('Settled! 🎉', 'The balance has been recorded.', [
              { text: 'OK', onPress: () => { loadBalances(); } },
            ]);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.cancel}>Done</Text>
        </TouchableOpacity>
        <Text style={s.title}>Settle Up</Text>
        <View style={{ width: 56 }} />
      </View>

      <Text style={s.groupLabel}>{groupName}</Text>

      {/* Simplify debts toggle */}
      <View style={s.toggleCard}>
        <View style={s.toggleLeft}>
          <Text style={s.toggleIcon}>🌙</Text>
          <Text style={s.toggleLabel}>Simplify debts</Text>
        </View>
        <Switch
          value={simplify}
          onValueChange={setSimplify}
          trackColor={{ false: t.border, true: t.primary }}
          thumbColor="#fff"
        />
      </View>
      {simplify && (
        <Text style={s.simplifyHint}>Showing minimum transactions</Text>
      )}

      {loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: 60 }} size="large" />
      ) : displayedBalances.length === 0 ? (
        <View style={s.allClear}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>🎉</Text>
          <Text style={s.allClearTitle}>All settled up!</Text>
          <Text style={s.allClearSub}>No outstanding balances in this group.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}>
          {displayedBalances.map(b => {
            const isSettling = settling === b.userId;
            const iOwe = b.amount < 0;
            return (
              <View key={b.userId} style={s.card}>
                <View style={s.cardLeft}>
                  <View style={[s.avatar, { backgroundColor: iOwe ? t.dangerBg : t.successBg }]}>
                    <Text style={s.avatarText}>{b.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={s.name}>{b.name}</Text>
                    <Text style={[s.balanceText, { color: iOwe ? t.danger : t.success }]}>
                      {iOwe ? `You owe ${formatCurrency(Math.abs(b.amount), currency)}` : `Owes you ${formatCurrency(b.amount, currency)}`}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.settleBtn, iOwe ? s.settleBtnRed : s.settleBtnGreen]}
                  onPress={() => settle(b)}
                  disabled={isSettling}
                >
                  {isSettling
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.settleBtnText}>Settle</Text>
                  }
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen:         { flex: 1, backgroundColor: t.bg },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border, gap: 8 },
  cancel:         { color: t.primary, fontSize: 16, fontWeight: '600' },
  title:          { flex: 1, textAlign: 'center', color: t.text, fontSize: 18, fontWeight: 'bold' },
  groupLabel:     { textAlign: 'center', color: t.subtext, fontSize: 14, marginTop: 12, marginBottom: 8 },
  allClear:       { alignItems: 'center', marginTop: 100 },
  allClearTitle:  { color: t.text, fontWeight: 'bold', fontSize: 22 },
  allClearSub:    { color: t.subtext, fontSize: 14, marginTop: 8, textAlign: 'center' },
  card:           { backgroundColor: t.card, borderRadius: 16, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: t.border },
  cardLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar:         { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontWeight: 'bold', fontSize: 18, color: t.text },
  name:           { color: t.text, fontWeight: '600', fontSize: 15 },
  balanceText:    { fontSize: 13, marginTop: 2, fontWeight: '500' },
  settleBtn:      { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, minWidth: 72, alignItems: 'center' },
  settleBtnRed:   { backgroundColor: t.danger },
  settleBtnGreen: { backgroundColor: t.success },
  settleBtnText:  { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  // Simplify toggle
  toggleCard:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.card, borderRadius: 14, marginHorizontal: 20, marginBottom: 4, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: t.border },
  toggleLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleIcon:     { fontSize: 18 },
  toggleLabel:    { color: t.text, fontSize: 15, fontWeight: '600' },
  simplifyHint:   { textAlign: 'center', color: t.subtext, fontSize: 12, marginBottom: 8 },
});}
