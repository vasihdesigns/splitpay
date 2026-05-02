/**
 * Add Expense — Splitwise-style
 *
 * Split flow:
 *   1. Tapping the split row → QuickSplitModal (4 quick scenarios)
 *   2. "More options" → SplitOptionsModal (full Splitwise-style split screen)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, StyleSheet,
  Platform, Modal, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getInitials, formatCurrency, getExpenseIcon } from '@/lib/utils';
import { extractTextFromImage, parseReceiptText, GOOGLE_VISION_API_KEY, type ParsedReceipt } from '@/lib/ocr';
import { useTheme, ThemeColors } from '@/lib/theme';
import { CURRENCIES } from '@/lib/currencies';

// ─── Types ────────────────────────────────────────────────────────────────────

type QuickSplit  = 'you-equal' | 'you-full' | 'other-equal' | 'other-full' | 'custom';
type SplitMethod = 'equal' | 'unequal' | 'percentage' | 'shares' | 'adjustment';

interface Member {
  user_id:    string;
  full_name:  string;
  initials:   string;
  included:   boolean;
  owed:       string;
  pct:        string;
  shares:     string;
  adjustment: string;
}

// ─── Pure split computation ───────────────────────────────────────────────────

function computeSplitsFor(
  method: SplitMethod,
  members: Member[],
  total: number,
): { user_id: string; amount: number }[] {
  if (!total || !members.length) return [];
  switch (method) {
    case 'equal': {
      const inc = members.filter(m => m.included);
      if (!inc.length) return [];
      const each = parseFloat((total / inc.length).toFixed(2));
      const sum  = each * (inc.length - 1);
      return inc.map((m, i) => ({
        user_id: m.user_id,
        amount:  i === inc.length - 1 ? parseFloat((total - sum).toFixed(2)) : each,
      }));
    }
    case 'unequal':
      return members.map(m => ({ user_id: m.user_id, amount: parseFloat(m.owed) || 0 }));
    case 'percentage':
      return members.map(m => ({
        user_id: m.user_id,
        amount:  parseFloat(((parseFloat(m.pct) || 0) / 100 * total).toFixed(2)),
      }));
    case 'shares': {
      const tot = members.reduce((s, m) => s + (parseFloat(m.shares) || 0), 0);
      if (!tot) return members.map(m => ({ user_id: m.user_id, amount: 0 }));
      return members.map(m => ({
        user_id: m.user_id,
        amount:  parseFloat(((parseFloat(m.shares) || 0) / tot * total).toFixed(2)),
      }));
    }
    case 'adjustment': {
      const inc    = members.filter(m => m.included);
      if (!inc.length) return [];
      const adjSum = inc.reduce((s, m) => s + (parseFloat(m.adjustment) || 0), 0);
      const base   = (total - adjSum) / inc.length;
      return inc.map(m => ({
        user_id: m.user_id,
        amount:  parseFloat((base + (parseFloat(m.adjustment) || 0)).toFixed(2)),
      }));
    }
    default: return [];
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddExpenseScreen() {
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams<{ groupId?: string; groupName?: string }>();
  const { user } = useAuthStore();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [description, setDescription] = useState('');
  const [amount,      setAmount]       = useState('');
  const [date,        setDate]         = useState(new Date().toISOString().split('T')[0]);
  const [dateObj,     setDateObj]      = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note,        setNote]         = useState('');
  const [showNoteModal,  setShowNoteModal]  = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [userGroups,  setUserGroups]   = useState<{ id: string; name: string }[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<string>(groupId ?? '');

  const [members,       setMembers]       = useState<Member[]>([]);
  // people selected for non-group splits (their profile IDs, not including self)
  const [withPeople,    setWithPeople]    = useState<{ id: string; full_name: string }[]>([]);

  const [paidByUserId, setPaidByUserId] = useState<string>(user?.id ?? '');
  const [quickSplit,   setQuickSplit]   = useState<QuickSplit>('you-equal');
  const [splitMethod,  setSplitMethod]  = useState<SplitMethod>('equal');

  const [currency,         setCurrency]         = useState('USD');
  const [manualIcon,       setManualIcon]       = useState<{ name: string; color: string; bg: string } | null>(null);
  const [showQuickModal,   setShowQuickModal]   = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showPeopleModal,  setShowPeopleModal]  = useState(false);
  const [showCurrencyModal,setShowCurrencyModal]= useState(false);
  const [showIconModal,    setShowIconModal]    = useState(false);
  const [showScanModal,    setShowScanModal]    = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [recurring,        setRecurring]        = useState<string | null>(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);

  // ── data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user) {
      setPaidByUserId(user.id);
      if (groupId) fetchGroupMembers(groupId);
      else seedCurrentUser();
      fetchUserGroups();
    }
  }, [user]);

  async function fetchUserGroups() {
    if (!user) return;
    const { data: memberships } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id);
    const ids = (memberships ?? []).map((m: any) => m.group_id);
    if (!ids.length) return;
    const { data: groups } = await supabase
      .from('groups').select('id, name').in('id', ids).order('name');
    if (groups) setUserGroups(groups);
  }

  // when withPeople changes (non-group mode), rebuild members list
  useEffect(() => {
    if (!groupId) buildMembersFromWith();
  }, [withPeople]);

  // load persisted currency on mount
  useEffect(() => {
    AsyncStorage.getItem('preferred_currency').then(saved => {
      if (saved) setCurrency(saved);
    });
  }, []);

  // persist whenever currency changes
  useEffect(() => {
    AsyncStorage.setItem('preferred_currency', currency);
  }, [currency]);

  async function seedCurrentUser() {
    if (!user) return;
    const { data: p } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();
    const name = (p as any)?.full_name ?? 'Me';
    setMembers([{
      user_id: user.id, full_name: name,
      initials: getInitials(name),
      included: true, owed: '', pct: '', shares: '1', adjustment: '0',
    }]);
  }

  async function buildMembersFromWith() {
    // Use latest user from store in case it hasn't propagated to this closure yet
    const currentUser = user ?? useAuthStore.getState().user;
    const userId = currentUser?.id ?? '';
    const myName = currentUser?.full_name ?? 'Me';

    // Try to get full name from profile if we have a real user
    let resolvedName = myName;
    if (userId) {
      const { data: p } = await supabase.from('profiles').select('id, full_name').eq('id', userId).single();
      resolvedName = (p as any)?.full_name ?? myName;
    }

    const me: Member = {
      user_id: userId, full_name: resolvedName,
      initials: getInitials(resolvedName),
      included: true, owed: '', pct: '', shares: '1', adjustment: '0',
    };
    const others: Member[] = withPeople.map(p => ({
      user_id: p.id, full_name: p.full_name,
      initials: getInitials(p.full_name),
      included: true, owed: '', pct: '', shares: '1', adjustment: '0',
    }));
    setMembers([me, ...others]);
  }

  async function fetchGroupMembers(gId: string) {
    const { data: m } = await supabase.from('group_members').select('user_id').eq('group_id', gId);
    const ids = m?.map((x: any) => x.user_id) ?? [];
    if (!ids.length) return;
    const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    const map: Record<string, string> = {};
    p?.forEach((x: any) => { map[x.id] = x.full_name; });
    setMembers(ids.map((uid: string) => ({
      user_id: uid, full_name: map[uid] ?? 'Unknown',
      initials: getInitials(map[uid] ?? 'U'),
      included: true, owed: '', pct: '', shares: '1', adjustment: '0',
    })));
  }

  // ── derived ──────────────────────────────────────────────────────────────────

  const total       = parseFloat(amount) || 0;
  const otherMember = members.find(m => m.user_id !== user?.id);
  const otherFirst  = otherMember?.full_name.split(' ')[0] ?? 'Others';

  function quickPayerId() {
    return (quickSplit === 'you-equal' || quickSplit === 'you-full')
      ? (user?.id ?? '')
      : (otherMember?.user_id ?? '');
  }

  // isSolo is true when no one has been added to split with.
  // Use withPeople (sync) rather than members (async) so the split row
  // updates immediately when someone is selected in the people picker.
  const isSolo = groupId ? members.length <= 1 : withPeople.length === 0;

  function computedSplits(): { user_id: string; amount: number }[] {
    if (!total || !members.length) return [];
    // Solo — just the current user pays for themselves
    if (isSolo) return [{ user_id: user?.id ?? '', amount: total }];
    if (quickSplit !== 'custom') {
      const payerId = quickPayerId();
      const isEqual = quickSplit === 'you-equal' || quickSplit === 'other-equal';
      if (isEqual) {
        const n = members.length;
        const each = parseFloat((total / n).toFixed(2));
        const last = parseFloat((total - each * (n - 1)).toFixed(2));
        return members.map((m, i) => ({ user_id: m.user_id, amount: i === n - 1 ? last : each }));
      } else {
        const others = members.filter(m => m.user_id !== payerId);
        if (!others.length) return [{ user_id: payerId, amount: total }];
        const n = others.length;
        const each = parseFloat((total / n).toFixed(2));
        const last = parseFloat((total - each * (n - 1)).toFixed(2));
        return [
          { user_id: payerId, amount: 0 },
          ...others.map((m, i) => ({ user_id: m.user_id, amount: i === n - 1 ? last : each })),
        ];
      }
    }
    return computeSplitsFor(splitMethod, members, total);
  }

  function splitRowLabel() {
    if (isSolo) return 'Add people to split';
    if (quickSplit === 'you-equal')   return 'Paid by me, split equally';
    if (quickSplit === 'you-full')    return 'I am owed the full amount';
    if (quickSplit === 'other-equal') return `${otherFirst} paid, split equally`;
    if (quickSplit === 'other-full')  return `${otherFirst} is owed the full amount`;
    const labels: Record<SplitMethod, string> = {
      equal: 'Split equally', unequal: 'Unequal amounts',
      percentage: 'By percentages', shares: 'By shares', adjustment: 'By adjustment',
    };
    return labels[splitMethod];
  }

  function splitRowSub() {
    if (isSolo) return 'Tap + above to add someone';
    if (!total || !members.length) return '';
    const n      = members.length;
    const share  = total / n;
    const full   = n > 1 ? total / (n - 1) : total;
    if (quickSplit === 'you-equal')   return `${otherFirst} owes you ${formatCurrency(share, currency)}`;
    if (quickSplit === 'you-full')    return `${otherFirst} owes you ${formatCurrency(n === 2 ? total : full, currency)}`;
    if (quickSplit === 'other-equal') return `You owe ${otherFirst} ${formatCurrency(share, currency)}`;
    if (quickSplit === 'other-full')  return `You owe ${otherFirst} ${formatCurrency(n === 2 ? total : full, currency)}`;
    const splits = computedSplits();
    const myShare = splits.find(s => s.user_id === user?.id)?.amount ?? 0;
    return myShare > 0 ? `Your share: ${formatCurrency(myShare, currency)}` : `${splits.length} people`;
  }

  const isGreen = !isSolo && (quickSplit === 'you-equal' || quickSplit === 'you-full');

  // ── dynamic description icon ─────────────────────────────────────────────────
  const iconInfo = manualIcon ?? getExpenseIcon(description);

  // ── handlers ────────────────────────────────────────────────────────────────

  function handleSelectQuick(qs: QuickSplit) {
    setQuickSplit(qs);
    if (qs === 'you-equal' || qs === 'you-full') setPaidByUserId(user?.id ?? '');
    else if (qs === 'other-equal' || qs === 'other-full') {
      if (otherMember) setPaidByUserId(otherMember.user_id);
    }
    setShowQuickModal(false);
  }

  function handleOptionsModalDone(result: { method: SplitMethod; members: Member[]; paidBy: string }) {
    setSplitMethod(result.method);
    setMembers(result.members);
    setPaidByUserId(result.paidBy);
    setQuickSplit('custom');
    setShowOptionsModal(false);
  }

  function computeNextDue(r: string): string {
    const d = new Date();
    if (r === 'daily')   d.setDate(d.getDate() + 1);
    if (r === 'weekly')  d.setDate(d.getDate() + 7);
    if (r === 'monthly') d.setMonth(d.getMonth() + 1);
    if (r === 'yearly')  d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }

  async function handleSubmit() {
    if (!description.trim()) { Alert.alert('Missing info', 'Please enter a description.'); return; }
    if (!total || total <= 0) { Alert.alert('Missing info', 'Please enter a valid amount.'); return; }
    if (isSolo) { Alert.alert('Add someone', 'Tap + to add at least one person to split this expense with.'); return; }

    // Ensure we have a user — try anonymous sign-in if needed
    let currentUser = user;
    if (!currentUser) {
      setLoading(true);
      const { signInAnonymously } = useAuthStore.getState();
      await signInAnonymously();
      currentUser = useAuthStore.getState().user;
      if (!currentUser) {
        setLoading(false);
        Alert.alert('Sign in required', 'Could not create a session. Please restart the app.');
        return;
      }
    }

    const payerId = quickSplit !== 'custom' ? quickPayerId() : paidByUserId;
    const splits  = computedSplits();
    if (!splits.length) { Alert.alert('No members', 'No one to split with.'); return; }

    const splitsTotal = splits.reduce((s, x) => s + x.amount, 0);
    if (!isSolo && Math.abs(splitsTotal - total) > 0.02) {
      Alert.alert('Split mismatch',
        `Splits total ${formatCurrency(splitsTotal, currency)}, expense is ${formatCurrency(total, currency)}.`);
      return;
    }

    setLoading(true);
    try {
      // Safe UUID generator — works without crypto.randomUUID() on older Hermes
      const expenseId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

      const { error } = await supabase.from('expenses').insert({
        id:          expenseId,
        group_id:    selectedGroup || null,
        paid_by:     isSolo ? currentUser.id : payerId,
        description: description.trim(),
        amount:      total,
        currency,
        split_type:  ['you-equal', 'other-equal'].includes(quickSplit) || splitMethod === 'equal' ? 'equal' : 'exact',
        date,
        recurring:   recurring ?? null,
        next_due:    recurring ? computeNextDue(recurring) : null,
      });

      if (error) { Alert.alert('Error', error.message); return; }

      const { error: splitError } = await supabase.from('expense_splits').insert(
        splits.filter(s => s.amount > 0).map(s => ({
          expense_id: expenseId,
          user_id:    s.user_id,
          amount:     s.amount,
          paid:       s.user_id === payerId,
        }))
      );

      if (splitError) { Alert.alert('Error', splitError.message); return; }

      Alert.alert('Saved!', 'Expense added.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>

      {/* ── Header — outside KAV so it never shifts ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="close" size={24} color={t.subtext} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Add an expense</Text>
        <TouchableOpacity style={s.headerBtn} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color={t.success} size="small" />
            : <Text style={s.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      {/* ── "With you and:" chip row — outside KAV ── */}
      <View style={s.withBar}>
        <Text style={s.withBarLabel}>
          With <Text style={s.withBarBold}>you</Text> and:
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', gap: 8 }}>
          {withPeople.map(p => (
            <TouchableOpacity key={p.id} style={s.withChip} onPress={() => setShowPeopleModal(true)}>
              <View style={s.withChipAvatar}>
                <Text style={s.withChipInitials}>{getInitials(p.full_name)}</Text>
              </View>
              <Text style={s.withChipName}>{p.full_name.split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
          {!groupId && (
            <TouchableOpacity style={s.withAddBtn} onPress={() => setShowPeopleModal(true)}>
              <Ionicons name="add" size={20} color={t.primary} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >

          {/* ── Fields card ── */}
          <View style={s.card}>

            {/* Description */}
            <View style={s.cardRow}>
              <TouchableOpacity style={[s.cardIconBox, { backgroundColor: iconInfo.bg }]} onPress={() => setShowIconModal(true)} activeOpacity={0.75}>
                <Ionicons name={iconInfo.name as any} size={20} color={iconInfo.color} />
              </TouchableOpacity>
              <TextInput
                style={s.cardInput}
                placeholder="What was this expense for?"
                placeholderTextColor={t.placeholder}
                value={description}
                onChangeText={setDescription}
                returnKeyType="done"
              />
            </View>

            <View style={s.cardDivider} />

            {/* Amount */}
            <View style={s.cardRow}>
              <TouchableOpacity style={s.currencyPill} onPress={() => setShowCurrencyModal(true)} activeOpacity={0.7}>
                <Text style={s.currencyText}>{currency}</Text>
                <Ionicons name="chevron-down" size={11} color={t.subtext} style={{ marginTop: 1 }} />
              </TouchableOpacity>
              <TextInput
                style={s.amountInput}
                placeholder="0.00"
                placeholderTextColor={t.muted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

          </View>

          {/* ── Split pill ── */}
          <View style={s.splitSection}>
            <Text style={[s.splitSectionLabel, isSolo && { color: '#f97316' }]}>Split</Text>
            <TouchableOpacity
              style={[s.splitBtn, isSolo && { borderColor: '#fed7aa', backgroundColor: '#fff7ed' }]}
              onPress={() => isSolo ? setShowPeopleModal(true) : setShowQuickModal(true)}
              activeOpacity={0.75}
            >
              <View style={s.splitBtnLeft}>
                <View style={[s.splitBtnDot, {
                  backgroundColor: isSolo ? '#f97316' : isGreen ? '#16a34a' : '#f97316',
                }]} />
                <View>
                  <Text style={[s.splitBtnText, isSolo && { color: '#ea580c' }]}>{splitRowLabel()}</Text>
                  {splitRowSub() ? (
                    <Text style={[s.splitBtnSub, { color: isSolo ? '#f97316' : isGreen ? '#16a34a' : '#ef4444' }]}>
                      {splitRowSub()}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={s.splitBtnRight}>
                {isSolo
                  ? <Ionicons name="add-circle" size={22} color="#f97316" />
                  : <><Text style={s.splitBtnEdit}>Edit</Text><Ionicons name="chevron-forward" size={16} color="#9ca3af" /></>
                }
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Action grid ── */}
          <Text style={s.actionGridLabel}>MORE OPTIONS</Text>
          <View style={s.actionRow}>
            {/* Date */}
            <TouchableOpacity style={s.actionCard} onPress={() => setShowDatePicker(true)} activeOpacity={0.75}>
              <View style={[s.actionIconCircle, { backgroundColor: t.primaryBg }]}>
                <Ionicons name="calendar" size={22} color={t.primary} />
              </View>
              <Text style={s.actionLabel}>Date</Text>
              <Text style={s.actionValue} numberOfLines={1}>
                {date === new Date().toISOString().split('T')[0]
                  ? 'Today'
                  : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </TouchableOpacity>

            {/* Group */}
            <TouchableOpacity style={[s.actionCard, !!selectedGroup && s.actionCardActive]} onPress={() => setShowGroupModal(true)} activeOpacity={0.75}>
              <View style={[s.actionIconCircle, !!selectedGroup && { backgroundColor: t.primaryBg }]}>
                <Ionicons name="people" size={22} color={selectedGroup ? t.primary : t.subtext} />
              </View>
              <Text style={[s.actionLabel, !!selectedGroup && { color: t.primary }]}>Group</Text>
              <Text style={[s.actionValue, !!selectedGroup && { color: t.primary, fontWeight: '600' }]} numberOfLines={1}>
                {selectedGroup ? (userGroups.find(g => g.id === selectedGroup)?.name ?? 'Group') : 'None'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={s.actionRow}>
            {/* Scan Bill */}
            <TouchableOpacity style={s.actionCard} onPress={() => setShowScanModal(true)} activeOpacity={0.75}>
              <View style={[s.actionIconCircle, { backgroundColor: t.successBg }]}>
                <Ionicons name="scan" size={22} color={t.success} />
              </View>
              <Text style={s.actionLabel}>Scan Bill</Text>
              <Text style={s.actionValue}>Auto-fill</Text>
            </TouchableOpacity>

            {/* Note */}
            <TouchableOpacity style={[s.actionCard, !!note.trim() && s.actionCardActive]} onPress={() => setShowNoteModal(true)} activeOpacity={0.75}>
              <View style={[s.actionIconCircle, !!note.trim() && { backgroundColor: t.primaryBg }]}>
                <Ionicons name="create" size={22} color={note.trim() ? t.primary : t.subtext} />
              </View>
              <Text style={[s.actionLabel, !!note.trim() && { color: t.primary }]}>Note</Text>
              <Text style={[s.actionValue, !!note.trim() && { color: t.primary, fontWeight: '600' }]} numberOfLines={1}>
                {note.trim() ? note.trim() : 'Add note'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={s.actionRow}>
            {/* Repeat */}
            <TouchableOpacity
              style={[s.actionCard, !!recurring && { backgroundColor: '#f0f9ff', borderWidth: 1.5, borderColor: '#0ea5e9' }]}
              onPress={() => setShowRecurringModal(true)}
              activeOpacity={0.75}
            >
              <View style={[s.actionIconCircle, { backgroundColor: recurring ? '#f0f9ff' : t.inputBg }]}>
                <Ionicons name="repeat-outline" size={22} color={recurring ? '#0ea5e9' : t.subtext} />
              </View>
              <Text style={[s.actionLabel, !!recurring && { color: '#0ea5e9' }]}>Repeat</Text>
              <Text style={[s.actionValue, !!recurring && { color: '#0ea5e9', fontWeight: '600' }]} numberOfLines={1}>
                {recurring
                  ? recurring.charAt(0).toUpperCase() + recurring.slice(1)
                  : 'None'}
              </Text>
            </TouchableOpacity>
          </View>

      </ScrollView>

      {/* Date picker modal — outside KAV */}
      {showDatePicker && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
          <TouchableOpacity style={s.datePickerOverlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
            <View style={s.datePickerSheet}>
              <View style={s.datePickerHeader}>
                <Text style={s.datePickerTitle}>Select Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={s.datePickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dateObj}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(_event, selected) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (selected) {
                    setDateObj(selected);
                    setDate(selected.toISOString().split('T')[0]);
                  }
                }}
                style={{ width: '100%' }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Quick split modal */}
      <Modal visible={showQuickModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowQuickModal(false)}>
        <QuickSplitModal
          current={quickSplit}
          members={members}
          currentUserId={user?.id ?? ''}
          total={total}
          currency={currency}
          onSelect={handleSelectQuick}
          onMoreOptions={() => { setShowQuickModal(false); setShowOptionsModal(true); }}
          onClose={() => setShowQuickModal(false)}
        />
      </Modal>

      {/* People picker modal (non-group mode) */}
      {!groupId && (
        <Modal visible={showPeopleModal} animationType="slide" presentationStyle="pageSheet"
          onRequestClose={() => setShowPeopleModal(false)}>
          <PeoplePickerModal
            currentUserId={user?.id ?? ''}
            selected={withPeople}
            onDone={(people) => { setWithPeople(people); setShowPeopleModal(false); }}
            onClose={() => setShowPeopleModal(false)}
          />
        </Modal>
      )}

      {/* Full split options modal */}
      <Modal visible={showOptionsModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowOptionsModal(false)}>
        <SplitOptionsModal
          initialMethod={splitMethod}
          initialMembers={members}
          initialPaidBy={paidByUserId}
          currentUserId={user?.id ?? ''}
          total={total}
          currency={currency}
          onDone={handleOptionsModalDone}
          onClose={() => setShowOptionsModal(false)}
        />
      </Modal>

      {/* Currency picker modal */}
      <Modal visible={showCurrencyModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowCurrencyModal(false)}>
        <CurrencyModal
          current={currency}
          onSelect={(c) => { setCurrency(c); setShowCurrencyModal(false); }}
          onClose={() => setShowCurrencyModal(false)}
        />
      </Modal>

      {/* Icon picker modal */}
      <Modal visible={showIconModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowIconModal(false)}>
        <IconPickerModal
          current={iconInfo}
          onSelect={(icon) => { setManualIcon(icon); setShowIconModal(false); }}
          onClose={() => setShowIconModal(false)}
        />
      </Modal>

      {/* Group picker modal */}
      <Modal visible={showGroupModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowGroupModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}>
            <TouchableOpacity onPress={() => setShowGroupModal(false)}>
              <Text style={{ color: t.subtext, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Add to Group</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView>
            {/* No group option */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, gap: 14 }}
              onPress={() => { setSelectedGroup(''); setShowGroupModal(false); }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.inputBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close-outline" size={22} color={t.subtext} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, color: t.text, fontWeight: '500' }}>No group</Text>
              {!selectedGroup && <Ionicons name="checkmark-circle" size={22} color={t.primary} />}
            </TouchableOpacity>
            {userGroups.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
                <Ionicons name="people-circle-outline" size={48} color={t.muted} />
                <Text style={{ color: t.placeholder, fontSize: 15 }}>You have no groups yet</Text>
              </View>
            ) : (
              userGroups.map(g => (
                <TouchableOpacity key={g.id}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, gap: 14 }}
                  onPress={() => { setSelectedGroup(g.id); setShowGroupModal(false); }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={20} color={t.primary} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, color: t.text, fontWeight: '500' }}>{g.name}</Text>
                  {selectedGroup === g.id && <Ionicons name="checkmark-circle" size={22} color={t.primary} />}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Note modal */}
      <Modal visible={showNoteModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowNoteModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}>
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Text style={{ color: t.subtext, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Add Note</Text>
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Text style={{ color: t.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={{ margin: 16, backgroundColor: t.card, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <TextInput
              style={{ fontSize: 15, color: t.text, minHeight: 120, textAlignVertical: 'top' }}
              placeholder="Add a note to this expense… (e.g. split for the Dubai trip)"
              placeholderTextColor={t.placeholder}
              value={note}
              onChangeText={setNote}
              multiline
              autoFocus
              returnKeyType="default"
            />
          </View>
          {note.trim() ? (
            <TouchableOpacity
              style={{ marginHorizontal: 16, alignItems: 'center', paddingVertical: 10 }}
              onPress={() => setNote('')}
            >
              <Text style={{ color: t.danger, fontSize: 14 }}>Clear note</Text>
            </TouchableOpacity>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Recurring picker modal */}
      <Modal visible={showRecurringModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowRecurringModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}>
            <TouchableOpacity onPress={() => setShowRecurringModal(false)}>
              <Text style={{ color: t.subtext, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>Repeat</Text>
            <TouchableOpacity onPress={() => setShowRecurringModal(false)}>
              <Text style={{ color: '#0ea5e9', fontSize: 16, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {([null, 'daily', 'weekly', 'monthly', 'yearly'] as (string | null)[]).map((opt) => {
              const label = opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : 'None';
              const isSelected = recurring === opt;
              return (
                <TouchableOpacity
                  key={String(opt)}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}
                  onPress={() => { setRecurring(opt); setShowRecurringModal(false); }}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: opt ? '#f0f9ff' : t.inputBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    <Ionicons
                      name={opt ? 'repeat-outline' : 'close-outline'}
                      size={22}
                      color={opt ? '#0ea5e9' : t.subtext}
                    />
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, color: t.text, fontWeight: '500' }}>{label}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color="#0ea5e9" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Bill scanner modal */}
      <Modal visible={showScanModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowScanModal(false)}>
        <BillScanModal
          onApply={(parsed) => {
            if (parsed.description) setDescription(parsed.description);
            if (parsed.amount > 0)  setAmount(parsed.amount.toFixed(2));
            setShowScanModal(false);
          }}
          onClose={() => setShowScanModal(false)}
        />
      </Modal>

    </SafeAreaView>
  );
}

// ─── BillScanModal ────────────────────────────────────────────────────────────

type ScanStep = 'pick' | 'scanning' | 'result' | 'error';

function BillScanModal({
  onApply,
  onClose,
}: {
  onApply: (parsed: ParsedReceipt) => void;
  onClose: () => void;
}) {
  const t  = useTheme();
  const sc = useMemo(() => makeScStyles(t), [t]);
  const [step,        setStep]        = useState<ScanStep>('pick');
  const [imageUri,    setImageUri]    = useState<string | null>(null);
  const [parsed,      setParsed]      = useState<ParsedReceipt | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [editDesc,    setEditDesc]    = useState('');
  const [editAmount,  setEditAmount]  = useState('');
  const [showRawText, setShowRawText] = useState(false);

  // Pulsing animation for scan step
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (step !== 'scanning') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [step]);

  async function handlePickImage(useCamera: boolean) {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (perm.status !== 'granted') {
      Alert.alert(
        'Permission needed',
        useCamera
          ? 'Camera access is required to scan bills.'
          : 'Photo library access is required to import bills.',
      );
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality:    0.85,
          base64:     true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality:    0.85,
          base64:     true,
        });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setStep('scanning');

    try {
      if (!GOOGLE_VISION_API_KEY) {
        throw new Error('NO_API_KEY');
      }
      const base64 = asset.base64!;
      const text   = await extractTextFromImage(base64);
      if (!text.trim()) throw new Error('NO_TEXT');
      const p = parseReceiptText(text);
      setParsed(p);
      setEditDesc(p.description);
      setEditAmount(p.amount > 0 ? p.amount.toFixed(2) : '');
      setStep('result');
    } catch (err: any) {
      let msg = 'Could not read the receipt. Please try again or enter manually.';
      if (err.message === 'NO_API_KEY') {
        msg = 'Google Vision API key is not configured.\n\nOpen lib/ocr.ts and paste your key in GOOGLE_VISION_API_KEY.';
      } else if (err.message === 'NO_TEXT') {
        msg = 'No text was found in the image. Try a clearer photo with good lighting.';
      }
      setErrorMsg(msg);
      setStep('error');
    }
  }

  function handleApply() {
    const amt = parseFloat(editAmount) || 0;
    onApply({
      description: editDesc.trim(),
      amount:      amt,
      items:       parsed?.items ?? [],
      rawText:     parsed?.rawText ?? '',
    });
  }

  // ── Pick step ──────────────────────────────────────────────────────────────
  if (step === 'pick') {
    return (
      <SafeAreaView style={sc.screen}>
        <View style={sc.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={t.subtext} />
          </TouchableOpacity>
          <Text style={sc.headerTitle}>Scan Bill</Text>
          <View style={{ width: 30 }} />
        </View>

        {/* Hero */}
        <View style={sc.hero}>
          <View style={sc.heroIconWrap}>
            <Ionicons name="scan-outline" size={56} color={t.primary} />
          </View>
          <Text style={sc.heroTitle}>Scan your receipt</Text>
          <Text style={sc.heroSub}>
            Take a photo or import from your gallery.{'\n'}
            Description and total amount will be filled automatically.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={sc.actionGroup}>
          <TouchableOpacity style={sc.actionBtn} onPress={() => handlePickImage(true)} activeOpacity={0.8}>
            <View style={sc.actionIconBox}>
              <Ionicons name="camera" size={28} color="#4f46e5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sc.actionTitle}>Take Photo</Text>
              <Text style={sc.actionSub}>Use your camera to scan the receipt</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
          </TouchableOpacity>

          <View style={sc.actionDivider} />

          <TouchableOpacity style={sc.actionBtn} onPress={() => handlePickImage(false)} activeOpacity={0.8}>
            <View style={[sc.actionIconBox, { backgroundColor: '#f0f9ff' }]}>
              <Ionicons name="images" size={28} color="#0ea5e9" />
              {/* keep sky-blue for image picker — not a semantic token */}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sc.actionTitle}>Choose from Gallery</Text>
              <Text style={sc.actionSub}>Import an existing receipt photo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
          </TouchableOpacity>
        </View>

        <Text style={sc.tipText}>
          💡 Tip: Ensure good lighting and that the full receipt is visible for best results.
        </Text>
      </SafeAreaView>
    );
  }

  // ── Scanning step ──────────────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <SafeAreaView style={sc.screen}>
        <View style={sc.header}>
          <View style={{ width: 30 }} />
          <Text style={sc.headerTitle}>Scanning…</Text>
          <View style={{ width: 30 }} />
        </View>

        <View style={sc.scanningBody}>
          {/* Image preview */}
          {imageUri && (
            <View style={sc.imagePreviewWrap}>
              <Image source={{ uri: imageUri }} style={sc.imagePreview} resizeMode="cover" />
              {/* Scanning lines overlay */}
              <View style={sc.scanOverlay} pointerEvents="none">
                <View style={sc.scanCornerTL} />
                <View style={sc.scanCornerTR} />
                <View style={sc.scanCornerBL} />
                <View style={sc.scanCornerBR} />
              </View>
            </View>
          )}

          <Animated.View style={[sc.scanSpinner, { transform: [{ scale: pulse }] }]}>
            <Ionicons name="scan" size={40} color="#4f46e5" />
          </Animated.View>

          <Text style={sc.scanningTitle}>Reading your receipt…</Text>
          <Text style={sc.scanningSubtitle}>Extracting description and amount</Text>

          <View style={sc.scanSteps}>
            {['Analysing image', 'Detecting text', 'Extracting amounts'].map((label, i) => (
              <View key={i} style={sc.scanStepRow}>
                <ActivityIndicator size="small" color={t.primary} style={{ marginRight: 10 }} />
                <Text style={sc.scanStepText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error step ─────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <SafeAreaView style={sc.screen}>
        <View style={sc.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={t.subtext} />
          </TouchableOpacity>
          <Text style={sc.headerTitle}>Scan Bill</Text>
          <View style={{ width: 30 }} />
        </View>

        <View style={sc.errorBody}>
          <View style={sc.errorIconWrap}>
            <Ionicons name="warning-outline" size={40} color="#f97316" />
          </View>
          <Text style={sc.errorTitle}>Could not read receipt</Text>
          <Text style={sc.errorMsg}>{errorMsg}</Text>

          <TouchableOpacity style={sc.retryBtn} onPress={() => setStep('pick')} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={sc.retryBtnText}>Try again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={sc.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={sc.cancelBtnText}>Enter manually</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Result step ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={sc.screen}>
      <View style={sc.header}>
        <TouchableOpacity onPress={() => setStep('pick')} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={t.subtext} />
        </TouchableOpacity>
        <Text style={sc.headerTitle}>Review & Apply</Text>
        <TouchableOpacity onPress={handleApply} style={{ padding: 4 }}>
          <Text style={sc.applyHeaderBtn}>Apply</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {/* Thumbnail */}
        {imageUri && (
          <View style={sc.thumbRow}>
            <Image source={{ uri: imageUri }} style={sc.thumb} resizeMode="cover" />
            <View style={sc.thumbBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
              <Text style={sc.thumbBadgeText}>Receipt scanned</Text>
            </View>
          </View>
        )}

        {/* Extracted fields */}
        <Text style={sc.sectionLabel}>EXTRACTED DETAILS</Text>
        <View style={sc.resultCard}>
          {/* Description */}
          <View style={sc.resultRow}>
            <View style={sc.resultIconBox}>
              <Ionicons name="document-text-outline" size={18} color="#4f46e5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sc.resultFieldLabel}>Description</Text>
              <TextInput
                style={sc.resultInput}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="e.g. Dinner at Nobu"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={sc.resultDivider} />

          {/* Amount */}
          <View style={sc.resultRow}>
            <View style={[sc.resultIconBox, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="cash-outline" size={18} color="#16a34a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sc.resultFieldLabel}>Total Amount</Text>
              <TextInput
                style={sc.resultInput}
                value={editAmount}
                onChangeText={setEditAmount}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
          </View>
        </View>

        {/* Line items (if any) */}
        {(parsed?.items ?? []).length > 0 && (
          <>
            <Text style={sc.sectionLabel}>LINE ITEMS FOUND</Text>
            <View style={sc.itemsCard}>
              {(parsed!.items).map((item, i) => (
                <View key={i} style={[sc.itemRow, i < parsed!.items.length - 1 && sc.itemRowBorder]}>
                  <Text style={sc.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={sc.itemPrice}>{item.price.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Raw text toggle */}
        {parsed?.rawText ? (
          <>
            <TouchableOpacity
              style={sc.rawToggle}
              onPress={() => setShowRawText(v => !v)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showRawText ? 'chevron-up' : 'chevron-down'}
                size={14} color="#9ca3af" style={{ marginRight: 6 }}
              />
              <Text style={sc.rawToggleText}>
                {showRawText ? 'Hide' : 'Show'} raw scanned text
              </Text>
            </TouchableOpacity>
            {showRawText && (
              <View style={sc.rawBox}>
                <Text style={sc.rawText}>{parsed.rawText}</Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Apply button */}
      <View style={sc.applyBar}>
        <TouchableOpacity style={sc.applyBtn} onPress={handleApply} activeOpacity={0.85}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={sc.applyBtnText}>Apply to Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sc.rescanBtn} onPress={() => setStep('pick')} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── IconPickerModal ──────────────────────────────────────────────────────────

const ICON_CATEGORIES: {
  label: string;
  items: { name: string; label: string; color: string; bg: string }[];
}[] = [
  {
    label: 'General',
    items: [
      { name: 'receipt-outline',       label: 'Bill',        color: '#4f46e5', bg: '#eef2ff' },
      { name: 'wallet-outline',        label: 'Wallet',      color: '#4f46e5', bg: '#eef2ff' },
      { name: 'cash-outline',          label: 'Cash',        color: '#16a34a', bg: '#f0fdf4' },
      { name: 'card-outline',          label: 'Card',        color: '#0284c7', bg: '#f0f9ff' },
      { name: 'people-outline',        label: 'Group',       color: '#6366f1', bg: '#eef2ff' },
      { name: 'home-outline',          label: 'Rent/Home',   color: '#92400e', bg: '#fef3c7' },
    ],
  },
  {
    label: 'Food & Drink',
    items: [
      { name: 'restaurant-outline',    label: 'Restaurant',  color: '#f97316', bg: '#fff7ed' },
      { name: 'fast-food-outline',     label: 'Fast Food',   color: '#ef4444', bg: '#fef2f2' },
      { name: 'cafe-outline',          label: 'Coffee',      color: '#92400e', bg: '#fef3c7' },
      { name: 'wine-outline',          label: 'Drinks',      color: '#a855f7', bg: '#faf5ff' },
      { name: 'ice-cream-outline',     label: 'Dessert',     color: '#ec4899', bg: '#fdf4ff' },
      { name: 'pizza-outline',         label: 'Pizza',       color: '#f97316', bg: '#fff7ed' },
    ],
  },
  {
    label: 'Transport',
    items: [
      { name: 'car-outline',           label: 'Car',         color: '#3b82f6', bg: '#eff6ff' },
      { name: 'bus-outline',           label: 'Bus',         color: '#0ea5e9', bg: '#f0f9ff' },
      { name: 'train-outline',         label: 'Train',       color: '#6366f1', bg: '#eef2ff' },
      { name: 'airplane-outline',      label: 'Flight',      color: '#6366f1', bg: '#eef2ff' },
      { name: 'bicycle-outline',       label: 'Bicycle',     color: '#10b981', bg: '#ecfdf5' },
      { name: 'boat-outline',          label: 'Boat',        color: '#0284c7', bg: '#f0f9ff' },
    ],
  },
  {
    label: 'Shopping',
    items: [
      { name: 'bag-handle-outline',    label: 'Shopping',    color: '#ec4899', bg: '#fdf4ff' },
      { name: 'cart-outline',          label: 'Grocery',     color: '#22c55e', bg: '#f0fdf4' },
      { name: 'shirt-outline',         label: 'Clothes',     color: '#8b5cf6', bg: '#f5f3ff' },
      { name: 'storefront-outline',    label: 'Store',       color: '#f59e0b', bg: '#fffbeb' },
      { name: 'pricetag-outline',      label: 'Sale',        color: '#ef4444', bg: '#fef2f2' },
      { name: 'diamond-outline',       label: 'Luxury',      color: '#a855f7', bg: '#faf5ff' },
    ],
  },
  {
    label: 'Entertainment',
    items: [
      { name: 'film-outline',          label: 'Movies',      color: '#8b5cf6', bg: '#f5f3ff' },
      { name: 'musical-notes-outline', label: 'Music',       color: '#ec4899', bg: '#fdf4ff' },
      { name: 'game-controller-outline',label:'Gaming',      color: '#6366f1', bg: '#eef2ff' },
      { name: 'tv-outline',            label: 'TV',          color: '#374151', bg: '#f3f4f6' },
      { name: 'camera-outline',        label: 'Photo',       color: '#0284c7', bg: '#f0f9ff' },
      { name: 'book-outline',          label: 'Books',       color: '#92400e', bg: '#fef3c7' },
    ],
  },
  {
    label: 'Health & Fitness',
    items: [
      { name: 'barbell-outline',       label: 'Gym',         color: '#10b981', bg: '#ecfdf5' },
      { name: 'medkit-outline',        label: 'Medical',     color: '#ef4444', bg: '#fef2f2' },
      { name: 'fitness-outline',       label: 'Fitness',     color: '#22c55e', bg: '#f0fdf4' },
      { name: 'heart-outline',         label: 'Health',      color: '#f43f5e', bg: '#fff1f2' },
      { name: 'bed-outline',           label: 'Sleep',       color: '#6366f1', bg: '#eef2ff' },
      { name: 'paw-outline',           label: 'Pets',        color: '#f97316', bg: '#fff7ed' },
    ],
  },
  {
    label: 'Utilities',
    items: [
      { name: 'flash-outline',         label: 'Electric',    color: '#f59e0b', bg: '#fffbeb' },
      { name: 'water-outline',         label: 'Water',       color: '#0284c7', bg: '#f0f9ff' },
      { name: 'wifi-outline',          label: 'Internet',    color: '#6366f1', bg: '#eef2ff' },
      { name: 'phone-portrait-outline',label: 'Phone',       color: '#374151', bg: '#f3f4f6' },
      { name: 'school-outline',        label: 'Education',   color: '#0ea5e9', bg: '#f0f9ff' },
      { name: 'gift-outline',          label: 'Gift',        color: '#f43f5e', bg: '#fff1f2' },
    ],
  },
];

function IconPickerModal({
  current, onSelect, onClose,
}: {
  current: { name: string; color: string; bg: string };
  onSelect: (icon: { name: string; color: string; bg: string }) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <Ionicons name="close" size={22} color={t.subtext} />
        </TouchableOpacity>
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Choose Icon</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {ICON_CATEGORIES.map(cat => (
          <View key={cat.label} style={{ marginTop: 24, paddingHorizontal: 16 }}>
            {/* Category label */}
            <Text style={{ color: t.placeholder, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 }}>
              {cat.label}
            </Text>
            {/* 4-column grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {cat.items.map(item => {
                const isSelected = current.name === item.name;
                return (
                  <TouchableOpacity
                    key={item.name}
                    onPress={() => onSelect({ name: item.name, color: item.color, bg: item.bg })}
                    activeOpacity={0.75}
                    style={{
                      width: '22%',
                      alignItems: 'center',
                      backgroundColor: t.card,
                      borderRadius: 14,
                      paddingVertical: 12,
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: isSelected ? item.color : 'transparent',
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
                    }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                      <Ionicons name={item.name as any} size={22} color={item.color} />
                    </View>
                    <Text style={{ fontSize: 11, color: t.text, fontWeight: '500', textAlign: 'center' }}>{item.label}</Text>
                    {isSelected && (
                      <View style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: item.color, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── CurrencyModal ────────────────────────────────────────────────────────────

function CurrencyModal({
  current, onSelect, onClose,
}: {
  current: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? CURRENCIES.filter(c =>
        c.code.toLowerCase().includes(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase()))
    : CURRENCIES;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <Ionicons name="close" size={22} color={t.subtext} />
        </TouchableOpacity>
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Select Currency</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Search */}
      <View style={{ margin: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
        <Ionicons name="search-outline" size={16} color={t.placeholder} style={{ marginRight: 8 }} />
        <TextInput
          style={{ flex: 1, fontSize: 15, color: t.text }}
          placeholder="Search currency…"
          placeholderTextColor={t.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginHorizontal: 14, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
          {filtered.map((c, i) => (
            <TouchableOpacity
              key={c.code}
              onPress={() => onSelect(c.code)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: t.border }}
              activeOpacity={0.7}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.inputBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{c.symbol}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{c.code}</Text>
                <Text style={{ color: t.placeholder, fontSize: 13, marginTop: 1 }}>{c.name}</Text>
              </View>
              {current === c.code && (
                <Ionicons name="checkmark-circle" size={22} color={t.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── PeoplePickerModal ────────────────────────────────────────────────────────

function PeoplePickerModal({
  currentUserId, selected, onDone, onClose,
}: {
  currentUserId: string;
  selected: { id: string; full_name: string }[];
  onDone: (people: { id: string; full_name: string }[]) => void;
  onClose: () => void;
}) {
  const t  = useTheme();
  const pp = useMemo(() => makePpStyles(t), [t]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([]);
  const [picked,   setPicked]   = useState<Set<string>>(new Set(selected.map(p => p.id)));
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [query,    setQuery]    = useState('');

  async function fetchProfiles() {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      if (err) {
        setError(err.message);
      } else if (data) {
        setProfiles(data.filter((p: any) => p.id !== currentUserId));
      }
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProfiles(); }, []);

  const filtered = query.trim()
    ? profiles.filter(p => p.full_name.toLowerCase().includes(query.toLowerCase()))
    : profiles;

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDone() {
    onDone(profiles.filter(p => picked.has(p.id)));
  }

  return (
    <SafeAreaView style={pp.screen}>
      <View style={pp.header}>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={pp.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={pp.title}>Split with</Text>
        <TouchableOpacity onPress={handleDone} style={{ padding: 8 }}>
          <Text style={pp.done}>Done{picked.size > 0 ? ` (${picked.size})` : ''}</Text>
        </TouchableOpacity>
      </View>

      <View style={pp.searchBar}>
        <Ionicons name="search-outline" size={16} color={t.placeholder} style={{ marginRight: 6 }} />
        <TextInput
          style={pp.searchInput} placeholder="Search people…"
          placeholderTextColor={t.placeholder} value={query}
          onChangeText={setQuery} autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 24 }}>
          <Text style={{ color: t.danger, fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
            {error}
          </Text>
          <TouchableOpacity onPress={fetchProfiles} style={{ backgroundColor: t.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled">
          {filtered.map((p, i) => (
            <TouchableOpacity key={p.id}
              style={[pp.row, i < filtered.length - 1 && pp.rowBorder]}
              onPress={() => toggle(p.id)}
            >
              <View style={pp.avatar}>
                <Text style={pp.avatarText}>{getInitials(p.full_name)}</Text>
              </View>
              <Text style={pp.name}>{p.full_name}</Text>
              <View style={[pp.check, picked.has(p.id) && pp.checkOn]}>
                {picked.has(p.id) && <Text style={pp.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && (
            <Text style={{ color: t.placeholder, textAlign: 'center', marginTop: 40, fontSize: 14 }}>
              {query ? 'No matches' : 'No other users found'}
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── QuickSplitModal ──────────────────────────────────────────────────────────

function QuickSplitModal({
  current, members, currentUserId, total, currency, onSelect, onMoreOptions, onClose,
}: {
  current: QuickSplit; members: Member[]; currentUserId: string; total: number; currency: string;
  onSelect: (qs: QuickSplit) => void; onMoreOptions: () => void; onClose: () => void;
}) {
  const t  = useTheme();
  const qm = useMemo(() => makeQmStyles(t), [t]);
  const me    = members.find(m => m.user_id === currentUserId);
  const other = members.find(m => m.user_id !== currentUserId);
  const myInit    = me?.initials    ?? 'ME';
  const otherInit = other?.initials ?? '?';
  const otherName = other?.full_name.split(' ')[0] ?? 'Others';
  const n     = members.length;
  const share = n > 0 ? total / n : 0;
  const full  = n > 1 ? total / (n - 1) : total;

  const options: {
    key: QuickSplit; leftInit: string; leftBg: string;
    rightInit: string; rightBg: string; isGreen: boolean; isEqual: boolean;
    title: string; subtitle: string;
  }[] = [
    {
      key: 'you-equal', leftInit: myInit, leftBg: '#4f46e5',
      rightInit: otherInit, rightBg: '#6b7280', isGreen: true, isEqual: true,
      title:    'You paid, split equally.',
      subtitle: total > 0 ? `${otherName} owes you ${formatCurrency(share, currency)}.` : `${otherName} owes you half.`,
    },
    {
      key: 'you-full', leftInit: myInit, leftBg: '#4f46e5',
      rightInit: otherInit, rightBg: '#6b7280', isGreen: true, isEqual: false,
      title:    'You are owed the full amount.',
      subtitle: total > 0 ? `${otherName} owes you ${formatCurrency(n === 2 ? total : full, currency)}.` : `${otherName} owes you everything.`,
    },
    {
      key: 'other-equal', leftInit: otherInit, leftBg: '#6b7280',
      rightInit: myInit, rightBg: '#4f46e5', isGreen: false, isEqual: true,
      title:    `${otherName} paid, split equally.`,
      subtitle: total > 0 ? `You owe ${otherName} ${formatCurrency(share, currency)}.` : `You owe ${otherName} half.`,
    },
    {
      key: 'other-full', leftInit: otherInit, leftBg: '#6b7280',
      rightInit: myInit, rightBg: '#4f46e5', isGreen: false, isEqual: false,
      title:    `${otherName} is owed the full amount.`,
      subtitle: total > 0 ? `You owe ${otherName} ${formatCurrency(n === 2 ? total : full, currency)}.` : `You owe ${otherName} everything.`,
    },
  ];

  return (
    <SafeAreaView style={qm.screen}>
      <View style={qm.header}>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={qm.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={qm.title}>Expense details</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={qm.subtitle}>
        <Text style={qm.subtitleText}>How was this expense split?</Text>
      </View>

      {options.map((opt, i) => (
        <TouchableOpacity key={opt.key}
          style={[qm.row, i < options.length - 1 && qm.rowBorder]}
          onPress={() => onSelect(opt.key)}
        >
          <SplitAvatarIcon
            leftInit={opt.leftInit}   leftBg={opt.leftBg}
            rightInit={opt.rightInit} rightBg={opt.rightBg}
            isEqual={opt.isEqual}
            accentColor={opt.isGreen ? '#16a34a' : '#ef4444'}
          />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={qm.rowTitle}>{opt.title}</Text>
            <Text style={[qm.rowSub, { color: opt.isGreen ? '#16a34a' : '#ef4444' }]}>
              {opt.subtitle}
            </Text>
          </View>
          {current === opt.key && <Text style={qm.check}>✓</Text>}
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={qm.moreBtn} onPress={onMoreOptions}>
        <Text style={qm.moreBtnText}>More options</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── SplitAvatarIcon ──────────────────────────────────────────────────────────

function SplitAvatarIcon({
  leftInit, leftBg, rightInit, rightBg, isEqual, accentColor,
}: {
  leftInit: string; leftBg: string; rightInit: string; rightBg: string;
  isEqual: boolean; accentColor: string;
}) {
  const SIZE = 44, HALF = SIZE / 2;
  return (
    <View style={{ width: SIZE + 20, height: SIZE }}>
      <View style={[ai.circle, {
        width: SIZE, height: SIZE, borderRadius: HALF, backgroundColor: leftBg,
        left: 0, zIndex: 2, borderWidth: 2.5, borderColor: accentColor,
      }]}>
        {isEqual && (
          <View style={{
            position: 'absolute', right: 0, top: 0, width: HALF, height: SIZE,
            backgroundColor: 'rgba(255,255,255,0.22)',
            borderTopRightRadius: HALF, borderBottomRightRadius: HALF,
          }} />
        )}
        <Text style={ai.initials}>{leftInit}</Text>
      </View>
      <View style={[ai.circle, {
        width: SIZE, height: SIZE, borderRadius: HALF, backgroundColor: rightBg,
        left: SIZE * 0.55, zIndex: 1, borderWidth: 2.5, borderColor: '#fff',
      }]}>
        <Text style={ai.initials}>{rightInit}</Text>
      </View>
    </View>
  );
}

// ─── SplitOptionsModal (Splitwise-style "Split options" screen) ───────────────

const METHOD_TABS: { key: SplitMethod; icon: string }[] = [
  { key: 'equal',      icon: '=' },
  { key: 'unequal',    icon: '1.23' },
  { key: 'percentage', icon: '%' },
  { key: 'shares',     icon: '⫶' },
  { key: 'adjustment', icon: '+/−' },
];

const METHOD_INFO: Record<SplitMethod, { title: string; desc: string }> = {
  equal:      { title: 'Split equally',    desc: 'Select which people owe an equal share.' },
  unequal:    { title: 'Unequal amounts',  desc: 'Enter the exact amount each person owes.' },
  percentage: { title: 'By percentages',   desc: 'Enter the percentage each person owes.' },
  shares:     { title: 'By shares',        desc: 'Enter the number of shares per person.' },
  adjustment: { title: 'By adjustment',    desc: 'Start equally, then adjust per person.' },
};

function SplitOptionsModal({
  initialMethod, initialMembers, initialPaidBy, currentUserId, total, currency,
  onDone, onClose,
}: {
  initialMethod:  SplitMethod;
  initialMembers: Member[];
  initialPaidBy:  string;
  currentUserId:  string;
  total:          number;
  currency:       string;
  onDone: (r: { method: SplitMethod; members: Member[]; paidBy: string }) => void;
  onClose: () => void;
}) {
  const t  = useTheme();
  const so = useMemo(() => makeSoStyles(t), [t]);
  const [method,  setMethod]  = useState<SplitMethod>(initialMethod);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [paidBy,  setPaidBy]  = useState<string>(initialPaidBy);
  const [showPayerPicker, setShowPayerPicker] = useState(false);

  const splits        = computeSplitsFor(method, members, total);
  const includedCount = method === 'equal' || method === 'adjustment'
    ? members.filter(m => m.included).length : members.length;
  const perPerson     = includedCount > 0 ? total / includedCount : 0;
  const allIncluded   = members.every(m => m.included);

  const splitsSum     = splits.reduce((s, x) => s + x.amount, 0);
  const isBalanced    = method === 'percentage'
    ? Math.abs(members.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0) - 100) < 0.01
    : method === 'adjustment' ? true
    : Math.abs(splitsSum - total) < 0.02;

  const paidByMember  = members.find(m => m.user_id === paidBy);
  const paidByDisplay = paidBy === currentUserId ? 'you' : (paidByMember?.full_name.split(' ')[0] ?? 'someone');

  function update(uid: string, patch: Partial<Member>) {
    setMembers(prev => prev.map(m => m.user_id === uid ? { ...m, ...patch } : m));
  }

  function amountFor(uid: string) {
    return splits.find(s => s.user_id === uid)?.amount ?? 0;
  }

  return (
    <SafeAreaView style={so.screen}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={so.header}>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={so.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={so.title}>Split options</Text>
        <TouchableOpacity onPress={() => onDone({ method, members, paidBy })} style={{ padding: 8 }}>
          <Text style={so.done}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* ── Paid by ───────────────────────────────────────────────────── */}
      <TouchableOpacity style={so.paidByRow} onPress={() => setShowPayerPicker(true)}>
        {/* Mini split pie */}
        <View style={so.paidByPie}>
          <View style={[so.paidByPieLeft,  { backgroundColor: t.success }]} />
          <View style={[so.paidByPieRight, { backgroundColor: t.successBg }]} />
        </View>
        <Text style={so.paidByText}>
          Paid by{' '}
          <Text style={{ fontWeight: '700', color: t.text }}>{paidByDisplay}</Text>
        </Text>
        <Text style={so.paidByChevron}>›</Text>
      </TouchableOpacity>

      {/* ── Avatar strip ──────────────────────────────────────────────── */}
      <View style={so.avatarStrip}>
        {/* Bill icon */}
        <View style={so.billIcon}>
          <Ionicons name="receipt-outline" size={26} color="#6b7280" />
        </View>
        {members.map(m => {
          const canToggle = method === 'equal' || method === 'adjustment';
          const dim = canToggle && !m.included;
          return (
            <TouchableOpacity
              key={m.user_id}
              style={[so.avatarStripBtn, dim && so.avatarStripDim]}
              onPress={() => canToggle && update(m.user_id, { included: !m.included })}
              activeOpacity={canToggle ? 0.7 : 1}
            >
              <View style={[so.avatarCircle, dim && { backgroundColor: t.muted }]}>
                <Text style={[so.avatarInit, dim && { color: t.placeholder }]}>{m.initials}</Text>
              </View>
              {!dim && (
                <View style={so.avatarDot}>
                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Method description ────────────────────────────────────────── */}
      <View style={so.methodDesc}>
        <Text style={so.methodTitle}>{METHOD_INFO[method].title}</Text>
        <Text style={so.methodSubtitle}>{METHOD_INFO[method].desc}</Text>
      </View>

      {/* ── Method tab bar ────────────────────────────────────────────── */}
      <View style={so.tabBar}>
        {METHOD_TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[so.tab, method === t.key && so.tabActive]}
            onPress={() => setMethod(t.key)}
          >
            <Text style={[so.tabText, method === t.key && so.tabTextActive]}>{t.icon}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Running total badge (non-equal modes) ─────────────────────── */}
      {method !== 'equal' && method !== 'adjustment' && total > 0 && (
        <View style={so.balanceBar}>
          <Text style={[so.balanceText, !isBalanced && { color: t.danger }]}>
            {method === 'percentage'
              ? `${members.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0).toFixed(0)}% of 100%`
              : `${formatCurrency(splitsSum, currency)} of ${formatCurrency(total, currency)}`}
          </Text>
          {!isBalanced && (
            <Text style={so.balanceBadge}>
              {method === 'percentage'
                ? `${(100 - members.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0)).toFixed(0)}% left`
                : `${formatCurrency(Math.abs(total - splitsSum), currency)} left`}
            </Text>
          )}
        </View>
      )}

      {/* ── Member list ───────────────────────────────────────────────── */}
      <ScrollView style={{ flex: 1 }}>
        {members.map((m) => {
          const isMe = m.user_id === currentUserId;
          const excluded = (method === 'equal' || method === 'adjustment') && !m.included;
          const computed = amountFor(m.user_id);

          return (
            <TouchableOpacity
              key={m.user_id}
              style={[so.memberRow, excluded && so.memberRowDim]}
              onPress={() => {
                if (method === 'equal' || method === 'adjustment') {
                  update(m.user_id, { included: !m.included });
                }
              }}
              activeOpacity={(method === 'equal' || method === 'adjustment') ? 0.7 : 1}
            >
              {/* Avatar */}
              <View style={[so.memberAvatar, excluded && { backgroundColor: t.border }]}>
                <Text style={[so.memberInit, excluded && { color: t.placeholder }]}>{m.initials}</Text>
              </View>

              {/* Name */}
              <Text style={[so.memberName, excluded && { color: t.placeholder }]}>
                {isMe ? `${m.full_name} (you)` : m.full_name}
              </Text>

              {/* Right side input / checkmark */}
              {method === 'equal' && (
                <View style={[so.checkCircle, m.included && so.checkCircleOn]}>
                  {m.included && <Text style={so.checkMark}>✓</Text>}
                </View>
              )}

              {method === 'unequal' && (
                <View style={so.inputWrap}>
                  <Text style={so.inputPrefix}>$</Text>
                  <TextInput style={so.input} placeholder="0.00" placeholderTextColor="#9ca3af"
                    value={m.owed} onChangeText={v => update(m.user_id, { owed: v })}
                    keyboardType="decimal-pad" returnKeyType="done" />
                </View>
              )}

              {method === 'percentage' && (
                <View style={so.inputWrap}>
                  <TextInput style={so.input} placeholder="0" placeholderTextColor="#9ca3af"
                    value={m.pct} onChangeText={v => update(m.user_id, { pct: v })}
                    keyboardType="decimal-pad" returnKeyType="done" />
                  <Text style={so.inputSuffix}>%</Text>
                  {total > 0 && (parseFloat(m.pct) || 0) > 0 && (
                    <Text style={so.inputHint}> = {formatCurrency(computed, currency)}</Text>
                  )}
                </View>
              )}

              {method === 'shares' && (
                <View style={so.inputWrap}>
                  <TextInput style={so.input} placeholder="1" placeholderTextColor="#9ca3af"
                    value={m.shares} onChangeText={v => update(m.user_id, { shares: v })}
                    keyboardType="decimal-pad" returnKeyType="done" />
                  <Text style={so.inputSuffix}> shares</Text>
                  {total > 0 && <Text style={so.inputHint}> = {formatCurrency(computed, currency)}</Text>}
                </View>
              )}

              {method === 'adjustment' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {total > 0 && m.included && (
                    <Text style={so.adjBase}>{formatCurrency(computed, currency)}</Text>
                  )}
                  <TextInput style={so.adjInput} placeholder="±0" placeholderTextColor="#9ca3af"
                    value={m.adjustment === '0' ? '' : m.adjustment}
                    onChangeText={v => update(m.user_id, { adjustment: v })}
                    keyboardType="numbers-and-punctuation" returnKeyType="done" />
                  <View style={[so.checkCircle, m.included && so.checkCircleOn]}>
                    {m.included && <Text style={so.checkMark}>✓</Text>}
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Bottom bar ────────────────────────────────────────────────── */}
      <View style={so.bottomBar}>
        {(method === 'equal' || method === 'adjustment') ? (
          <>
            <View>
              <Text style={so.bottomAmount}>
                {total > 0 ? `${formatCurrency(perPerson, currency)}/person` : '—'}
              </Text>
              <Text style={so.bottomCount}>({includedCount} {includedCount === 1 ? 'person' : 'people'})</Text>
            </View>
            <TouchableOpacity
              style={so.allBtn}
              onPress={() => setMembers(prev => prev.map(m => ({ ...m, included: true })))}
            >
              <Text style={[so.allBtnText, allIncluded && { color: t.success }]}>All</Text>
              <View style={[so.allCheck, allIncluded && { backgroundColor: t.success }]}>
                {allIncluded && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={[so.bottomAmount, !isBalanced && { color: t.danger }]}>
              {isBalanced ? '✓ Balanced' : `${formatCurrency(Math.abs(total - splitsSum), currency)} remaining`}
            </Text>
          </View>
        )}
      </View>

      {/* Payer sub-modal */}
      <Modal visible={showPayerPicker} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowPayerPicker(false)}>
        <PayerModal
          members={members} currentUserId={currentUserId} paidByUserId={paidBy}
          onSelect={(uid) => { setPaidBy(uid); setShowPayerPicker(false); }}
          onClose={() => setShowPayerPicker(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ─── PayerModal ───────────────────────────────────────────────────────────────

function PayerModal({
  members, currentUserId, paidByUserId, onSelect, onClose,
}: {
  members: Member[]; currentUserId: string; paidByUserId: string;
  onSelect: (uid: string) => void; onClose: () => void;
}) {
  const t  = useTheme();
  const mm = useMemo(() => makeMmStyles(t), [t]);
  return (
    <SafeAreaView style={[mm.screen, { backgroundColor: t.bg }]}>
      <View style={mm.header}>
        <Text style={mm.title}>Who paid?</Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
          <Text style={mm.close}>✕</Text>
        </TouchableOpacity>
      </View>
      {members.map((m, i) => (
        <TouchableOpacity key={m.user_id}
          style={[mm.row, i < members.length - 1 && mm.rowBorder]}
          onPress={() => onSelect(m.user_id)}
        >
          <View style={[mm.badge, paidByUserId === m.user_id && mm.badgeActive]}>
            <Text style={[mm.badgeText, paidByUserId === m.user_id && mm.badgeTextActive]}>
              {m.initials}
            </Text>
          </View>
          <Text style={[mm.rowLabel, { marginLeft: 14 }, paidByUserId === m.user_id && mm.rowLabelActive]}>
            {m.user_id === currentUserId ? `You (${m.full_name})` : m.full_name}
          </Text>
          {paidByUserId === m.user_id && <Text style={mm.check}>✓</Text>}
        </TouchableOpacity>
      ))}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeScStyles(t: ThemeColors) { return StyleSheet.create({
  screen:       { flex: 1, backgroundColor: t.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: t.text },
  applyHeaderBtn:{ color: t.primary, fontSize: 16, fontWeight: '700' },

  // Pick step
  hero:         { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, paddingBottom: 32 },
  heroIconWrap: { width: 100, height: 100, borderRadius: 28, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: t.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  heroTitle:    { fontSize: 22, fontWeight: '800', color: t.text, marginBottom: 10, textAlign: 'center' },
  heroSub:      { fontSize: 14, color: t.subtext, textAlign: 'center', lineHeight: 21 },
  actionGroup:  { marginHorizontal: 20, backgroundColor: t.card, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  actionBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 20, gap: 16 },
  actionDivider:{ height: 1, backgroundColor: t.border, marginLeft: 72 },
  actionIconBox:{ width: 52, height: 52, borderRadius: 15, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  actionTitle:  { fontSize: 16, fontWeight: '700', color: t.text },
  actionSub:    { fontSize: 13, color: t.placeholder, marginTop: 2 },
  tipText:      { textAlign: 'center', color: t.placeholder, fontSize: 13, marginTop: 24, paddingHorizontal: 32, lineHeight: 20 },

  // Scanning step
  scanningBody:     { flex: 1, alignItems: 'center', paddingTop: 30, paddingHorizontal: 24 },
  imagePreviewWrap: { width: 220, height: 160, borderRadius: 14, overflow: 'hidden', marginBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
  imagePreview:     { width: '100%', height: '100%' },
  scanOverlay:      { ...StyleSheet.absoluteFillObject },
  scanCornerTL:     { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderTopWidth: 3, borderLeftWidth: 3, borderColor: t.primary, borderTopLeftRadius: 4 },
  scanCornerTR:     { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderTopWidth: 3, borderRightWidth: 3, borderColor: t.primary, borderTopRightRadius: 4 },
  scanCornerBL:     { position: 'absolute', bottom: 6, left: 6, width: 22, height: 22, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: t.primary, borderBottomLeftRadius: 4 },
  scanCornerBR:     { position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderBottomWidth: 3, borderRightWidth: 3, borderColor: t.primary, borderBottomRightRadius: 4 },
  scanSpinner:      { width: 76, height: 76, borderRadius: 38, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  scanningTitle:    { fontSize: 20, fontWeight: '700', color: t.text, marginBottom: 8 },
  scanningSubtitle: { fontSize: 14, color: t.subtext, marginBottom: 28 },
  scanSteps:        { gap: 14, alignSelf: 'stretch', paddingHorizontal: 12 },
  scanStepRow:      { flexDirection: 'row', alignItems: 'center' },
  scanStepText:     { color: t.text, fontSize: 14, fontWeight: '500' },

  // Error step
  errorBody:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorIconWrap:{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  errorTitle:   { fontSize: 20, fontWeight: '700', color: t.text, marginBottom: 12 },
  errorMsg:     { fontSize: 14, color: t.subtext, textAlign: 'center', lineHeight: 21, marginBottom: 32 },
  retryBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: t.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginBottom: 12 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn:    { paddingVertical: 12 },
  cancelBtnText:{ color: t.subtext, fontSize: 15, fontWeight: '500' },

  // Result step
  sectionLabel:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, fontSize: 11, fontWeight: '700', color: t.placeholder, letterSpacing: 1 },
  thumbRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  thumb:           { width: 64, height: 64, borderRadius: 12 },
  thumbBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.successBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  thumbBadgeText:  { color: t.success, fontWeight: '600', fontSize: 13 },
  resultCard:      { marginHorizontal: 16, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  resultRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  resultDivider:   { height: 1, backgroundColor: t.border, marginLeft: 62 },
  resultIconBox:   { width: 36, height: 36, borderRadius: 10, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  resultFieldLabel:{ fontSize: 11, color: t.placeholder, fontWeight: '600', marginBottom: 3 },
  resultInput:     { fontSize: 15, color: t.text, fontWeight: '500', paddingVertical: 0 },
  itemsCard:       { marginHorizontal: 16, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  itemRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  itemRowBorder:   { borderBottomWidth: 1, borderBottomColor: t.border },
  itemName:        { flex: 1, fontSize: 14, color: t.text, fontWeight: '500' },
  itemPrice:       { fontSize: 14, color: t.text, fontWeight: '600', minWidth: 60, textAlign: 'right' },
  rawToggle:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 4 },
  rawToggleText:   { fontSize: 13, color: t.placeholder, fontWeight: '500' },
  rawBox:          { marginHorizontal: 16, marginBottom: 8, backgroundColor: t.inputBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: t.border },
  rawText:         { fontSize: 11, color: t.subtext, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 18 },
  applyBar:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.card },
  applyBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary, borderRadius: 14, paddingVertical: 15 },
  applyBtnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  rescanBtn:       { width: 48, height: 48, borderRadius: 14, backgroundColor: t.inputBg, alignItems: 'center', justifyContent: 'center' },
});}

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen:           { flex: 1, backgroundColor: t.bg },

  // Header
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  headerBtn:        { width: 60, alignItems: 'flex-start' },
  headerTitle:      { flex: 1, textAlign: 'center', color: t.text, fontSize: 17, fontWeight: '700' },
  saveText:         { color: t.primary, fontSize: 17, fontWeight: '700', textAlign: 'right' },

  // "With you and:" bar
  withBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, backgroundColor: t.card, gap: 10 },
  withBarLabel:     { color: t.subtext, fontSize: 14 },
  withBarBold:      { fontWeight: '700', color: t.text },
  withChip:         { flexDirection: 'row', alignItems: 'center', backgroundColor: t.primaryBg, borderRadius: 20, paddingHorizontal: 4, paddingRight: 10, gap: 6 },
  withChipAvatar:   { width: 30, height: 30, borderRadius: 15, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
  withChipInitials: { color: '#fff', fontWeight: '700', fontSize: 11 },
  withChipName:     { color: t.primary, fontSize: 13, fontWeight: '600' },
  withAddBtn:       { width: 30, height: 30, borderRadius: 15, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },

  // Card
  card:             { marginHorizontal: 16, marginTop: 20, backgroundColor: t.card, borderRadius: 20, overflow: 'hidden',
                      shadowColor: t.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 8,
                      borderWidth: 1.5, borderColor: t.primaryBg },
  cardRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 18, gap: 14 },
  cardDivider:      { height: 1.5, backgroundColor: t.primaryBg, marginLeft: 18 },
  cardIconBox:      { width: 40, height: 40, borderRadius: 12, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  cardInput:        { flex: 1, fontSize: 16, color: t.text, fontWeight: '500', paddingVertical: 2 },

  // Currency + Amount
  currencyPill:     { backgroundColor: t.inputBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 76, borderWidth: 1, borderColor: t.border },
  currencyText:     { color: t.text, fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  amountInput:      { flex: 1, fontSize: 56, fontWeight: '700', color: t.text, letterSpacing: -2, paddingVertical: 4 },

  // Split section
  splitSection:     { marginHorizontal: 16, marginTop: 20 },
  splitSectionLabel:{ color: t.success, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  splitBtn:         { backgroundColor: t.card, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 18,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      shadowColor: t.success, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 8,
                      borderWidth: 1.5, borderColor: t.successBg },
  splitBtnLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  splitBtnDot:      { width: 10, height: 10, borderRadius: 5 },
  splitBtnText:     { color: t.text, fontSize: 15, fontWeight: '600' },
  splitBtnSub:      { fontSize: 12, fontWeight: '500', marginTop: 2 },
  splitBtnRight:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  splitBtnEdit:     { color: t.placeholder, fontSize: 13, fontWeight: '500' },

  // Action grid (below Split section, inside ScrollView)
  actionGridLabel:  { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 10, fontSize: 11, fontWeight: '700', color: t.placeholder, letterSpacing: 1 },
  actionRow:        { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 10 },
  actionCard:       { flex: 1, backgroundColor: t.inputBg, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12,
                      alignItems: 'center', gap: 6 },
  actionCardActive: { backgroundColor: t.primaryBg, borderWidth: 1.5, borderColor: t.primary },
  actionIconCircle: { width: 44, height: 44, borderRadius: 13, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' },
  actionLabel:      { fontSize: 13, fontWeight: '600', color: t.subtext, textAlign: 'center' },
  actionValue:      { fontSize: 11, color: t.placeholder, fontWeight: '500', textAlign: 'center' },

  // Date picker sheet
  datePickerOverlay:{ flex: 1, justifyContent: 'flex-end', backgroundColor: t.overlay },
  datePickerSheet:  { backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  datePickerTitle:  { fontSize: 17, fontWeight: '700', color: t.text },
  datePickerDone:   { fontSize: 16, fontWeight: '700', color: t.primary },
});}

function makePpStyles(t: ThemeColors) { return StyleSheet.create({
  screen:     { flex: 1, backgroundColor: t.bg },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
  cancel:     { color: t.subtext, fontSize: 16, fontWeight: '500', paddingHorizontal: 12 },
  title:      { color: t.text, fontSize: 17, fontWeight: 'bold' },
  done:       { color: t.primary, fontSize: 16, fontWeight: '700', paddingHorizontal: 12 },
  searchBar:  { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: t.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:{ flex: 1, fontSize: 15, color: t.text },
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  rowBorder:  { borderBottomWidth: 1, borderBottomColor: t.border },
  avatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: t.primary, fontWeight: 'bold', fontSize: 15 },
  name:       { flex: 1, color: t.text, fontSize: 15, fontWeight: '500' },
  check:      { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: t.muted, alignItems: 'center', justifyContent: 'center' },
  checkOn:    { backgroundColor: t.primary, borderColor: t.primary },
  checkMark:  { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});}

const ai = StyleSheet.create({
  circle:   { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});

function makeQmStyles(t: ThemeColors) { return StyleSheet.create({
  screen:      { flex: 1, backgroundColor: t.card },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  cancel:      { color: t.primary, fontSize: 16, fontWeight: '600', paddingHorizontal: 8 },
  title:       { color: t.text, fontSize: 17, fontWeight: 'bold' },
  subtitle:    { backgroundColor: t.bg, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  subtitleText:{ color: t.text, fontSize: 14, fontWeight: '500' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: t.border },
  rowTitle:    { color: t.text, fontSize: 15, fontWeight: '500' },
  rowSub:      { fontSize: 13, marginTop: 3, fontWeight: '500' },
  check:       { color: t.success, fontSize: 20, fontWeight: 'bold', marginLeft: 'auto' as any },
  moreBtn:     { marginHorizontal: 20, marginTop: 24, paddingVertical: 14, borderWidth: 1.5, borderColor: t.muted, borderRadius: 12, alignItems: 'center' },
  moreBtnText: { color: t.text, fontSize: 15, fontWeight: '600' },
});}

function makeSoStyles(t: ThemeColors) { return StyleSheet.create({
  screen:         { flex: 1, backgroundColor: t.card },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border },
  cancel:         { color: t.subtext, fontSize: 16, fontWeight: '500', paddingHorizontal: 12 },
  title:          { color: t.text, fontSize: 17, fontWeight: 'bold' },
  done:           { color: t.success, fontSize: 16, fontWeight: '700', paddingHorizontal: 12 },

  // paid by
  paidByRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.border, gap: 12 },
  paidByPie:      { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: t.border },
  paidByPieLeft:  { flex: 1 },
  paidByPieRight: { flex: 1 },
  paidByText:     { flex: 1, color: t.text, fontSize: 15 },
  paidByChevron:  { color: t.placeholder, fontSize: 20 },

  // avatar strip
  avatarStrip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, gap: 16, borderBottomWidth: 1, borderBottomColor: t.border },
  billIcon:       { width: 52, height: 52, borderRadius: 26, backgroundColor: t.border, alignItems: 'center', justifyContent: 'center' },
  avatarStripBtn: { alignItems: 'center', position: 'relative' },
  avatarStripDim: { opacity: 0.35 },
  avatarCircle:   { width: 52, height: 52, borderRadius: 26, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInit:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  avatarDot:      { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: t.success, borderWidth: 2, borderColor: t.card, alignItems: 'center', justifyContent: 'center' },

  // method desc
  methodDesc:     { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: t.border },
  methodTitle:    { color: t.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  methodSubtitle: { color: t.subtext, fontSize: 13, textAlign: 'center' },

  // tab bar
  tabBar:         { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: t.border },
  tab:            { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: t.border, alignItems: 'center', backgroundColor: t.card },
  tabActive:      { backgroundColor: t.success, borderColor: t.success },
  tabText:        { color: t.text, fontWeight: '600', fontSize: 13 },
  tabTextActive:  { color: '#fff' },

  // balance bar
  balanceBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: t.bg, borderBottomWidth: 1, borderBottomColor: t.border },
  balanceText:    { color: t.subtext, fontSize: 13 },
  balanceBadge:   { color: t.danger, fontSize: 12, fontWeight: '600', backgroundColor: t.dangerBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  // member list
  memberRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.border, gap: 12 },
  memberRowDim:   { opacity: 0.4 },
  memberAvatar:   { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
  memberInit:     { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  memberName:     { flex: 1, color: t.text, fontSize: 15, fontWeight: '500' },

  // checkmark
  checkCircle:    { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: t.muted, alignItems: 'center', justifyContent: 'center' },
  checkCircleOn:  { backgroundColor: t.success, borderColor: t.success },
  checkMark:      { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  // inputs
  inputWrap:      { flexDirection: 'row', alignItems: 'center', backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  inputPrefix:    { color: t.subtext, fontSize: 15 },
  inputSuffix:    { color: t.subtext, fontSize: 14 },
  input:          { minWidth: 60, fontSize: 15, color: t.text, textAlign: 'right' },
  inputHint:      { color: t.placeholder, fontSize: 12, marginLeft: 2 },
  adjBase:        { color: t.text, fontSize: 14, fontWeight: '600', minWidth: 56, textAlign: 'right' },
  adjInput:       { width: 52, backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, textAlign: 'center', color: t.text, fontSize: 13 },

  // bottom bar
  bottomBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.card },
  bottomAmount:   { color: t.text, fontSize: 16, fontWeight: '700' },
  bottomCount:    { color: t.subtext, fontSize: 12, marginTop: 2 },
  allBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allBtnText:     { color: t.text, fontSize: 15, fontWeight: '600' },
  allCheck:       { width: 28, height: 28, borderRadius: 14, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' },
});}

function makeMmStyles(t: ThemeColors) { return StyleSheet.create({
  screen:        { flex: 1, backgroundColor: t.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
  title:         { color: t.text, fontSize: 18, fontWeight: 'bold' },
  close:         { color: t.subtext, fontSize: 18, fontWeight: '600' },
  row:           { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 20, paddingVertical: 18 },
  rowBorder:     { borderBottomWidth: 1, borderBottomColor: t.border },
  badge:         { width: 44, height: 44, borderRadius: 22, backgroundColor: t.border, alignItems: 'center', justifyContent: 'center' },
  badgeActive:   { backgroundColor: t.primaryBg },
  badgeText:     { fontSize: 15, color: t.subtext, fontWeight: 'bold' },
  badgeTextActive:{ color: t.primary },
  rowLabel:      { color: t.text, fontSize: 16, fontWeight: '500' },
  rowLabelActive:{ color: t.primary, fontWeight: '700' },
  check:         { color: t.primary, fontSize: 20, fontWeight: 'bold', marginLeft: 'auto' as any },
});}
