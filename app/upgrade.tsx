import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumStore } from '@/stores/premiumStore';

// ─── Feature definitions ──────────────────────────────────────────────────────

const PRO_FEATURES = [
  {
    icon: 'infinite-outline' as const,
    color: '#818cf8',
    bg: '#1e1b4b',
    title: 'Unlimited expenses',
    desc: 'Add as many expenses as you like each day, with no interruptions.',
  },
  {
    icon: 'card-outline' as const,
    color: '#34d399',
    bg: '#022c22',
    title: 'Transaction import',
    desc: 'Connect a credit or debit card to see recent purchases — then split with just a tap.',
  },
  {
    icon: 'globe-outline' as const,
    color: '#38bdf8',
    bg: '#082f49',
    title: 'Currency conversion',
    desc: 'Going abroad? Convert all bills to any currency using today\'s live exchange rates.',
  },
  {
    icon: 'bar-chart-outline' as const,
    color: '#f472b6',
    bg: '#4a044e',
    title: 'Charts & graphs',
    desc: 'Break down spending by category and see trends over time to identify excessive spending.',
  },
  {
    icon: 'scan-outline' as const,
    color: '#fb923c',
    bg: '#431407',
    title: 'Receipt scanning',
    desc: 'Just take a picture of your receipt and Splitwise will automatically scan its contents.',
  },
  {
    icon: 'list-outline' as const,
    color: '#a78bfa',
    bg: '#2e1065',
    title: 'Itemization',
    desc: 'After scanning, detect individual items and assign them to friends. Perfect for restaurants.',
  },
  {
    icon: 'search-outline' as const,
    color: '#facc15',
    bg: '#422006',
    title: 'Expense search',
    desc: 'Locate old bills quickly to double-check and edit them as needed.',
  },
  {
    icon: 'settings-outline' as const,
    color: '#2dd4bf',
    bg: '#042f2e',
    title: 'Default split settings',
    desc: 'Set a custom default split for a group — set it once and forget it.',
  },
  {
    icon: 'rocket-outline' as const,
    color: '#f97316',
    bg: '#431407',
    title: 'Early access',
    desc: 'Share feedback with our team and get early access to redesigns and major new features.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    color: '#4ade80',
    bg: '#052e16',
    title: 'Ad-free experience',
    desc: 'Use the app without any interruptions and help support future development.',
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UpgradeScreen() {
  const router = useRouter();
  const { user, isAnonymous } = useAuthStore();
  const { grantPremium } = usePremiumStore();
  const [plan, setPlan]       = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState(false);

  async function handlePurchase() {
    if (isAnonymous) {
      Alert.alert(
        'Account Required',
        'Create a free account to subscribe to Pro.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Account', onPress: () => { router.back(); router.push('/create-account'); } },
        ],
      );
      return;
    }

    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    if (user?.id) await grantPremium(user.id);
    setLoading(false);
    Alert.alert(
      '🎉 Welcome to Pro!',
      'You now have access to all Pro features. Enjoy the full experience!',
      [{ text: 'Let\'s go!', onPress: () => router.back() }],
    );
  }

  const monthlyPrice = '$2.99';
  const yearlyPrice  = '$19.99';
  const perMonth     = plan === 'monthly' ? '$2.99' : '$1.67';

  return (
    <SafeAreaView style={s.screen}>
      {/* Close */}
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.crownWrap}>
            <View style={s.crownOuter}>
              <View style={s.crownInner}>
                <Ionicons name="star" size={32} color="#f59e0b" />
              </View>
            </View>
            {/* Glow rings */}
            <View style={[s.glowRing, { width: 90,  height: 90,  borderRadius: 45,  opacity: 0.25 }]} />
            <View style={[s.glowRing, { width: 120, height: 120, borderRadius: 60,  opacity: 0.12 }]} />
          </View>

          <Text style={s.proLabel}>PRO</Text>
          <Text style={s.heroTitle}>Upgrade to Pro</Text>
          <Text style={s.heroSub}>
            Unlock the full power of splitting — unlimited, smarter, and ad-free.
          </Text>
        </View>

        {/* ── Plan toggle ── */}
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, plan === 'monthly' && s.toggleActive]}
            onPress={() => setPlan('monthly')}
            activeOpacity={0.8}
          >
            <Text style={[s.toggleLabel, plan === 'monthly' && s.toggleLabelActive]}>Monthly</Text>
            <Text style={[s.togglePrice, plan === 'monthly' && s.togglePriceActive]}>{monthlyPrice}/mo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toggleBtn, plan === 'yearly' && s.toggleActive]}
            onPress={() => setPlan('yearly')}
            activeOpacity={0.8}
          >
            <View style={s.saveBadge}>
              <Text style={s.saveBadgeText}>SAVE 44%</Text>
            </View>
            <Text style={[s.toggleLabel, plan === 'yearly' && s.toggleLabelActive]}>Yearly</Text>
            <Text style={[s.togglePrice, plan === 'yearly' && s.togglePriceActive]}>{yearlyPrice}/yr</Text>
          </TouchableOpacity>
        </View>

        {/* ── Price summary ── */}
        <View style={s.priceRow}>
          <Text style={s.perMonthAmt}>{perMonth}</Text>
          <Text style={s.perMonthLabel}>
            {plan === 'yearly' ? ' / month · billed yearly' : ' / month'}
          </Text>
        </View>

        {/* ── Features list ── */}
        <View style={s.featuresSection}>
          <Text style={s.featuresTitle}>Everything in Pro</Text>

          {PRO_FEATURES.map((f) => (
            <View key={f.title} style={s.featureCard}>
              <View style={[s.featureIconBox, { backgroundColor: f.bg }]}>
                <Ionicons name={f.icon} size={22} color={f.color} />
              </View>
              <View style={s.featureBody}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#4ade80" style={{ marginLeft: 8, marginTop: 2 }} />
            </View>
          ))}
        </View>

        {/* ── CTA ── */}
        <View style={s.ctaSection}>
          <TouchableOpacity
            style={s.purchaseBtn}
            onPress={handlePurchase}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text style={s.purchaseBtnText}>
                  {plan === 'yearly' ? `Start Pro — ${yearlyPrice}/year` : `Start Pro — ${monthlyPrice}/month`}
                </Text>
                <Text style={s.purchaseBtnSub}>
                  {plan === 'yearly' ? `Just ${perMonth}/month` : 'Cancel anytime'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.restoreBtn} activeOpacity={0.7}>
            <Text style={s.restoreBtnText}>Restore Purchase</Text>
          </TouchableOpacity>

          <Text style={s.legal}>
            Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.
            Payment will be charged to your Apple ID account at confirmation of purchase.
          </Text>

          <View style={s.legalLinks}>
            <TouchableOpacity><Text style={s.legalLink}>Privacy Policy</Text></TouchableOpacity>
            <Text style={s.legalSep}> · </Text>
            <TouchableOpacity><Text style={s.legalLink}>Terms of Service</Text></TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PURPLE = '#4f46e5';

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080420' },

  navBar:   { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, alignItems: 'flex-end' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1e1b4b',
              alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero:       { alignItems: 'center', paddingHorizontal: 32, paddingTop: 16, paddingBottom: 32 },
  crownWrap:  { alignItems: 'center', justifyContent: 'center', marginBottom: 20, height: 120, width: 120 },
  crownOuter: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: '#1e1b4b',
                borderWidth: 2, borderColor: PURPLE, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  crownInner: { alignItems: 'center', justifyContent: 'center' },
  glowRing:   { position: 'absolute', borderWidth: 1.5, borderColor: PURPLE },
  proLabel:   { fontSize: 12, fontWeight: '800', letterSpacing: 3, color: '#f59e0b',
                backgroundColor: '#2d1e00', paddingHorizontal: 12, paddingVertical: 3,
                borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  heroTitle:  { fontSize: 30, fontWeight: '800', color: '#fff', marginBottom: 10, textAlign: 'center' },
  heroSub:    { fontSize: 15, color: '#94a3b8', textAlign: 'center', lineHeight: 22 },

  // Plan toggle
  toggleRow:         { flexDirection: 'row', marginHorizontal: 20, marginBottom: 4,
                        backgroundColor: '#12103a', borderRadius: 18, padding: 4, gap: 4 },
  toggleBtn:         { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 3 },
  toggleActive:      { backgroundColor: PURPLE },
  toggleLabel:       { fontSize: 13, fontWeight: '700', color: '#64748b' },
  toggleLabelActive: { color: '#fff' },
  togglePrice:       { fontSize: 15, fontWeight: '800', color: '#475569' },
  togglePriceActive: { color: '#e0e7ff' },
  saveBadge:         { position: 'absolute', top: -10, backgroundColor: '#f59e0b',
                        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  saveBadgeText:     { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Per-month summary
  priceRow:      { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
                   marginTop: 14, marginBottom: 28 },
  perMonthAmt:   { fontSize: 38, fontWeight: '800', color: '#fff' },
  perMonthLabel: { fontSize: 16, color: '#94a3b8', fontWeight: '500' },

  // Features
  featuresSection: { marginHorizontal: 20, marginBottom: 28 },
  featuresTitle:   { fontSize: 13, fontWeight: '700', color: '#64748b', letterSpacing: 1,
                     textTransform: 'uppercase', marginBottom: 14 },
  featureCard:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0f0d2e',
                     borderRadius: 14, padding: 14, marginBottom: 8,
                     borderWidth: 1, borderColor: '#1e1b4b' },
  featureIconBox:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center',
                     justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  featureBody:     { flex: 1 },
  featureTitle:    { fontSize: 15, fontWeight: '700', color: '#e2e8f0', marginBottom: 3 },
  featureDesc:     { fontSize: 13, color: '#64748b', lineHeight: 18 },

  // CTA
  ctaSection:      { paddingHorizontal: 20 },
  purchaseBtn:     { backgroundColor: PURPLE, borderRadius: 18, paddingVertical: 20,
                     alignItems: 'center', marginBottom: 12,
                     shadowColor: PURPLE, shadowOffset: { width: 0, height: 6 },
                     shadowOpacity: 0.5, shadowRadius: 16, elevation: 10 },
  purchaseBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  purchaseBtnSub:  { color: '#a5b4fc', fontSize: 12, fontWeight: '500' },
  restoreBtn:      { alignItems: 'center', paddingVertical: 14, marginBottom: 16 },
  restoreBtnText:  { color: '#64748b', fontSize: 14, fontWeight: '600' },
  legal:           { color: '#334155', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 10 },
  legalLinks:      { flexDirection: 'row', justifyContent: 'center' },
  legalLink:       { color: '#475569', fontSize: 11, textDecorationLine: 'underline' },
  legalSep:        { color: '#334155', fontSize: 11 },
});
