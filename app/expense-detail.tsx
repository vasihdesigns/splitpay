/**
 * Expense Detail Screen
 * Shows full breakdown, spending trends, comments placeholder.
 * Delete and Edit are in the header.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, getInitials, getExpenseIcon } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

interface Split {
  userId: string;
  name:   string;
  amount: number;
  paid:   boolean;
}

interface ExpenseDetail {
  id:          string;
  description: string;
  amount:      number;
  currency:    string;
  date:        string;
  paid_by:     string;
  paidByName:  string;
  splits:      Split[];
}

interface MonthSpend {
  label:  string; // "Apr"
  amount: number;
}

function abbrevName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? full;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function ExpenseDetailScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { expenseId, friendId, friendName } = useLocalSearchParams<{
    expenseId:  string;
    friendId:   string;
    friendName: string;
  }>();
  const { user } = useAuthStore();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [expense,    setExpense]    = useState<ExpenseDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [deleting,   setDeleting]   = useState(false);
  const [monthSpends, setMonthSpends] = useState<MonthSpend[]>([]);

  useEffect(() => { fetchDetail(); }, []);

  async function fetchDetail() {
    if (!expenseId) return;

    // ── Fetch expense ───────────────────────────────────────────────────────
    const { data: exp } = await supabase
      .from('expenses')
      .select('id, description, amount, currency, date, paid_by')
      .eq('id', expenseId)
      .single();

    if (!exp) { setLoading(false); return; }

    // ── Fetch splits ────────────────────────────────────────────────────────
    const { data: rawSplits } = await supabase
      .from('expense_splits')
      .select('user_id, amount, paid')
      .eq('expense_id', expenseId);

    // ── Fetch profiles ──────────────────────────────────────────────────────
    const allUids = [...new Set([exp.paid_by, ...(rawSplits ?? []).map((s: any) => s.user_id)])];
    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name').in('id', allUids);

    const nameMap: Record<string, string> = {};
    profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name; });

    const splits: Split[] = (rawSplits ?? []).map((s: any) => ({
      userId: s.user_id,
      name:   nameMap[s.user_id] ?? 'Someone',
      amount: s.amount,
      paid:   s.paid,
    }));

    setExpense({
      id:          exp.id,
      description: exp.description,
      amount:      exp.amount,
      currency:    exp.currency ?? 'USD',
      date:        exp.date,
      paid_by:     exp.paid_by,
      paidByName:  nameMap[exp.paid_by] ?? 'Someone',
      splits,
    });

    // ── Spending trends (last 3 months, shared expenses) ───────────────────
    if (user && friendId) {
      const { data: theirSplits } = await supabase
        .from('expense_splits').select('expense_id').eq('user_id', friendId);
      const { data: mySplits } = await supabase
        .from('expense_splits').select('expense_id').eq('user_id', user.id);

      const theirIds  = new Set((theirSplits ?? []).map((s: any) => s.expense_id));
      const myIds     = new Set((mySplits   ?? []).map((s: any) => s.expense_id));
      const sharedIds = [...theirIds].filter(id => myIds.has(id));

      if (sharedIds.length) {
        const { data: sharedExp } = await supabase
          .from('expenses').select('amount, date').in('id', sharedIds);

        const monthTotals: Record<string, number> = {};
        (sharedExp ?? []).forEach((e: any) => {
          const d   = new Date(e.date);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          monthTotals[key] = (monthTotals[key] ?? 0) + (e.amount ?? 0);
        });

        const now    = new Date();
        const months: MonthSpend[] = [];
        for (let i = 2; i >= 0; i--) {
          const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          months.push({
            label:  d.toLocaleDateString('en-US', { month: 'short' }),
            amount: monthTotals[key] ?? 0,
          });
        }
        setMonthSpends(months);
      }
    }

    setLoading(false);
  }

  async function handleDelete() {
    Alert.alert(
      'Remove expense',
      `Remove "${expense?.description}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            setDeleting(true);
            await supabase.from('expense_splits').delete().eq('expense_id', expenseId!);
            const { error } = await supabase.from('expenses').delete().eq('id', expenseId!);
            setDeleting(false);
            if (error) { Alert.alert('Error', error.message); return; }
            router.back();
          },
        },
      ],
    );
  }

  // ── Loading / not-found states ────────────────────────────────────────────
  const headerEl = (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
        <Ionicons name="arrow-back" size={22} color={t.subtext} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Details</Text>
      <View style={s.headerActions}>
        <TouchableOpacity style={s.headerBtn} onPress={handleDelete} disabled={deleting}>
          {deleting
            ? <ActivityIndicator size="small" color={t.danger} />
            : <Ionicons name="trash-outline" size={22} color={t.subtext} />
          }
        </TouchableOpacity>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => router.push({ pathname: '/edit-expense', params: { expenseId: expense?.id } })}
          disabled={!expense}
        >
          <Ionicons name="pencil-outline" size={22} color={t.subtext} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[s.screen, { backgroundColor: t.bg }]}>
        {headerEl}
        <ActivityIndicator color={t.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={[s.screen, { backgroundColor: t.bg }]}>
        {headerEl}
        <Text style={{ textAlign: 'center', marginTop: 60, color: t.placeholder }}>Expense not found.</Text>
      </View>
    );
  }

  const icon          = getExpenseIcon(expense.description);
  const iPaidIt       = expense.paid_by === user?.id;
  const formattedDate = new Date(expense.date).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const addedBy  = iPaidIt ? 'You' : abbrevName(expense.paidByName);
  const maxSpend = Math.max(...monthSpends.map(m => m.amount), 1);

  return (
    <KeyboardAvoidingView
      style={[s.screen, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {headerEl}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Top card ───────────────────────────────────────────────────────── */}
        <View style={s.topCard}>
          <View style={[s.topIcon, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name as any} size={24} color={icon.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.topDesc}>{expense.description}</Text>
            <Text style={s.topAmount}>{formatCurrency(expense.amount, expense.currency)}</Text>
            <Text style={s.topMeta}>Added by {addedBy} on {formattedDate}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Who paid + splits ──────────────────────────────────────────────── */}
        <View style={s.section}>
          {/* Payer row */}
          <View style={s.payRow}>
            <View style={s.payAvatar}>
              <Text style={s.payAvatarText}>{getInitials(expense.paidByName)}</Text>
            </View>
            <Text style={s.payText}>
              {iPaidIt ? 'You paid ' : `${abbrevName(expense.paidByName)} paid `}
              <Text style={{ fontWeight: '700', color: t.text }}>
                {formatCurrency(expense.amount, expense.currency)}
              </Text>
            </Text>
          </View>

          {/* Split rows */}
          {expense.splits.map(split => {
            const isMe  = split.userId === user?.id;
            const label = isMe ? 'You owe' : `${abbrevName(split.name)} owes`;
            return (
              <View key={split.userId} style={s.splitRow}>
                <View style={s.splitAvatar}>
                  <Text style={s.splitAvatarText}>{getInitials(split.name)}</Text>
                </View>
                <Text style={s.splitText}>
                  {label}{' '}
                  <Text style={{ fontWeight: '600', color: t.text }}>
                    {formatCurrency(split.amount, expense.currency)}
                  </Text>
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Spending trends ───────────────────────────────────────────────── */}
        {monthSpends.length > 0 && (
          <>
            <View style={s.divider} />
            <View style={s.section}>
              <Text style={s.sectionTitle}>
                Spending trends with {friendName} :: General
              </Text>
              {monthSpends.map(m => (
                <View key={m.label} style={s.trendRow}>
                  <Text style={s.trendLabel}>{m.label}</Text>
                  <View style={s.trendBarBg}>
                    <View
                      style={[
                        s.trendBar,
                        { width: m.amount > 0 ? `${Math.max((m.amount / maxSpend) * 100, 2)}%` : '2%' },
                        m.amount === 0 && { backgroundColor: t.muted },
                      ]}
                    />
                  </View>
                  <Text style={s.trendAmt}>
                    {m.amount > 0
                      ? formatCurrency(m.amount, expense.currency)
                      : `${expense.currency}0.00`}
                  </Text>
                </View>
              ))}
              <TouchableOpacity style={s.chartsBtn}
                onPress={() => Alert.alert('Charts', 'This feature is coming soon.')}>
                <Text style={s.chartsBtnText}>View more charts</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Comments ─────────────────────────────────────────────────────── */}
        <View style={s.divider} />
        <View style={s.section}>
          <Text style={s.sectionTitle}>Comments</Text>
          <Text style={s.noComments}>No comments yet.</Text>
        </View>

      </ScrollView>

      {/* ── Comment input bar ─────────────────────────────────────────────── */}
      <View style={[s.commentBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TextInput
          style={s.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor={t.placeholder}
        />
        <TouchableOpacity>
          <Ionicons name="arrow-forward-circle-outline" size={28} color={t.placeholder} />
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },

  // Header
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, backgroundColor: t.card },
  headerBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 16, fontWeight: '600', color: t.text },
  headerActions: { flexDirection: 'row', gap: 2 },

  // Top card
  topCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 20 },
  topIcon:   { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  topDesc:   { fontSize: 16, fontWeight: '500', color: t.text, marginBottom: 2 },
  topAmount: { fontSize: 30, fontWeight: '800', color: t.text, letterSpacing: -0.5 },
  topMeta:   { fontSize: 13, color: t.placeholder, marginTop: 4 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border },

  section:      { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: t.text, marginBottom: 16, letterSpacing: 0.1 },

  // Payer row
  payRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  payAvatar:     { width: 42, height: 42, borderRadius: 21, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  payAvatarText: { color: t.primary, fontWeight: '700', fontSize: 14 },
  payText:       { fontSize: 15, color: t.text, flex: 1 },

  // Split rows
  splitRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  splitAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: t.inputBg, alignItems: 'center', justifyContent: 'center' },
  splitAvatarText: { color: t.subtext, fontWeight: '600', fontSize: 12 },
  splitText:       { fontSize: 14, color: t.subtext, flex: 1 },

  // Spending trends
  trendRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  trendLabel: { width: 32, fontSize: 13, color: t.subtext, fontWeight: '500' },
  trendBarBg: { flex: 1, height: 22, backgroundColor: t.inputBg, borderRadius: 4, overflow: 'hidden' },
  trendBar:   { height: '100%', backgroundColor: t.placeholder, borderRadius: 4 },
  trendAmt:   { width: 82, textAlign: 'right', fontSize: 12, color: t.text, fontWeight: '500' },

  chartsBtn:     { marginTop: 16, alignSelf: 'center', backgroundColor: t.primary, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartsBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  noComments: { color: t.placeholder, fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  // Comment bar
  commentBar:   { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: 16, paddingTop: 12, gap: 10, backgroundColor: t.card },
  commentInput: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: t.text, backgroundColor: t.inputBg },
});}
