import { useThemeStore } from '@/stores/themeStore';

export type ThemeColors = {
  bg: string;
  card: string;
  border: string;
  borderStrong: string;
  text: string;
  subtext: string;
  placeholder: string;
  primary: string;
  primaryBg: string;
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  tabBar: string;
  tabBarBorder: string;
  inputBg: string;
  overlay: string;
  muted: string;
};

export const light: ThemeColors = {
  bg:           '#f8fafc',
  card:         '#ffffff',
  border:       '#f1f5f9',
  borderStrong: '#e5e7eb',
  text:         '#111827',
  subtext:      '#6b7280',
  placeholder:  '#9ca3af',
  primary:      '#4f46e5',
  primaryBg:    '#eef2ff',
  success:      '#16a34a',
  successBg:    '#f0fdf4',
  danger:       '#dc2626',
  dangerBg:     '#fff1f2',
  tabBar:       '#ffffff',
  tabBarBorder: '#f1f5f9',
  inputBg:      '#f8fafc',
  overlay:      'rgba(0,0,0,0.5)',
  muted:        '#e5e7eb',
};

export const dark: ThemeColors = {
  bg:           '#0f172a',
  card:         '#1e293b',
  border:       '#334155',
  borderStrong: '#475569',
  text:         '#f1f5f9',
  subtext:      '#94a3b8',
  placeholder:  '#64748b',
  primary:      '#818cf8',
  primaryBg:    '#1e1b4b',
  success:      '#22c55e',
  successBg:    '#052e16',
  danger:       '#f87171',
  dangerBg:     '#450a0a',
  tabBar:       '#1e293b',
  tabBarBorder: '#334155',
  inputBg:      '#1e293b',
  overlay:      'rgba(0,0,0,0.7)',
  muted:        '#334155',
};

export function useTheme(): ThemeColors {
  const isDark = useThemeStore((s) => s.isDark);
  return isDark ? dark : light;
}
