import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumStore } from '@/stores/premiumStore';

const FREE_FEATURES = [
  'Create & join groups',
  'Add & track expenses',
  'Balance calculations',
  'Activity feed',
  'Settle up with friends',
];

const PREMIUM_FEATURES = [
  { icon: '🚫', label: 'Ad-free experience' },
  { icon: '📷', label: 'Receipt photo scanning' },
  { icon: '📊', label: 'Export to CSV & PDF' },
  { icon: '💱', label: 'Multi-currency support' },
  { icon: '🔁', label: 'Recurring expenses' },
  { icon: '🔔', label: 'Payment reminders' },
  { icon: '📈', label: 'Spending analytics' },
  { icon: '☁️', label: 'Priority sync & backup' },
];

export default function UpgradeScreen() {
  const router = useRouter();
  const { user, isAnonymous } = useAuthStore();
  const { grantPremium } = usePremiumStore();
  const [plan, setPlan]       = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState(false);

  async function handlePurchase() {
    // Anonymous users must create an account first
    if (isAnonymous) {
      Alert.alert(
        'Account Required',
        'Create a free account to subscribe to Premium.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Account', onPress: () => { router.back(); router.push('/create-account'); } },
        ],
      );
      return;
    }

    setLoading(true);
    // TODO: Replace with RevenueCat / StoreKit purchase
    // For now, simulate a successful purchase
    await new Promise(r => setTimeout(r, 1500));
    if (user?.id) await grantPremium(user.id);
    setLoading(false);
    Alert.alert(
      'Welcome to Premium! 🎉',
      'You now have access to all premium features. Enjoy an ad-free experience!',
      [{ text: 'Awesome!', onPress: () => router.back() }],
    );
  }

  const price    = plan === 'monthly' ? '$2.99' : '$19.99';
  const perMonth = plan === 'monthly' ? '$2.99/mo' : '$1.67/mo';
  const savings  = plan === 'yearly' ? 'Save 44%' : null;

  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={s.close}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.crownBox}>
            <Text style={{ fontSize: 36 }}>👑</Text>
          </View>
          <Text style={s.heroTitle}>SplitPay Premium</Text>
          <Text style={s.heroSub}>Split smarter. No ads. More power.</Text>
        </View>

        {/* Plan toggle */}
        <View style={s.toggleRow}>
          {(['monthly', 'yearly'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[s.toggleBtn, plan === p && s.toggleBtnActive]}
              onPress={() => setPlan(p)}
            >
              <Text style={[s.toggleLabel, plan === p && s.toggleLabelActive]}>
                {p === 'monthly' ? 'Monthly' : 'Yearly'}
              </Text>
              {p === 'yearly' && (
                <View style={s.saveBadge}>
                  <Text style={s.saveBadgeText}>BEST VALUE</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Price card */}
        <View style={s.priceCard}>
          <Text style={s.price}>{price}</Text>
          <Text style={s.priceSub}>
            {plan === 'yearly' ? `${perMonth} · billed annually` : 'billed monthly'}
          </Text>
          {savings && <View style={s.savingsChip}><Text style={s.savingsText}>{savings}</Text></View>}
        </View>

        {/* Premium features */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Everything in Premium</Text>
          {PREMIUM_FEATURES.map((f) => (
            <View key={f.label} style={s.featureRow}>
              <View style={s.featureIconBox}>
                <Text style={{ fontSize: 18 }}>{f.icon}</Text>
              </View>
              <Text style={s.featureLabel}>{f.label}</Text>
              <Text style={s.checkmark}>✓</Text>
            </View>
          ))}
        </View>

        {/* Free vs Premium comparison */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Free plan includes</Text>
          {FREE_FEATURES.map((f) => (
            <View key={f} style={s.freeRow}>
              <Text style={s.freeLabel}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={s.ctaSection}>
          <TouchableOpacity
            style={s.purchaseBtn}
            onPress={handlePurchase}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.purchaseBtnText}>
                  {plan === 'yearly' ? 'Start Premium — $19.99/yr' : 'Start Premium — $2.99/mo'}
                </Text>
            }
          </TouchableOpacity>

          <Text style={s.legal}>
            Cancel anytime. Subscription auto-renews unless cancelled 24 hours before the end of the current period. Payment charged to your Apple ID.
          </Text>

          <View style={s.legalLinks}>
            <TouchableOpacity><Text style={s.legalLink}>Privacy Policy</Text></TouchableOpacity>
            <Text style={s.legalDot}> · </Text>
            <TouchableOpacity><Text style={s.legalLink}>Terms of Service</Text></TouchableOpacity>
            <Text style={s.legalDot}> · </Text>
            <TouchableOpacity><Text style={s.legalLink}>Restore Purchase</Text></TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: '#0f0a2e' },
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  close:            { color: '#9ca3af', fontSize: 18, fontWeight: '600', padding: 4 },
  // Hero
  hero:             { alignItems: 'center', paddingTop: 8, paddingBottom: 28 },
  crownBox:         { width: 80, height: 80, borderRadius: 24, backgroundColor: '#1e1554', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#4f46e5' },
  heroTitle:        { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  heroSub:          { color: '#a5b4fc', fontSize: 15 },
  // Plan toggle
  toggleRow:        { flexDirection: 'row', marginHorizontal: 24, marginBottom: 20, backgroundColor: '#1e1554', borderRadius: 14, padding: 4 },
  toggleBtn:        { flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  toggleBtnActive:  { backgroundColor: '#4f46e5' },
  toggleLabel:      { color: '#9ca3af', fontWeight: '600', fontSize: 14 },
  toggleLabelActive:{ color: '#fff' },
  saveBadge:        { backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  saveBadgeText:    { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  // Price
  priceCard:        { marginHorizontal: 24, backgroundColor: '#1e1554', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#4f46e5' },
  price:            { color: '#fff', fontSize: 42, fontWeight: 'bold' },
  priceSub:         { color: '#a5b4fc', fontSize: 14, marginTop: 4 },
  savingsChip:      { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  savingsText:      { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  // Features
  section:          { marginHorizontal: 24, marginBottom: 20 },
  sectionTitle:     { color: '#fff', fontWeight: 'bold', fontSize: 17, marginBottom: 12 },
  featureRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1554', borderRadius: 12, padding: 14, marginBottom: 8 },
  featureIconBox:   { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2d2070', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  featureLabel:     { flex: 1, color: '#e0e7ff', fontSize: 15, fontWeight: '500' },
  checkmark:        { color: '#4ade80', fontSize: 16, fontWeight: 'bold' },
  freeRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e1554' },
  freeLabel:        { flex: 1, color: '#9ca3af', fontSize: 14 },
  // CTA
  ctaSection:       { paddingHorizontal: 24 },
  purchaseBtn:      { backgroundColor: '#4f46e5', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 16 },
  purchaseBtnText:  { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  legal:            { color: '#6b7280', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  legalLinks:       { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  legalLink:        { color: '#6b7280', fontSize: 11, textDecoration: 'underline' } as any,
  legalDot:         { color: '#6b7280', fontSize: 11 },
});
