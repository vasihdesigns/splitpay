import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getInitials } from '@/lib/utils';
import { sendInvite } from '@/lib/invite';

// ── Types ──────────────────────────────────────────────────────────────────────
interface AppUser {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
}

interface ContactRow {
  id: string;
  name: string;
  initials: string;
  phone?: string;
  email?: string;
  appUser?: AppUser;  // set if they're on SplitPay
  isMember: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function InviteMemberScreen() {
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();
  const { user, isAnonymous } = useAuthStore();

  // ── State ───────────────────────────────────────────────────────────────────
  const [query,         setQuery]         = useState('');
  const [contacts,      setContacts]      = useState<ContactRow[]>([]);
  const [appUsers,      setAppUsers]      = useState<AppUser[]>([]);
  const [existingIds,   setExistingIds]   = useState<string[]>([]);
  const [permStatus,    setPermStatus]    = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [loading,       setLoading]       = useState(true);
  const [adding,        setAdding]        = useState<string | null>(null);
  const [inviting,      setInviting]      = useState<string | null>(null);

  // ── Anonymous gate ──────────────────────────────────────────────────────────
  if (isAnonymous) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add Members</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>🔐</Text>
          <Text style={{ color: '#111827', fontWeight: 'bold', fontSize: 20, textAlign: 'center', marginBottom: 8 }}>
            Create an account to invite friends
          </Text>
          <Text style={{ color: '#6b7280', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Sharing expenses requires a free account so others can find you and split bills together.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#4f46e5', borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12 }}
            onPress={() => { router.back(); router.push('/create-account'); }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Create Free Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ borderWidth: 1, borderColor: '#4f46e5', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center' }}
            onPress={() => { router.back(); router.replace('/(auth)/login'); }}
          >
            <Text style={{ color: '#4f46e5', fontWeight: '600', fontSize: 15 }}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Load existing members + app users + contacts ────────────────────────────
  useEffect(() => {
    async function init() {
      // 1. Current group members
      const { data: members } = await supabase
        .from('group_members').select('user_id').eq('group_id', groupId);
      const memberIds = members?.map((m: any) => m.user_id) ?? [];
      setExistingIds(memberIds);

      // 2. All app users (profiles) — for matching
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name, email, phone');
      const users: AppUser[] = profiles ?? [];
      setAppUsers(users);

      // 3. Request contacts permission
      const { status } = await Contacts.requestPermissionsAsync();
      setPermStatus(status === 'granted' ? 'granted' : 'denied');

      if (status === 'granted') {
        const { data: phoneContacts } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
          sort: Contacts.SortTypes.FirstName,
        });

        // Build email → appUser and phone → appUser lookup maps
        const emailMap = new Map<string, AppUser>();
        const phoneMap = new Map<string, AppUser>();
        users.forEach((u) => {
          if (u.email) emailMap.set(u.email.toLowerCase(), u);
          if (u.phone) phoneMap.set(normalizePhone(u.phone), u);
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

          // Try to match to app user
          let appUser: AppUser | undefined;
          if (email) appUser = emailMap.get(email);
          if (!appUser && phone) appUser = phoneMap.get(normalizePhone(phone));
          // Don't show self
          if (appUser?.id === user?.id) continue;

          rows.push({
            id: c.id ?? key,
            name,
            initials: getInitials(name),
            phone: phone ?? undefined,
            email: email ?? undefined,
            appUser,
            isMember: appUser ? memberIds.includes(appUser.id) : false,
          });
        }

        setContacts(rows);
      }
      setLoading(false);
    }
    init();
  }, [groupId]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = q
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email?.includes(q) ||
            c.phone?.includes(q),
        )
      : contacts;

    // Sort: on-app first, then alphabetical
    return [...list].sort((a, b) => {
      if (a.appUser && !b.appUser) return -1;
      if (!a.appUser && b.appUser) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [contacts, query]);

  const onAppContacts  = filtered.filter((c) => !!c.appUser);
  const offAppContacts = filtered.filter((c) => !c.appUser);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function addMember(contact: ContactRow) {
    if (!contact.appUser) return;
    setAdding(contact.appUser.id);
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: contact.appUser.id });
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setExistingIds((prev) => [...prev, contact.appUser!.id]);
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, isMember: true } : c,
        ),
      );
    }
    setAdding(null);
  }

  async function handleInvite(contact: ContactRow) {
    setInviting(contact.id);
    try {
      await sendInvite({ name: contact.name, phone: contact.phone, email: contact.email });
    } finally {
      setInviting(null);
    }
  }

  // ── Permission denied ───────────────────────────────────────────────────────
  function ContactsPermissionDenied() {
    return (
      <View style={s.permBox}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>📒</Text>
        <Text style={s.permTitle}>Allow contacts access</Text>
        <Text style={s.permSub}>
          SplitPay needs access to your contacts to find friends on the app and send invitations.
        </Text>
        <TouchableOpacity
          style={s.permBtn}
          onPress={() => Linking.openSettings()}
        >
          <Text style={s.permBtnText}>Open Settings</Text>
        </TouchableOpacity>
        {/* Manual search still works */}
        <Text style={s.permOrText}>— or search by name / email below —</Text>
      </View>
    );
  }

  // ── Row component ──────────────────────────────────────────────────────────
  function ContactItem({ item }: { item: ContactRow }) {
    const isAdding   = adding   === item.appUser?.id;
    const isInviting = inviting === item.id;
    const isMember   = item.isMember;

    return (
      <View style={s.row}>
        <View style={[s.avatar, item.appUser ? s.avatarApp : s.avatarGray]}>
          <Text style={[s.avatarText, !item.appUser && { color: '#9ca3af' }]}>
            {item.initials}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.contactName}>{item.name}</Text>
          <Text style={s.contactSub} numberOfLines={1}>
            {item.appUser
              ? item.appUser.email
              : item.phone ?? item.email ?? 'No contact info'}
          </Text>
        </View>
        {item.appUser ? (
          isMember ? (
            <View style={s.memberTag}>
              <Text style={s.memberTagText}>✓ Added</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.addBtn} onPress={() => addMember(item)} disabled={isAdding}>
              {isAdding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.addBtnText}>Add</Text>
              }
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity style={s.inviteBtn} onPress={() => handleInvite(item)} disabled={isInviting}>
            {isInviting
              ? <ActivityIndicator color="#4f46e5" size="small" />
              : <Text style={s.inviteBtnText}>Invite</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.cancel}>Done</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {groupName ? `Add to "${groupName}"` : 'Add Friends'}
        </Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Search bar */}
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
          <ActivityIndicator color="#4f46e5" size="large" />
          <Text style={{ color: '#6b7280', marginTop: 12 }}>Loading contacts…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {permStatus === 'denied' && <ContactsPermissionDenied />}

          {/* On SplitPay */}
          {onAppContacts.length > 0 && (
            <>
              <Text style={s.sectionHeader}>On SplitPay</Text>
              {onAppContacts.map((item) => <ContactItem key={item.id} item={item} />)}
            </>
          )}

          {/* Invite section */}
          {offAppContacts.length > 0 && (
            <>
              <Text style={s.sectionHeader}>
                Invite to SplitPay
              </Text>
              {offAppContacts.map((item) => <ContactItem key={item.id} item={item} />)}
            </>
          )}

          {/* Empty state */}
          {filtered.length === 0 && !loading && permStatus === 'granted' && (
            <View style={s.empty}>
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

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#f8fafc' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cancel:        { color: '#4f46e5', fontSize: 16, fontWeight: '600', paddingHorizontal: 8 },
  headerTitle:   { flex: 1, textAlign: 'center', color: '#111827', fontSize: 17, fontWeight: 'bold' },
  // Search
  searchBar:     { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchIcon:    { fontSize: 15, marginRight: 8 },
  searchInput:   { flex: 1, fontSize: 15, color: '#111827' },
  // Sections
  sectionHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, backgroundColor: '#f8fafc' },
  // Row
  row:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 12 },
  avatar:        { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarApp:     { backgroundColor: '#eef2ff' },
  avatarGray:    { backgroundColor: '#f1f5f9' },
  avatarText:    { color: '#4f46e5', fontWeight: 'bold', fontSize: 16 },
  contactName:   { color: '#111827', fontWeight: '600', fontSize: 15 },
  contactSub:    { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  // Buttons
  addBtn:        { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 7, minWidth: 64, alignItems: 'center' },
  addBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  inviteBtn:     { borderWidth: 1.5, borderColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minWidth: 64, alignItems: 'center' },
  inviteBtnText: { color: '#4f46e5', fontWeight: '700', fontSize: 14 },
  memberTag:     { backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  memberTagText: { color: '#16a34a', fontWeight: '600', fontSize: 12 },
  // Permission denied
  permBox:       { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 24 },
  permTitle:     { color: '#111827', fontWeight: 'bold', fontSize: 17, marginBottom: 8, textAlign: 'center' },
  permSub:       { color: '#6b7280', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  permBtn:       { backgroundColor: '#4f46e5', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnText:   { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  permOrText:    { color: '#9ca3af', fontSize: 13, marginTop: 16 },
  // Empty
  empty:         { alignItems: 'center', marginTop: 60 },
  emptyTitle:    { color: '#111827', fontWeight: 'bold', fontSize: 16 },
  emptySub:      { color: '#6b7280', fontSize: 13, marginTop: 4 },
});
