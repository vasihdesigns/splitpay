/**
 * Edit Expense — pre-fills an existing expense for editing.
 * Split section shows only current members; supports removing & adding people.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView,
  Platform, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getInitials, formatCurrency, getExpenseIcon } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

const CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham',        symbol: 'د.إ' },
  { code: 'USD', name: 'US Dollar',         symbol: '$'   },
  { code: 'EUR', name: 'Euro',              symbol: '€'   },
  { code: 'GBP', name: 'British Pound',     symbol: '£'   },
  { code: 'SAR', name: 'Saudi Riyal',       symbol: '﷼'   },
  { code: 'INR', name: 'Indian Rupee',      symbol: '₹'   },
  { code: 'PKR', name: 'Pakistani Rupee',   symbol: '₨'   },
  { code: 'EGP', name: 'Egyptian Pound',    symbol: 'E£'  },
  { code: 'CAD', name: 'Canadian Dollar',   symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$'  },
  { code: 'JPY', name: 'Japanese Yen',      symbol: '¥'   },
  { code: 'CNY', name: 'Chinese Yuan',      symbol: '¥'   },
  { code: 'CHF', name: 'Swiss Franc',       symbol: 'Fr'  },
  { code: 'SGD', name: 'Singapore Dollar',  symbol: 'S$'  },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM'  },
  { code: 'TRY', name: 'Turkish Lira',      symbol: '₺'   },
];

interface Member { user_id: string; full_name: string; amount: number; }
interface Candidate { user_id: string; full_name: string; }

export default function EditExpenseScreen() {
  const router = useRouter();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const { user } = useAuthStore();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [description,       setDescription]       = useState('');
  const [amount,            setAmount]            = useState('');
  const [currency,          setCurrency]          = useState('AED');
  const [paidByUserId,      setPaidByUserId]      = useState('');
  const [members,           setMembers]           = useState<Member[]>([]);
  const [originalMemberIds, setOriginalMemberIds] = useState<Set<string>>(new Set());
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);

  // Modals
  const [showCurrencyModal,  setShowCurrencyModal]  = useState(false);
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [candidates,         setCandidates]         = useState<Candidate[]>([]);
  const [candidateSearch,    setCandidateSearch]    = useState('');

  useEffect(() => { loadExpense(); }, []);

  async function loadExpense() {
    if (!expenseId) return;

    const { data: expense } = await supabase
      .from('expenses')
      .select('id, description, amount, currency, paid_by')
      .eq('id', expenseId)
      .single();

    if (!expense) { setLoading(false); return; }

    setDescription(expense.description);
    setAmount(String(expense.amount));
    setCurrency(expense.currency ?? 'AED');
    setPaidByUserId(expense.paid_by);

    const { data: splits } = await supabase
      .from('expense_splits')
      .select('user_id, amount')
      .eq('expense_id', expenseId);

    if (splits && splits.length > 0) {
      const uids = splits.map((s: any) => s.user_id);
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name').in('id', uids);
      const nameMap: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
      const rows: Member[] = splits.map((s: any) => ({
        user_id: s.user_id,
        full_name: nameMap[s.user_id] ?? 'Unknown',
        amount: s.amount,
      }));
      setMembers(rows);
      setOriginalMemberIds(new Set(rows.map(r => r.user_id)));
    }

    setLoading(false);
  }

  // ── Open "add person" picker ─────────────────────────────────────────────
  async function openAddPerson() {
    const currentIds = new Set(members.map(m => m.user_id));

    // Get all people this user has shared expenses with
    const { data: mySplits } = await supabase
      .from('expense_splits').select('expense_id').eq('user_id', user!.id);
    const myExpIds = (mySplits ?? []).map((s: any) => s.expense_id);

    let allUids: string[] = [];
    if (myExpIds.length > 0) {
      const { data: others } = await supabase
        .from('expense_splits').select('user_id')
        .in('expense_id', myExpIds).neq('user_id', user!.id);
      allUids = [...new Set((others ?? []).map((s: any) => s.user_id as string))];
    }

    const newUids = allUids.filter(uid => !currentIds.has(uid));

    if (newUids.length === 0) {
      Alert.alert('No more people', 'No other friends found to add.');
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name').in('id', newUids);
    setCandidates((profiles ?? []).map((p: any) => ({ user_id: p.id, full_name: p.full_name })));
    setCandidateSearch('');
    setShowAddPersonModal(true);
  }

  function addMember(person: Candidate) {
    setMembers(prev => [...prev, { user_id: person.user_id, full_name: person.full_name, amount: 0 }]);
    setShowAddPersonModal(false);
  }

  function removeMember(userId: string) {
    if (members.length <= 1) {
      Alert.alert('Cannot remove', 'At least one person must remain in the split.');
      return;
    }
    // If we're removing the payer, reset payer to current user (if present)
    if (userId === paidByUserId) {
      const next = members.find(m => m.user_id !== userId);
      if (next) setPaidByUserId(next.user_id);
    }
    setMembers(prev => prev.filter(m => m.user_id !== userId));
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!description.trim()) { Alert.alert('Missing info', 'Please enter a description.'); return; }
    const total = parseFloat(amount);
    if (!total || total <= 0) { Alert.alert('Missing info', 'Please enter a valid amount.'); return; }

    setSaving(true);

    const { error: expErr, data: updatedExpense } = await supabase
      .from('expenses')
      .update({ description: description.trim(), amount: total, currency, paid_by: paidByUserId })
      .eq('id', expenseId)
      .select('id');

    if (expErr || !updatedExpense?.length) {
      Alert.alert('Error', expErr?.message ?? 'Could not update expense. You may not have permission to edit this one.');
      setSaving(false); return;
    }

    const currentIds = new Set(members.map(m => m.user_id));

    // Delete splits for removed members
    const removedIds = [...originalMemberIds].filter(id => !currentIds.has(id));
    if (removedIds.length > 0) {
      await supabase.from('expense_splits').delete()
        .eq('expense_id', expenseId!).in('user_id', removedIds);
    }

    // Recalculate equal split amounts
    const n    = members.length;
    const each = parseFloat((total / n).toFixed(2));
    const last = parseFloat((total - each * (n - 1)).toFixed(2));

    for (let i = 0; i < members.length; i++) {
      const share = i === n - 1 ? last : each;
      if (originalMemberIds.has(members[i].user_id)) {
        await supabase.from('expense_splits')
          .update({ amount: share })
          .eq('expense_id', expenseId!).eq('user_id', members[i].user_id);
      } else {
        await supabase.from('expense_splits')
          .insert({ expense_id: expenseId, user_id: members[i].user_id, amount: share, paid: false });
      }
    }

    setSaving(false);
    Alert.alert('Saved!', 'Expense updated.', [{ text: 'OK', onPress: () => router.back() }]);
  }

  const iconInfo = getExpenseIcon(description);
  const total    = parseFloat(amount) || 0;
  const n        = members.length;
  const each     = n > 0 ? parseFloat((total / n).toFixed(2)) : 0;

  if (loading) {
    return (
      <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const filteredCandidates = candidateSearch.trim()
    ? candidates.filter(c => c.full_name.toLowerCase().includes(candidateSearch.toLowerCase()))
    : candidates;

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="close" size={24} color={t.subtext} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Edit expense</Text>
          <TouchableOpacity style={[s.headerBtn, { alignItems: 'flex-end' }]} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color={t.primary} size="small" />
              : <Text style={s.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>

          {/* ── Description + Amount ─────────────────────────────────────── */}
          <View style={s.card}>
            <View style={s.cardRow}>
              <View style={[s.cardIconBox, { backgroundColor: iconInfo.bg }]}>
                <Ionicons name={iconInfo.name as any} size={20} color={iconInfo.color} />
              </View>
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
            <View style={s.cardRow}>
              <TouchableOpacity style={s.currencyPill} onPress={() => setShowCurrencyModal(true)} activeOpacity={0.7}>
                <Text style={s.currencyText}>{currency}</Text>
                <Ionicons name="chevron-down" size={11} color={t.subtext} style={{ marginTop: 1 }} />
              </TouchableOpacity>
              <TextInput
                style={s.amountInput}
                placeholder="0"
                placeholderTextColor={t.border}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* ── Paid by ──────────────────────────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>PAID BY</Text>
            <View style={s.paidByCard}>
              {members.map((m, i) => {
                const isSelected = m.user_id === paidByUserId;
                const label = m.user_id === user?.id ? `You (${m.full_name.split(' ')[0]})` : m.full_name;
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    style={[s.paidByRow, isSelected && s.paidByRowActive, i < members.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.border }]}
                    onPress={() => setPaidByUserId(m.user_id)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.paidByAvatar, { backgroundColor: isSelected ? t.primary : t.inputBg }]}>
                      <Text style={[s.paidByInitials, { color: isSelected ? '#fff' : t.subtext }]}>
                        {getInitials(m.full_name)}
                      </Text>
                    </View>
                    <Text style={[s.paidByName, isSelected && { color: t.primary, fontWeight: '700' }]}>
                      {label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={t.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Split equally ─────────────────────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>SPLIT EQUALLY</Text>
            <View style={s.splitCard}>
              {members.map((m, i) => {
                const share = i === n - 1
                  ? parseFloat((total - each * (n - 1)).toFixed(2))
                  : each;
                const label = m.user_id === user?.id ? 'You' : m.full_name.split(' ')[0];
                return (
                  <View key={m.user_id} style={[s.splitRow, i < members.length - 1 && s.splitRowBorder]}>
                    <View style={s.splitAvatar}>
                      <Text style={s.splitInitials}>{getInitials(m.full_name)}</Text>
                    </View>
                    <Text style={s.splitName}>{label}</Text>
                    {total > 0 && <Text style={s.splitAmount}>{formatCurrency(share, currency)}</Text>}
                    <TouchableOpacity
                      style={s.removeBtn}
                      onPress={() => removeMember(m.user_id)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={20} color={t.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Add person row */}
              <TouchableOpacity style={s.addPersonRow} onPress={openAddPerson} activeOpacity={0.7}>
                <View style={s.addPersonIcon}>
                  <Ionicons name="person-add-outline" size={16} color={t.primary} />
                </View>
                <Text style={s.addPersonText}>Add person</Text>
                <Ionicons name="chevron-forward" size={16} color={t.placeholder} />
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Currency modal ─────────────────────────────────────────────────── */}
      <Modal visible={showCurrencyModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowCurrencyModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowCurrencyModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={t.subtext} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Select Currency</Text>
            <View style={{ width: 30 }} />
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={s.modalList}>
              {CURRENCIES.map((c, i) => (
                <TouchableOpacity key={c.code}
                  onPress={() => { setCurrency(c.code); setShowCurrencyModal(false); }}
                  style={[s.modalRow, i < CURRENCIES.length - 1 && s.modalRowBorder]}
                >
                  <View style={s.currencySymbolBox}>
                    <Text style={s.currencySymbol}>{c.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.currencyCode}>{c.code}</Text>
                    <Text style={s.currencyName}>{c.name}</Text>
                  </View>
                  {currency === c.code && <Ionicons name="checkmark-circle" size={22} color={t.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Add person modal ───────────────────────────────────────────────── */}
      <Modal visible={showAddPersonModal} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setShowAddPersonModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddPersonModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={t.subtext} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Add person</Text>
            <View style={{ width: 30 }} />
          </View>

          {/* Search */}
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={16} color={t.placeholder} style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search name..."
              placeholderTextColor={t.placeholder}
              value={candidateSearch}
              onChangeText={setCandidateSearch}
              autoFocus
            />
          </View>

          <ScrollView style={{ flex: 1 }}>
            <View style={s.modalList}>
              {filteredCandidates.length === 0 ? (
                <Text style={{ textAlign: 'center', color: t.placeholder, paddingVertical: 40, fontSize: 14 }}>
                  No people found
                </Text>
              ) : (
                filteredCandidates.map((c, i) => (
                  <TouchableOpacity key={c.user_id}
                    onPress={() => addMember(c)}
                    style={[s.modalRow, i < filteredCandidates.length - 1 && s.modalRowBorder]}
                  >
                    <View style={s.paidByAvatar}>
                      <Text style={[s.paidByInitials, { color: t.subtext }]}>{getInitials(c.full_name)}</Text>
                    </View>
                    <Text style={[s.paidByName, { flex: 1 }]}>{c.full_name}</Text>
                    <Ionicons name="add-circle-outline" size={22} color={t.primary} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen:       { flex: 1, backgroundColor: t.bg },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  headerBtn:    { width: 60 },
  headerTitle:  { flex: 1, textAlign: 'center', color: t.text, fontSize: 17, fontWeight: '700' },
  saveText:     { color: t.primary, fontSize: 17, fontWeight: '700' },

  card:         { marginHorizontal: 16, marginTop: 20, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  cardDivider:  { height: 1, backgroundColor: t.border, marginLeft: 16 },
  cardIconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardInput:    { flex: 1, fontSize: 16, color: t.text, fontWeight: '400', paddingVertical: 2 },
  currencyPill: { backgroundColor: t.inputBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 76, borderWidth: 1, borderColor: t.border, justifyContent: 'center' },
  currencyText: { color: t.text, fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  amountInput:  { flex: 1, fontSize: 56, fontWeight: '700', color: t.text, letterSpacing: -2, paddingVertical: 4 },

  section:      { marginHorizontal: 16, marginTop: 20 },
  sectionLabel: { color: t.placeholder, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },

  paidByCard:      { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  paidByRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  paidByRowActive: { backgroundColor: t.primaryBg },
  paidByAvatar:    { width: 38, height: 38, borderRadius: 19, backgroundColor: t.inputBg, alignItems: 'center', justifyContent: 'center' },
  paidByInitials:  { fontWeight: '700', fontSize: 13 },
  paidByName:      { flex: 1, color: t.text, fontSize: 15, fontWeight: '500' },

  splitCard:      { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  splitRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  splitRowBorder: { borderBottomWidth: 1, borderBottomColor: t.border },
  splitAvatar:    { width: 34, height: 34, borderRadius: 17, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  splitInitials:  { color: t.primary, fontWeight: '700', fontSize: 12 },
  splitName:      { flex: 1, color: t.subtext, fontSize: 15, fontWeight: '500' },
  splitAmount:    { color: t.text, fontSize: 15, fontWeight: '700', marginRight: 6 },
  removeBtn:      { padding: 2 },

  addPersonRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderTopWidth: 1, borderTopColor: t.border },
  addPersonIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
  addPersonText: { flex: 1, color: t.primary, fontSize: 15, fontWeight: '600' },

  // Shared modal styles
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  modalTitle:       { color: t.text, fontSize: 17, fontWeight: '700' },
  modalList:        { marginHorizontal: 14, marginTop: 14, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden' },
  modalRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  modalRowBorder:   { borderBottomWidth: 1, borderBottomColor: t.border },
  currencySymbolBox:{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.inputBg, alignItems: 'center', justifyContent: 'center' },
  currencySymbol:   { fontSize: 17, fontWeight: '700', color: t.subtext },
  currencyCode:     { color: t.text, fontSize: 15, fontWeight: '600' },
  currencyName:     { color: t.placeholder, fontSize: 13, marginTop: 1 },

  searchRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, marginHorizontal: 14, marginTop: 12, marginBottom: 2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: t.border },
  searchInput: { flex: 1, fontSize: 15, color: t.text },
});}
