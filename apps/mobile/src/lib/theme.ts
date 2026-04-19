/**
 * Centralized theme tokens for Puzzle Roll.
 *
 * NativeWind handles className-based theming via the `dark:` variant.
 * For StyleSheet-based components (those using StyleSheet.create or inline style={}),
 * use these tokens directly based on the resolved theme from useTheme().
 *
 * Usage:
 *   import { useTheme } from '../../app/_layout';
 *   import { themes } from '../lib/theme';
 *   const resolvedTheme = useTheme();
 *   const t = themes[resolvedTheme];
 *   // then: style={{ backgroundColor: t.background }}
 */

export interface ThemeTokens {
  // Backgrounds
  background: string;
  surface: string;
  surface2: string;
  surface3: string;

  // Borders
  border: string;
  borderSubtle: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Interactive
  accent: string;        // primary brand indigo
  accentLight: string;   // lighter indigo for highlights
  danger: string;

  // Status
  success: string;
  successBg: string;
}

const dark: ThemeTokens = {
  background: '#060818',
  surface: '#111827',
  surface2: '#1f2937',
  surface3: '#374151',
  border: '#374151',
  borderSubtle: '#1f2937',
  textPrimary: '#f9fafb',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  accent: '#6366f1',
  accentLight: '#a5b4fc',
  danger: '#f87171',
  success: '#4ade80',
  successBg: '#052e16',
};

const light: ThemeTokens = {
  background: '#f9fafb',
  surface: '#ffffff',
  surface2: '#f3f4f6',
  surface3: '#e5e7eb',
  border: '#d1d5db',
  borderSubtle: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  accent: '#6366f1',
  accentLight: '#4f46e5',
  danger: '#ef4444',
  success: '#16a34a',
  successBg: '#dcfce7',
};

export const themes: Record<'light' | 'dark', ThemeTokens> = { dark, light };