import { apiClient } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  isAnonymous: boolean;
}

export const authService = {
  async register(email: string, password: string): Promise<void> {
    const result = await apiClient.post<AuthResponse>('/auth/register', { email, password }, { skipAuth: true });
    const { setSession } = useAuthStore.getState();
    await setSession(
      { id: result.userId, email, isAnonymous: false },
      result.accessToken,
      result.refreshToken
    );
  },

  async login(email: string, password: string): Promise<void> {
    const result = await apiClient.post<AuthResponse>('/auth/login', { email, password }, { skipAuth: true });
    const { setSession } = useAuthStore.getState();
    await setSession(
      { id: result.userId, email, isAnonymous: false },
      result.accessToken,
      result.refreshToken
    );
  },

  async createAnonymousSession(): Promise<void> {
    const { getDeviceId, setSession } = useAuthStore.getState();
    const deviceId = await getDeviceId();
    const result = await apiClient.post<AuthResponse>(
      '/auth/anonymous',
      { deviceId },
      { skipAuth: true }
    );
    await setSession(
      { id: result.userId, email: null, isAnonymous: true },
      result.accessToken,
      result.refreshToken
    );
  },

  async upgradeAccount(email: string, password: string): Promise<void> {
    const result = await apiClient.post<AuthResponse>('/auth/upgrade', { email, password });
    const { setSession } = useAuthStore.getState();
    await setSession(
      { id: result.userId, email, isAnonymous: false },
      result.accessToken,
      result.refreshToken
    );
  },

  async logout(): Promise<void> {
    const { clearSession } = useAuthStore.getState();
    await clearSession();
  },
};
