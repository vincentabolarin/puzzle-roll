import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'puzzle_roll_settings_v3';

export type ThemeOption = 'light' | 'dark' | 'system';

interface SettingsState {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  autoRemoveNotes: boolean;
  theme: ThemeOption;
  isHydrated: boolean;
}

interface SettingsActions {
  setSoundEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setAutoRemoveNotes: (enabled: boolean) => void;
  setTheme: (theme: ThemeOption) => void;
  hydrateFromStorage: () => Promise<void>;
  persistToStorage: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  soundEnabled: true,
  hapticsEnabled: true,
  autoRemoveNotes: true,
  theme: 'dark',
  isHydrated: false,

  setSoundEnabled: (enabled) => { set({ soundEnabled: enabled }); get().persistToStorage(); },
  setHapticsEnabled: (enabled) => { set({ hapticsEnabled: enabled }); get().persistToStorage(); },
  setAutoRemoveNotes: (enabled) => { set({ autoRemoveNotes: enabled }); get().persistToStorage(); },
  setTheme: (theme) => { set({ theme }); get().persistToStorage(); },

  hydrateFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SettingsState>;
        set({
          soundEnabled: saved.soundEnabled ?? true,
          hapticsEnabled: saved.hapticsEnabled ?? true,
          autoRemoveNotes: saved.autoRemoveNotes ?? true,
          // Migrate old boolean darkMode -> ThemeOption
          theme: saved.theme ?? ((saved as Record<string, unknown>)['darkMode'] === false ? 'light' : 'dark'),
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },

  persistToStorage: async () => {
    const { soundEnabled, hapticsEnabled, autoRemoveNotes, theme } = get();
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ soundEnabled, hapticsEnabled, autoRemoveNotes, theme })
    );
  },
}));