import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useGroupStore } from '@/stores/groupStore';
import { formatCurrency } from '@/lib/utils';
import { Group } from '@/types';
import { useTheme, ThemeColors } from '@/lib/theme';

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const balance = group.balance ?? 0;
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <TouchableOpacity style={s.card} onPress={onPress}>
      <View style={s.cardLeft}>
        <View style={s.iconBox}>
          <Ionicons name="people-outline" size={22} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{group.name}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 90 }}>
        {Math.abs(balance) < 0.01
          ? <Text style={s.settled}>Settled ✓</Text>
          : <>
              <Text style={s.balanceLabel}>{balance > 0 ? 'you are owed' : 'you owe'}</Text>
              <Text style={[s.balanceAmount, { color: balance > 0 ? t.success : t.danger }]}>
                {formatCurrency(Math.abs(balance), group.currency)}
              </Text>
            </>
        }
      </View>
    </TouchableOpacity>
  );
}

export default function GroupsScreen() {
  const { user } = useAuthStore();
  const { groups, loading, fetchGroups } = useGroupStore();
  const [refreshing,   setRefreshing]   = useState(false);
  const [showSettled,  setShowSettled]  = useState(false);
  const router = useRouter();
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  useFocusEffect(useCallback(() => {
    if (user) fetchGroups(user.id);
  }, [user]));

  const active  = groups.filter((g) => Math.abs(g.balance ?? 0) > 0.01);
  const settled = groups.filter((g) => Math.abs(g.balance ?? 0) <= 0.01);

  const totalOwe  = groups.reduce((s, g) => (g.balance ?? 0) < -0.01 ? s + Math.abs(g.balance ?? 0) : s, 0);
  const totalOwed = groups.reduce((s, g) => (g.balance ?? 0) >  0.01 ? s + (g.balance ?? 0) : s, 0);
  const dominantCurrency = groups[0]?.currency ?? 'USD';

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Groups</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => router.push('/group/new')}>
          <Text style={s.newBtnText}>Create group</Text>
        </TouchableOpacity>
      </View>

      {/* Overall balance summary */}
      {!loading && (totalOwe > 0 || totalOwed > 0) && (
        <View style={s.overallRow}>
          {totalOwe > 0 && (
            <Text style={s.overallText}>
              Overall, you owe <Text style={s.overallOwe}>{formatCurrency(totalOwe, dominantCurrency)}</Text>
              {totalOwed > 0 ? '  ' : ''}
            </Text>
          )}
          {totalOwed > 0 && (
            <Text style={s.overallText}>
              {totalOwe > 0 ? 'and ' : 'Overall, '}you are owed <Text style={s.overallOwed}>{formatCurrency(totalOwed, dominantCurrency)}</Text>
            </Text>
          )}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); if (user) await fetchGroups(user.id); setRefreshing(false); }}
            tintColor={t.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : groups.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>👥</Text>
            <Text style={s.emptyTitle}>No groups yet</Text>
            <Text style={s.emptySub}>Create a group to start splitting expenses</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/group/new')}>
              <Text style={s.newBtnText}>Create First Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {active.map((g) => (
              <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
            ))}

            {settled.length > 0 && (
              <View style={s.settledSection}>
                <Text style={s.settledNote}>
                  Hiding {settled.length} group{settled.length !== 1 ? 's' : ''} you settled up with
                </Text>
                <TouchableOpacity style={s.showSettledBtn} onPress={() => setShowSettled((v) => !v)}>
                  <Text style={s.showSettledText}>
                    {showSettled ? 'Hide settled groups' : `Show ${settled.length} settled group${settled.length !== 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>
                {showSettled && settled.map((g) => (
                  <GroupCard key={g.id} group={g} onPress={() => router.push(`/group/${g.id}`)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Floating Add Expense */}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/add-expense')}>
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
        <Text style={s.fabText}>Add expense</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    screen:          { flex: 1, backgroundColor: t.bg },
    topBar:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    pageTitle:       { color: t.text, fontSize: 24, fontWeight: 'bold' },
    newBtn:          { backgroundColor: t.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    newBtnText:      { color: '#ffffff', fontWeight: '600', fontSize: 14 },
    overallRow:      { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.borderStrong },
    overallText:     { color: t.subtext, fontSize: 14, lineHeight: 22 },
    overallOwe:      { color: t.danger, fontWeight: '700' },
    overallOwed:     { color: t.success, fontWeight: '700' },
    card:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border },
    cardLeft:        { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    iconBox:         { width: 48, height: 48, borderRadius: 12, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' },
    cardTitle:       { color: t.text, fontWeight: 'bold', fontSize: 16 },
    cardSub:         { color: t.placeholder, fontSize: 12, marginTop: 2 },
    settled:         { color: t.placeholder, fontSize: 13, fontWeight: '500' },
    balanceLabel:    { color: t.subtext, fontSize: 11 },
    balanceAmount:   { fontWeight: 'bold', fontSize: 15, marginTop: 2 },
    settledSection:  { paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: t.borderStrong, marginTop: 8 },
    settledNote:     { color: t.subtext, fontSize: 13, marginBottom: 8 },
    showSettledBtn:  { borderWidth: 1, borderColor: t.primary, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 },
    showSettledText: { color: t.primary, fontWeight: '600', fontSize: 14 },
    empty:           { alignItems: 'center', marginTop: 80 },
    emptyTitle:      { color: t.text, fontWeight: 'bold', fontSize: 18 },
    emptySub:        { color: t.subtext, fontSize: 14, marginTop: 8, textAlign: 'center' },
    emptyBtn:        { marginTop: 24, backgroundColor: t.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
    fab:             { position: 'absolute', bottom: 24, right: 20, backgroundColor: t.primary, borderRadius: 28, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 8, shadowColor: t.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    fabText:         { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  });
}
