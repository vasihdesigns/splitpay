import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput, Switch, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumStore } from '@/stores/premiumStore';
import { getInitials, formatCurrency, formatRelativeTime } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useTheme, ThemeColors } from '@/lib/theme';
import { useThemeStore } from '@/stores/themeStore';
import { CURRENCIES } from '@/lib/currencies';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// ── Activity ──────────────────────────────────────────────────────────────────
interface ActivityItem {
  id: string; type: string; description: string;
  actorName: string; groupName?: string; createdAt: string;
  youGetBack?: number; youOwe?: number; currency?: string;
}
const TYPE_ICON: Record<string, IoniconsName> = {
  expense_added: 'receipt-outline', expense_edited: 'create-outline',
  expense_deleted: 'trash-outline', settlement: 'checkmark-circle-outline',
  member_added: 'person-add-outline',
};
const ACTION_TEXT: Record<string, string> = {
  expense_added: 'added', expense_edited: 'edited', expense_deleted: 'deleted',
  settlement: 'settled up', member_added: 'joined the group',
};


// ─────────────────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const { user, signOut, isAnonymous } = useAuthStore();
  const { isPremium } = usePremiumStore();
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const m = useMemo(() => makeModalStyles(t), [t]);
  const { isDark, toggleDark } = useThemeStore();

  // ── activity ────────────────────────────────────────────────────────────────
  const [activities,  setActivities]  = useState<ActivityItem[]>([]);
  const [actLoading,  setActLoading]  = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // ── edit profile ────────────────────────────────────────────────────────────
  const [showProfile,  setShowProfile]  = useState(false);
  const [editName,     setEditName]     = useState('');
  const [savingName,   setSavingName]   = useState(false);

  // ── notifications ───────────────────────────────────────────────────────────
  const [showNotif,    setShowNotif]    = useState(false);
  const [notifExpense, setNotifExpense] = useState(true);
  const [notifSettle,  setNotifSettle]  = useState(true);
  const [notifRemind,  setNotifRemind]  = useState(false);
  const [notifWeekly,  setNotifWeekly]  = useState(false);

  // ── currency ────────────────────────────────────────────────────────────────
  const [showCurrency,  setShowCurrency]  = useState(false);
  const [currency,      setCurrency]      = useState('USD');
  const [currencyQuery, setCurrencyQuery] = useState('');

  // Load saved preferences on mount
  useEffect(() => {
    AsyncStorage.multiGet([
      'preferred_currency',
      'notif_expense', 'notif_settle', 'notif_remind', 'notif_weekly',
    ]).then(pairs => {
      const map = Object.fromEntries(pairs);
      if (map['preferred_currency']) setCurrency(map['preferred_currency']);
      if (map['notif_expense']  !== null) setNotifExpense(map['notif_expense']  !== 'false');
      if (map['notif_settle']   !== null) setNotifSettle(map['notif_settle']    !== 'false');
      if (map['notif_remind']   !== null) setNotifRemind(map['notif_remind']    === 'true');
      if (map['notif_weekly']   !== null) setNotifWeekly(map['notif_weekly']    === 'true');
    });
  }, []);

  // ── fetch activity ──────────────────────────────────────────────────────────
  async function fetchActivity() {
    if (!user) { setActLoading(false); setRefreshing(false); return; }
    const { data: memberships } = await supabase
      .from('group_members').select('group_id').eq('user_id', user.id);
    const groupIds = (memberships ?? []).map((m: any) => m.group_id);
    let query = supabase
      .from('activities')
      .select(`*, actor:profiles(full_name), expense:expenses(description, amount, paid_by, currency, splits:expense_splits(user_id, amount, paid)), group:groups(name)`)
      .order('created_at', { ascending: false }).limit(40);
    query = groupIds.length > 0 ? query.in('group_id', groupIds) : query.eq('actor_id', user.id);
    const { data } = await query;
    if (data) {
      setActivities(data.map((a: any): ActivityItem => {
        const exp = a.expense;
        let youGetBack: number | undefined, youOwe: number | undefined;
        if (exp && a.type === 'expense_added') {
          if (exp.paid_by === user.id) {
            const total = (exp.splits ?? []).filter((s: any) => s.user_id !== user.id && !s.paid)
              .reduce((sum: number, s: any) => sum + s.amount, 0);
            if (total > 0.01) youGetBack = total;
          } else {
            const mine = (exp.splits ?? []).find((s: any) => s.user_id === user.id && !s.paid);
            if (mine?.amount > 0.01) youOwe = mine.amount;
          }
        }
        return { id: a.id, type: a.type, description: exp?.description ?? ACTION_TEXT[a.type] ?? a.type,
          actorName: a.actor?.full_name ?? 'Someone', groupName: a.group?.name,
          createdAt: a.created_at, youGetBack, youOwe, currency: exp?.currency ?? 'USD' };
      }));
    }
    setActLoading(false); setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { fetchActivity(); }, [user]));

  // ── save profile ────────────────────────────────────────────────────────────
  async function handleSaveProfile() {
    if (!editName.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    setSavingName(true);
    const { error } = await supabase.from('profiles')
      .update({ full_name: editName.trim() })
      .eq('id', user!.id);
    setSavingName(false);
    if (error) { Alert.alert('Error', error.message); return; }
    // Update local user state
    (user as any).full_name = editName.trim();
    setShowProfile(false);
    Alert.alert('Saved', 'Your profile has been updated.');
  }

  // ── save currency ───────────────────────────────────────────────────────────
  async function handleSelectCurrency(code: string) {
    setCurrency(code);
    await AsyncStorage.setItem('preferred_currency', code);
    setShowCurrency(false);
  }

  // ── save notifications ──────────────────────────────────────────────────────
  async function saveNotif(key: string, value: boolean) {
    await AsyncStorage.setItem(key, String(value));
  }

  const filteredCurrencies = currencyQuery.trim()
    ? CURRENCIES.filter(c =>
        c.code.toLowerCase().includes(currencyQuery.toLowerCase()) ||
        c.name.toLowerCase().includes(currencyQuery.toLowerCase()))
    : CURRENCIES;

  const isMe = (name: string) => name === (user as any)?.full_name;

  const settingsRows: { label: string; icon: IoniconsName; iconColor: string; iconBg: string; value?: string; onPress: () => void }[] = [
    { label: 'Edit Profile',     icon: 'person-outline',          iconColor: '#4f46e5', iconBg: '#eef2ff',
      value: user?.full_name ?? '',
      onPress: () => { setEditName((user as any)?.full_name ?? ''); setShowProfile(true); } },
    { label: 'Notifications',    icon: 'notifications-outline',   iconColor: '#f97316', iconBg: '#fff7ed',
      onPress: () => setShowNotif(true) },
    { label: 'Currency',         icon: 'swap-horizontal-outline', iconColor: '#0ea5e9', iconBg: '#f0f9ff',
      value: currency,
      onPress: () => { setCurrencyQuery(''); setShowCurrency(true); } },
    { label: 'Privacy Policy',   icon: 'lock-closed-outline',     iconColor: '#6b7280', iconBg: '#f3f4f6',
      onPress: () => Linking.openURL('https://splitpay.app/privacy') },
    { label: 'Terms of Service', icon: 'document-text-outline',   iconColor: '#6b7280', iconBg: '#f3f4f6',
      onPress: () => Linking.openURL('https://splitpay.app/terms') },
  ];

  // ── Guest view ─────────────────────────────────────────────────────────────
  if (isAnonymous) {
    return (
      <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={s.topBar}><Text style={s.pageTitle}>Account</Text></View>
          <View style={s.guestCard}>
            <View style={s.guestAvatar}><Ionicons name="person-outline" size={36} color={t.primary} /></View>
            <Text style={s.guestTitle}>You're using SplitPay as a guest</Text>
            <Text style={s.guestSub}>Create a free account to invite friends, share expenses, and access your data from any device.</Text>
            <TouchableOpacity style={s.createBtn} onPress={() => router.push('/create-account')}>
              <Text style={s.createBtnText}>Create Free Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.signInBtn} onPress={() => router.replace('/(auth)/login')}>
              <Text style={s.signInText}>Sign In</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.version}>SplitPay v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Signed-in view ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchActivity(); }} tintColor={t.primary} />}
      >
        <View style={s.topBar}><Text style={s.pageTitle}>Account</Text></View>

        {/* Profile card */}
        <TouchableOpacity style={s.profileCard} activeOpacity={0.85}
          onPress={() => { setEditName((user as any)?.full_name ?? ''); setShowProfile(true); }}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.full_name ? getInitials(user.full_name) : '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{user?.full_name}</Text>
            <Text style={s.profileEmail}>{(user as any)?.email}</Text>
          </View>
          <Ionicons name="create-outline" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Premium */}
        {isPremium ? (
          <View style={s.premiumCard}>
            <View style={[s.iconBox, { backgroundColor: '#fef9c3' }]}>
              <Ionicons name="star" size={18} color="#ca8a04" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.premiumTitle}>Premium Active</Text>
              <Text style={s.premiumSub}>Ad-free · All features unlocked</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.upgradeCard} onPress={() => router.push('/upgrade')}>
            <View style={[s.iconBox, { backgroundColor: t.primaryBg }]}>
              <Ionicons name="star-outline" size={18} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.upgradeTitle}>Upgrade to Premium</Text>
              <Text style={s.upgradeSub}>Remove ads · Unlock all features</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.primary} />
          </TouchableOpacity>
        )}

        {/* Settings */}
        <View style={s.settingsCard}>
          {settingsRows.map((item, i, arr) => (
            <TouchableOpacity key={item.label} style={[s.settingsRow, s.settingsBorder]} onPress={item.onPress} activeOpacity={0.7}>
              <View style={[s.iconBox, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={18} color={item.iconColor} />
              </View>
              <Text style={s.settingsLabel}>{item.label}</Text>
              {item.value ? <Text style={s.settingsValue}>{item.value}</Text> : null}
              <Ionicons name="chevron-forward" size={16} color={t.muted} />
            </TouchableOpacity>
          ))}
          {/* Dark Mode toggle */}
          <View style={s.settingsRow}>
            <View style={[s.iconBox, { backgroundColor: '#1e1b4b' }]}>
              <Ionicons name="moon-outline" size={18} color="#818cf8" />
            </View>
            <Text style={s.settingsLabel}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleDark}
              trackColor={{ false: t.muted, true: t.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} activeOpacity={0.7}
          onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ])}>
          <View style={[s.iconBox, { backgroundColor: t.dangerBg }]}>
            <Ionicons name="log-out-outline" size={18} color={t.danger} />
          </View>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Recent Activity */}
        <View style={s.activitySection}>
          <View style={s.activityHeader}>
            <Text style={s.activityTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/activity')} activeOpacity={0.7}>
              <Text style={s.activityViewAll}>View All</Text>
            </TouchableOpacity>
          </View>
          {actLoading ? (
            <ActivityIndicator color="#4f46e5" style={{ marginTop: 20, marginBottom: 10 }} />
          ) : activities.length === 0 ? (
            <View style={s.actEmpty}>
              <Ionicons name="notifications-outline" size={32} color={t.muted} />
              <Text style={s.actEmptyText}>No activity yet</Text>
            </View>
          ) : (
            <View style={s.activityCard}>
              {activities.map((item, i) => (
                <View key={item.id} style={[s.actRow, i < activities.length - 1 && s.actRowBorder]}>
                  <View style={s.actIconBox}>
                    <Ionicons name={TYPE_ICON[item.type] ?? 'ellipse-outline'} size={16} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.actLine} numberOfLines={2}>
                      <Text style={s.actName}>{isMe(item.actorName) ? 'You' : item.actorName}</Text>
                      <Text style={s.actAction}> {ACTION_TEXT[item.type] ?? item.type} </Text>
                      {['expense_added', 'expense_edited'].includes(item.type) && <Text style={s.actName}>"{item.description}"</Text>}
                    </Text>
                    {item.youGetBack != null && <Text style={s.actGetBack}>+{formatCurrency(item.youGetBack, item.currency)}</Text>}
                    {item.youOwe != null && <Text style={s.actOwe}>−{formatCurrency(item.youOwe, item.currency)}</Text>}
                    <View style={s.actMeta}>
                      {item.groupName && <Text style={s.actTag}>{item.groupName}</Text>}
                      <Text style={s.actDate}>{formatRelativeTime(item.createdAt)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={s.version}>SplitPay v1.0.0</Text>
      </ScrollView>

      {/* ── Edit Profile Modal ──────────────────────────────────────────────── */}
      <Modal visible={showProfile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowProfile(false)}>
        <SafeAreaView style={[m.screen, { backgroundColor: t.bg }]}>
          <View style={m.header}>
            <TouchableOpacity onPress={() => setShowProfile(false)} style={m.headerBtn}>
              <Text style={m.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={m.title}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSaveProfile} style={m.headerBtn} disabled={savingName}>
              {savingName ? <ActivityIndicator size="small" color={t.primary} /> : <Text style={m.save}>Save</Text>}
            </TouchableOpacity>
          </View>

          <View style={m.profilePreview}>
            <View style={m.previewAvatar}>
              <Text style={m.previewInitials}>{editName ? getInitials(editName) : '?'}</Text>
            </View>
            <Text style={m.previewEmail}>{(user as any)?.email}</Text>
          </View>

          <View style={m.fieldCard}>
            <View style={m.fieldRow}>
              <Text style={m.fieldLabel}>Full Name</Text>
              <TextInput
                style={m.fieldInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your full name"
                placeholderTextColor="#9ca3af"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveProfile}
              />
            </View>
            <View style={m.fieldDivider} />
            <View style={m.fieldRow}>
              <Text style={m.fieldLabel}>Email</Text>
              <Text style={m.fieldReadonly}>{(user as any)?.email}</Text>
            </View>
          </View>
          <Text style={m.fieldHint}>Email address cannot be changed here.</Text>
        </SafeAreaView>
      </Modal>

      {/* ── Notifications Modal ─────────────────────────────────────────────── */}
      <Modal visible={showNotif} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNotif(false)}>
        <SafeAreaView style={[m.screen, { backgroundColor: t.bg }]}>
          <View style={m.header}>
            <View style={m.headerBtn} />
            <Text style={m.title}>Notifications</Text>
            <TouchableOpacity onPress={() => setShowNotif(false)} style={m.headerBtn}>
              <Text style={m.save}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={m.fieldCard}>
            {[
              { key: 'notif_expense', label: 'New expenses',       sub: 'When someone adds an expense',   value: notifExpense, set: (v: boolean) => { setNotifExpense(v); saveNotif('notif_expense', v); } },
              { key: 'notif_settle',  label: 'Settlements',        sub: 'When someone settles up',        value: notifSettle,  set: (v: boolean) => { setNotifSettle(v);  saveNotif('notif_settle',  v); } },
              { key: 'notif_remind',  label: 'Payment reminders',  sub: 'Remind friends about balances',  value: notifRemind,  set: (v: boolean) => { setNotifRemind(v);  saveNotif('notif_remind',  v); } },
              { key: 'notif_weekly',  label: 'Weekly summary',     sub: 'Weekly balance overview',        value: notifWeekly,  set: (v: boolean) => { setNotifWeekly(v);  saveNotif('notif_weekly',  v); } },
            ].map((row, i, arr) => (
              <View key={row.key} style={[m.toggleRow, i < arr.length - 1 && m.fieldDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={m.toggleLabel}>{row.label}</Text>
                  <Text style={m.toggleSub}>{row.sub}</Text>
                </View>
                <Switch
                  value={row.value}
                  onValueChange={row.set}
                  trackColor={{ false: t.muted, true: t.primary }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Currency Modal ──────────────────────────────────────────────────── */}
      <Modal visible={showCurrency} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCurrency(false)}>
        <SafeAreaView style={[m.screen, { backgroundColor: t.bg }]}>
          <View style={m.header}>
            <TouchableOpacity onPress={() => setShowCurrency(false)} style={m.headerBtn}>
              <Text style={m.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={m.title}>Currency</Text>
            <View style={m.headerBtn} />
          </View>

          <View style={m.searchBar}>
            <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
            <TextInput
              style={m.searchInput}
              placeholder="Search currency…"
              placeholderTextColor="#9ca3af"
              value={currencyQuery}
              onChangeText={setCurrencyQuery}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={m.listCard}>
              {filteredCurrencies.map((c, i) => (
                <TouchableOpacity key={c.code}
                  style={[m.currencyRow, i < filteredCurrencies.length - 1 && m.fieldDivider]}
                  onPress={() => handleSelectCurrency(c.code)}
                  activeOpacity={0.7}
                >
                  <View style={m.currencySymbolBox}>
                    <Text style={m.currencySymbol}>{c.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.currencyCode}>{c.code}</Text>
                    <Text style={m.currencyName}>{c.name}</Text>
                  </View>
                  {currency === c.code && <Ionicons name="checkmark-circle" size={22} color={t.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:          { flex: 1, backgroundColor: t.bg },
    topBar:          { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
    pageTitle:       { color: t.text, fontSize: 24, fontWeight: 'bold' },

    guestCard:       { marginHorizontal: 24, marginTop: 16, marginBottom: 20, backgroundColor: t.card, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: t.border },
    guestAvatar:     { width: 80, height: 80, borderRadius: 40, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    guestTitle:      { color: t.text, fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
    guestSub:        { color: t.subtext, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    createBtn:       { backgroundColor: t.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 10 },
    createBtnText:   { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    signInBtn:       { borderWidth: 1, borderColor: t.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
    signInText:      { color: t.primary, fontWeight: '600', fontSize: 15 },

    profileCard:     { marginHorizontal: 24, marginTop: 16, marginBottom: 12, backgroundColor: t.primary, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
    avatar:          { width: 60, height: 60, borderRadius: 30, backgroundColor: '#818cf8', alignItems: 'center', justifyContent: 'center' },
    avatarText:      { color: '#fff', fontSize: 22, fontWeight: 'bold' },
    profileName:     { color: '#fff', fontSize: 17, fontWeight: 'bold' },
    profileEmail:    { color: '#c7d2fe', fontSize: 13, marginTop: 2 },

    premiumCard:     { marginHorizontal: 24, marginBottom: 12, backgroundColor: '#fef9c3', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#fde047' },
    premiumTitle:    { color: '#713f12', fontWeight: 'bold', fontSize: 15 },
    premiumSub:      { color: '#a16207', fontSize: 13, marginTop: 2 },
    upgradeCard:     { marginHorizontal: 24, marginBottom: 12, backgroundColor: t.primaryBg, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.border },
    upgradeTitle:    { color: t.text, fontWeight: 'bold', fontSize: 15 },
    upgradeSub:      { color: t.primary, fontSize: 13, marginTop: 2 },

    settingsCard:    { marginHorizontal: 24, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.border, marginBottom: 12 },
    settingsRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
    settingsBorder:  { borderBottomWidth: 1, borderBottomColor: t.border },
    iconBox:         { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    settingsLabel:   { flex: 1, color: t.text, fontSize: 15, fontWeight: '500' },
    settingsValue:   { color: t.placeholder, fontSize: 13, marginRight: 4 },
    signOutBtn:      { marginHorizontal: 24, backgroundColor: t.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: t.dangerBg, marginBottom: 12 },
    signOutText:     { flex: 1, color: t.danger, fontSize: 15, fontWeight: '600' },

    activitySection: { marginHorizontal: 24, marginTop: 4 },
    activityHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    activityTitle:   { fontSize: 16, fontWeight: '700', color: t.text },
    activityViewAll: { fontSize: 13, fontWeight: '600', color: t.primary },
    activityCard:    { backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.border },
    actRow:          { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    actRowBorder:    { borderBottomWidth: 1, borderBottomColor: t.border },
    actIconBox:      { width: 32, height: 32, borderRadius: 16, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    actLine:         { fontSize: 13, color: t.subtext, lineHeight: 18 },
    actName:         { fontWeight: '600', color: t.text },
    actAction:       { color: t.subtext },
    actGetBack:      { color: t.success, fontWeight: '600', fontSize: 12, marginTop: 2 },
    actOwe:          { color: t.danger, fontWeight: '600', fontSize: 12, marginTop: 2 },
    actMeta:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    actTag:          { backgroundColor: t.primaryBg, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, fontSize: 11, color: t.primary },
    actDate:         { color: t.placeholder, fontSize: 11 },
    actEmpty:        { alignItems: 'center', paddingVertical: 24, gap: 8 },
    actEmptyText:    { color: t.placeholder, fontSize: 14 },

    version:         { textAlign: 'center', color: t.placeholder, fontSize: 12, marginTop: 20, marginBottom: 4 },
  });
}

function makeModalStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:           { flex: 1, backgroundColor: t.bg },
    header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.borderStrong },
    headerBtn:        { width: 70 },
    title:            { fontSize: 17, fontWeight: '700', color: t.text, textAlign: 'center', flex: 1 },
    cancel:           { color: t.subtext, fontSize: 16, fontWeight: '500' },
    save:             { color: t.primary, fontSize: 16, fontWeight: '700', textAlign: 'right' },

    profilePreview:   { alignItems: 'center', paddingVertical: 28, gap: 8 },
    previewAvatar:    { width: 72, height: 72, borderRadius: 36, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    previewInitials:  { color: '#fff', fontSize: 26, fontWeight: 'bold' },
    previewEmail:     { color: t.placeholder, fontSize: 13 },

    fieldCard:        { marginHorizontal: 20, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.border },
    fieldRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    fieldDivider:     { borderBottomWidth: 1, borderBottomColor: t.border },
    fieldLabel:       { width: 80, color: t.subtext, fontSize: 14, fontWeight: '500' },
    fieldInput:       { flex: 1, fontSize: 15, color: t.text, paddingVertical: 0 },
    fieldReadonly:    { flex: 1, fontSize: 15, color: t.placeholder },
    fieldHint:        { color: t.placeholder, fontSize: 12, textAlign: 'center', marginTop: 10, marginHorizontal: 20 },

    toggleRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
    toggleLabel:      { fontSize: 15, fontWeight: '500', color: t.text, marginBottom: 2 },
    toggleSub:        { fontSize: 12, color: t.placeholder },

    searchBar:        { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: t.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: t.borderStrong },
    searchInput:      { flex: 1, fontSize: 15, color: t.text },

    listCard:         { marginHorizontal: 16, marginBottom: 20, backgroundColor: t.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: t.border },
    currencyRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
    currencySymbolBox:{ width: 42, height: 42, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' },
    currencySymbol:   { fontSize: 16, fontWeight: '700', color: t.text },
    currencyCode:     { fontSize: 15, fontWeight: '600', color: t.text },
    currencyName:     { fontSize: 12, color: t.placeholder, marginTop: 1 },
  });
}
