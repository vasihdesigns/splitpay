import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface PremiumState {
  isPremium: boolean;
  loading: boolean;
  checkPremium: (userId: string) => Promise<void>;
  grantPremium: (userId: string) => Promise<void>;
}

export const usePremiumStore = create<PremiumState>((set) => ({
  isPremium: false,
  loading: true,

  checkPremium: async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('is_premium, premium_expires_at')
      .eq('id', userId)
      .single();

    const active = data?.is_premium === true &&
      (!data.premium_expires_at || new Date(data.premium_expires_at) > new Date());

    set({ isPremium: active, loading: false });
  },

  // Call this after a successful purchase to update DB + local state
  grantPremium: async (userId: string) => {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1-year sub
    await supabase
      .from('profiles')
      .update({ is_premium: true, premium_expires_at: expiresAt.toISOString() })
      .eq('id', userId);
    set({ isPremium: true });
  },
}));
