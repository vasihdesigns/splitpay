import '../global.css';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumStore } from '@/stores/premiumStore';
import { useThemeStore } from '@/stores/themeStore';

export default function RootLayout() {
  const { setSession, fetchProfile, user } = useAuthStore();
  const { checkPremium } = usePremiumStore();
  const { isDark, hydrate } = useThemeStore();

  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
          if (!newSession.user.is_anonymous) checkPremium(newSession.user.id);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
        if (!s.user.is_anonymous) checkPremium(s.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Process recurring expenses on app focus ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    processRecurringExpenses(user.id);
  }, [user?.id]);

  async function processRecurringExpenses(userId: string) {
    const today = new Date().toISOString().split('T')[0];

    // 1. Find all due recurring expenses paid by the current user
    const { data: dueExpenses, error } = await supabase
      .from('expenses')
      .select('*')
      .not('recurring', 'is', null)
      .lte('next_due', today)
      .eq('paid_by', userId);

    if (error || !dueExpenses || dueExpenses.length === 0) return;

    let created = 0;

    for (const orig of dueExpenses) {
      // Compute the next_due for the newly created copy
      function advanceDate(r: string, from: string): string {
        const d = new Date(from);
        if (r === 'daily')   d.setDate(d.getDate() + 1);
        if (r === 'weekly')  d.setDate(d.getDate() + 7);
        if (r === 'monthly') d.setMonth(d.getMonth() + 1);
        if (r === 'yearly')  d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split('T')[0];
      }

      const newNextDue = advanceDate(orig.recurring, orig.next_due ?? today);

      // 2. Insert a new expense row (copy of original)
      const { data: newExpense, error: insertErr } = await supabase
        .from('expenses')
        .insert({
          group_id:    orig.group_id,
          paid_by:     orig.paid_by,
          description: orig.description,
          amount:      orig.amount,
          currency:    orig.currency,
          split_type:  orig.split_type,
          date:        today,
          recurring:   orig.recurring,
          next_due:    newNextDue,
          parent_id:   orig.id,
        })
        .select()
        .single();

      if (insertErr || !newExpense) continue;

      // 3. Copy expense_splits from original (reset paid to false)
      const { data: origSplits } = await supabase
        .from('expense_splits')
        .select('user_id, amount')
        .eq('expense_id', orig.id);

      if (origSplits && origSplits.length > 0) {
        await supabase.from('expense_splits').insert(
          origSplits.map((s: { user_id: string; amount: number }) => ({
            expense_id: newExpense.id,
            user_id:    s.user_id,
            amount:     s.amount,
            paid:       s.user_id === orig.paid_by,
          }))
        );
      }

      // 4. Advance the original expense's next_due to its next occurrence
      await supabase
        .from('expenses')
        .update({ next_due: newNextDue })
        .eq('id', orig.id);

      created++;
    }

    // 5. Notify user if any recurring expenses were created
    if (created > 0) {
      Alert.alert(
        'Recurring Expenses',
        `${created} recurring expense${created > 1 ? 's' : ''} added.`,
      );
    }
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="add-expense" options={{ presentation: 'modal' }} />
        <Stack.Screen name="invite-member" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settle-up" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create-account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="upgrade" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-friends" options={{ presentation: 'modal' }} />
        <Stack.Screen name="join/[code]" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
