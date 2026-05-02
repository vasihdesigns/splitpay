/**
 * Add Friends screen — accessible from the Friends tab.
 * Shows phone contacts, highlights who's already on SplitPay,
 * and lets you send an SMS/email invite to anyone who isn't.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { supabase } from '@/lib/supabase';
import { sendInvite } from '@/lib/invite';
import { useAuthStore } from '@/stores/authStore';
import { getInitials } from '@/lib/utils';
import { useTheme, ThemeColors } from '@/lib/theme';

interface AppUser { id: string; full_name: string; email: string; phone?: string; }
interface ContactRow {
  id: string; name: string; initials: string;
  phone?: string; email?: string; appUser?: AppUser;
}

function normalizePhone(raw: string) { return raw.replace(/\D/g, '').replace(/^0+/, ''); }

export default function AddFriendsScreen() {
  const router = useRouter();
  const { user, isAnonymous } = useAuthStore();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [query,      setQuery]      = useState('');
  const [contacts,   setContacts]   = useState<ContactRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [permStatus, setPermStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [inviting,   setInviting]   = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      if (isAnonymous) { setLoading(false); return; }

      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, phone');
      const appUsers: AppUser[] = profiles ?? [];

      const emailMap = new Map<string, AppUser>();
      const phoneMap = new Map<string, AppUser>();
      appUsers.forEach((u) => {
        if (u.email) emailMap.set(u.email.toLowerCase(), u);
        if (u.phone) phoneMap.set(normalizePhone(u.phone), u);
      });

      const { status } = await Contacts.requestPermissionsAsync();
      setPermStatus(status === 'granted' ? 'granted' : 'denied');

      if (status === 'granted') {
        const { data: phoneContacts } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
          sort: Contacts.SortTypes.FirstName,
        });
        const rows: ContactRow[] = [];
        const seen = new Set<string>();
        for (const c of phoneContacts) {
          if (!c.name) continue;
          const name = c.name.trim();
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const email = c.emails?.[0]?.email?.toLowerCase();
          const phone = c.phoneNumbers?.[0]?.number;
          let appUser: AppUser | undefined;
          if (email) appUser = emailMap.get(email);
          if (!appUser && phone) appUser = phoneMap.get(normalizePhone(phone));
          if (appUser?.id === user?.id) continue;
          rows.push({ id: c.id ?? key, name, initials: getInitials(name), phone: phone ?? undefined, email: email ?? undefined, appUser });
        }
        setContacts(rows);
      }
      setLoading(false);
    }
    init();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = q ? contacts.filter(c => c.name.toLowerCase().includes(q) || c.email?.includes(q) || c.phone?.includes(q)) : contacts;
    return [...list].sort((a, b) => {
      if (a.appUser && !b.appUser) return -1;
      if (!a.appUser && b.appUser) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [contacts, query]);

  async function handleInvite(c: ContactRow) {
    setInviting(c.id);
    try {
      await sendInvite({ name: c.name, phone: c.phone, email: c.email });
    } finally { setInviting(null); }
  }

  if (isAnonymous) {
    return (
      <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}><Text style={s.cancel}>Back</Text></TouchableOpacity>
          <Text style={s.headerTitle}>Add Friends</Text>
          <View style={{ width: 56 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>🔐</Text>
          <Text style={{ color: t.text, fontWeight: 'bold', fontSize: 20, textAlign: 'center', marginBottom: 8 }}>Create an account first</Text>
          <Text style={{ color: t.subtext, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>You need a free account to find and invite friends.</Text>
          <TouchableOpacity style={{ backgroundColor: t.primary, borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12 }} onPress={() => { router.back(); router.push('/create-account'); }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Create Free Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const onApp  = filtered.filter(c => !!c.appUser);
  const offApp = filtered.filter(c => !c.appUser);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}><Text style={s.cancel}>Back</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Add Friends</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={s.searchBar}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.primary} size="large" />
          <Text style={{ color: t.subtext, marginTop: 12 }}>Loading contacts…</Text>
        </View>
      ) : permStatus === 'denied' ? (
        <View style={s.permBox}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📒</Text>
          <Text style={s.permTitle}>Allow contacts access</Text>
          <Text style={s.permSub}>SplitPay needs contacts access to find friends on the app and send invitations.</Text>
          <TouchableOpacity style={s.permBtn} onPress={() => Linking.openSettings()}>
            <Text style={s.permBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {onApp.length > 0 && (
            <>
              <Text style={s.sectionHeader}>On SplitPay</Text>
              {onApp.map((c) => (
                <View key={c.id} style={s.row}>
                  <View style={[s.avatar, s.avatarApp]}>
                    <Text style={s.avatarText}>{c.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.contactName}>{c.name}</Text>
                    <Text style={s.contactSub}>{c.appUser!.email}</Text>
                  </View>
                  <View style={s.onAppTag}>
                    <Text style={s.onAppTagText}>✓ On SplitPay</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {offApp.length > 0 && (
            <>
              <Text style={s.sectionHeader}>Invite to SplitPay</Text>
              {offApp.map((c) => (
                <View key={c.id} style={s.row}>
                  <View style={[s.avatar, s.avatarGray]}>
                    <Text style={[s.avatarText, { color: t.placeholder }]}>{c.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.contactName}>{c.name}</Text>
                    <Text style={s.contactSub} numberOfLines={1}>{c.phone ?? c.email ?? 'No contact info'}</Text>
                  </View>
                  <TouchableOpacity style={s.inviteBtn} onPress={() => handleInvite(c)} disabled={inviting === c.id}>
                    {inviting === c.id ? <ActivityIndicator color={t.primary} size="small" /> : <Text style={s.inviteBtnText}>Invite</Text>}
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
              <Text style={s.emptyTitle}>No contacts found</Text>
              <Text style={s.emptySub}>Try a different search term</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen:        { flex: 1, backgroundColor: t.bg },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
  cancel:        { color: t.primary, fontSize: 16, fontWeight: '600', paddingHorizontal: 8 },
  headerTitle:   { flex: 1, textAlign: 'center', color: t.text, fontSize: 17, fontWeight: 'bold' },
  searchBar:     { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: t.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchIcon:    { fontSize: 15, marginRight: 8 },
  searchInput:   { flex: 1, fontSize: 15, color: t.text },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, fontSize: 13, fontWeight: '700', color: t.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:           { flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border, gap: 12 },
  avatar:        { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarApp:     { backgroundColor: t.primaryBg },
  avatarGray:    { backgroundColor: t.inputBg },
  avatarText:    { color: t.primary, fontWeight: 'bold', fontSize: 16 },
  contactName:   { color: t.text, fontWeight: '600', fontSize: 15 },
  contactSub:    { color: t.placeholder, fontSize: 12, marginTop: 2 },
  inviteBtn:     { borderWidth: 1.5, borderColor: t.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minWidth: 64, alignItems: 'center' },
  inviteBtnText: { color: t.primary, fontWeight: '700', fontSize: 14 },
  onAppTag:      { backgroundColor: t.primaryBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  onAppTagText:  { color: t.primary, fontWeight: '600', fontSize: 12 },
  permBox:       { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60 },
  permTitle:     { color: t.text, fontWeight: 'bold', fontSize: 17, marginBottom: 8, textAlign: 'center' },
  permSub:       { color: t.subtext, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  permBtn:       { backgroundColor: t.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText:   { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  emptyTitle:    { color: t.text, fontWeight: 'bold', fontSize: 16 },
  emptySub:      { color: t.subtext, fontSize: 13, marginTop: 4 },
});}
