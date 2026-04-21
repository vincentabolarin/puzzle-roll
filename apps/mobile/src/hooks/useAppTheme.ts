/**
 * useAppTheme — returns the resolved ThemeTokens for the current theme setting.
 *
 * Use this in any StyleSheet-based component to get theme-aware colors.
 * NativeWind className-based components automatically pick up dark/light
 * via the tailwind.config colors, but StyleSheet components need this hook.
 *
 * Usage:
 *   const t = useAppTheme();
 *   <View style={{ backgroundColor: t.background }} />
 */
import { useSettingsStore } from '../stores/settings.store';
import { useColorScheme } from 'react-native';
import { themes, ThemeTokens } from '../lib/theme';

export function useAppTheme(): ThemeTokens {
  const { theme } = useSettingsStore();
  const systemScheme = useColorScheme();

  const resolved: 'light' | 'dark' =
    theme === 'system'
      ? (systemScheme === 'light' ? 'light' : 'dark')
      : theme;

  return themes[resolved];
}