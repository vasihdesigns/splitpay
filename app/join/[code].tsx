import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, ThemeColors } from '@/lib/theme';

export default function JoinGroupScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const [groupId, setGroupId]     = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [joining, setJoining]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    async function lookupGroup() {
      if (!code) {
        setError('Invalid invite link');
        setLoading(false);
        return;
      }
      const { data, error: dbError } = await supabase
        .from('groups')
        .select('id, name')
        .eq('invite_code', code)
        .single();

      if (dbError || !data) {
        setError('Invalid invite link');
      } else {
        setGroupId(data.id);
        setGroupName(data.name);
      }
      setLoading(false);
    }
    lookupGroup();
  }, [code]);

  async function handleJoin() {
    if (!groupId || !user) return;
    setJoining(true);

    const { error: insertError } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: user.id });

    // 23505 = unique_violation — already a member, just navigate
    if (insertError && insertError.code !== '23505') {
      setError(insertError.message);
      setJoining(false);
      return;
    }

    setJoining(false);
    router.replace(`/group/${groupId}`);
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.primary} size="large" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
        <View style={s.center}>
          <Ionicons name="link-outline" size={56} color={t.danger} style={{ marginBottom: 16 }} />
          <Text style={s.errorTitle}>Invalid Invite Link</Text>
          <Text style={s.errorSub}>This link may have expired or been removed.</Text>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.back()}>
            <Text style={[s.secondaryBtnText, { color: t.primary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      <View style={s.center}>
        {/* Welcome icon */}
        <View style={[s.iconWrap, { backgroundColor: t.successBg }]}>
          <Ionicons name="people-outline" size={40} color={t.success} />
        </View>

        <Text style={s.subtext}>You've been invited to</Text>
        <Text style={s.groupName}>{groupName}</Text>

        <Text style={s.hint}>Join this group to split expenses and settle up together.</Text>

        <TouchableOpacity
          style={[s.joinBtn, { backgroundColor: t.success }, joining && { opacity: 0.6 }]}
          onPress={handleJoin}
          disabled={joining}
          activeOpacity={0.8}
        >
          {joining
            ? <ActivityIndicator color="#fff" size="small" />
            : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.joinBtnText}>Join {groupName}</Text>
              </>
            )}
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={() => router.back()}>
          <Text style={[s.secondaryBtnText, { color: t.subtext }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:         { flex: 1, backgroundColor: t.bg },
    center:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    iconWrap:       { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    subtext:        { color: t.subtext, fontSize: 15, marginBottom: 6 },
    groupName:      { color: t.text, fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
    hint:           { color: t.placeholder, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 36 },
    joinBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                      paddingVertical: 16, paddingHorizontal: 32, width: '100%', marginBottom: 12,
                      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
    joinBtnText:    { color: '#fff', fontSize: 17, fontWeight: '700' },
    secondaryBtn:   { paddingVertical: 12, paddingHorizontal: 24 },
    secondaryBtnText: { fontSize: 15, fontWeight: '500' },
    errorTitle:     { color: t.text, fontSize: 22, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
    errorSub:       { color: t.subtext, fontSize: 14, textAlign: 'center', marginBottom: 28 },
  });
}
