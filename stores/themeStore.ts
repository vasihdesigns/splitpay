import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'app_dark_mode';

interface ThemeState {
  isDark: boolean;
  hydrated: boolean;
  toggleDark: () => void;
  setDark: (value: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: false,
  hydrated: false,

  toggleDark: () => {
    const next = !get().isDark;
    set({ isDark: next });
    AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  },

  setDark: (value: boolean) => {
    set({ isDark: value });
    AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  },

  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    set({ isDark: stored === '1', hydrated: true });
  },
}));
