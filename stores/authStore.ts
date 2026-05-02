import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
  signInAnonymously: () => Promise<boolean>;
  fetchProfile: (userId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  isAnonymous: false,

  setSession: (session) => {
    const isAnonymous = session?.user?.is_anonymous ?? false;
    set({ session, loading: false, isAnonymous });
  },

  setUser: (user) => set({ user }),

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) return false;
    set({
      session: data.session,
      isAnonymous: true,
      loading: false,
      user: { id: data.session.user.id, full_name: 'Guest', email: '', created_at: '' } as User,
    });
    return true;
  },

  fetchProfile: async (userId: string) => {
    const session = get().session;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      // Profile found — use it
      set({ user: data as User, isAnonymous: false });
    } else if (session?.user?.is_anonymous) {
      // Anonymous user — no profile row expected
      set({ user: { id: userId, full_name: 'Guest', email: '', created_at: '' } as User, isAnonymous: true });
    } else if (error?.code === 'PGRST116') {
      // Row genuinely missing (new OAuth user, etc.) — create it now
      const fullName =
        session?.user?.user_metadata?.full_name ??
        session?.user?.user_metadata?.name ??
        session?.user?.email?.split('@')[0] ??
        'User';
      const email = session?.user?.email ?? '';
      await supabase.from('profiles').upsert({ id: userId, full_name: fullName, email });
      set({ user: { id: userId, full_name: fullName, email, created_at: '' } as User, isAnonymous: false });
    } else {
      // Transient error — keep any existing user state, don't overwrite
      const existing = get().user;
      if (!existing) {
        // Nothing loaded yet — use session metadata as temporary fallback
        set({ user: { id: userId, full_name: session?.user?.user_metadata?.full_name ?? 'User', email: session?.user?.email ?? '', created_at: '' } as User, isAnonymous: false });
      }
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, isAnonymous: false });
  },
}));
