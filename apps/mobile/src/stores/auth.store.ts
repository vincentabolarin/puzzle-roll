import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'puzzle_roll_access_token';
const REFRESH_TOKEN_KEY = 'puzzle_roll_refresh_token';
const DEVICE_ID_KEY = 'puzzle_roll_device_id';

export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  username?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isHydrated: boolean;
}

interface AuthActions {
  setSession: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>;
  clearSession: () => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
  getAccessToken: () => string | null;
  getDeviceId: () => Promise<string>;
  updateAccessToken: (accessToken: string) => Promise<void>;
  setUsername: (username: string) => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  isHydrated: false,

  setSession: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    set({ user, accessToken, refreshToken });
  },

  clearSession: async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hydrateFromStorage: async () => {
    try {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (accessToken && refreshToken) {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        set({
          accessToken,
          refreshToken,
          user: {
            id: payload.sub as string,
            email: payload.email as string | null,
            isAnonymous: payload.isAnonymous as boolean,
            username: (payload.username as string | null) ?? null,
          },
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },

  getAccessToken: () => get().accessToken,

  getDeviceId: async () => {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  },

  updateAccessToken: async (accessToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    set({ accessToken });
  },

  setUsername: (username) => {
    set((s) => ({ user: s.user ? { ...s.user, username } : null }));
  },
}));