import { apiClient } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';
import { usePuzzleProgressStore } from '../stores/puzzle-progress.store';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  isAnonymous: boolean;
  username?: string | null;
}

interface CloudProgress {
  puzzleId: string;
  gameType: string;
  elapsedSeconds: number;
  hintsUsed: number;
  completedAt: string | null;
  currentState: unknown;
  savedAt: number;
}

/**
 * After login, merge local AsyncStorage progress with cloud progress.
 * Rule: for each puzzle, keep whichever has more elapsed time (furthest progress).
 * Completed puzzles always win over in-progress.
 */
async function mergeProgressOnLogin(userId: string): Promise<void> {
  try {
    // Fetch cloud progress
    let cloudProgress: CloudProgress[] = [];
    try {
      cloudProgress = await apiClient.get<CloudProgress[]>(`/progress/user/${userId}`);
    } catch {
      // Non-fatal — cloud might not have this endpoint yet; proceed with local only
      return;
    }

    const { completedPuzzleIds } = usePuzzleProgressStore.getState();

    for (const cloud of cloudProgress) {
      const { puzzleId, elapsedSeconds: cloudElapsed, completedAt, currentState, savedAt, hintsUsed } = cloud;

      // If cloud says completed, mark locally completed
      if (completedAt) {
        if (!completedPuzzleIds.has(puzzleId)) {
          await usePuzzleProgressStore.getState().markCompleted(puzzleId);
        }
        continue;
      }

      // Compare with local in-progress
      const local = await usePuzzleProgressStore.getState().loadProgress(puzzleId);
      const localElapsed = local?.elapsedSeconds ?? 0;
      const localCompleted = completedPuzzleIds.has(puzzleId);

      if (localCompleted) continue; // local already completed — keep it

      // Use whichever has more elapsed time (further progress)
      if (cloudElapsed > localElapsed && currentState) {
        await usePuzzleProgressStore.getState().saveProgress({
          puzzleId,
          gameType: cloud.gameType as never,
          difficulty: (local?.difficulty ?? 'medium') as never,
          isDaily: local?.isDaily ?? false,
          dailyPuzzleId: local?.dailyPuzzleId ?? null,
          elapsedSeconds: cloudElapsed,
          hintsUsed: hintsUsed ?? local?.hintsUsed ?? 0,
          hintsRemaining: local?.hintsRemaining ?? 3,
          currentState,
          savedAt: savedAt ?? Date.now(),
        });
      }
    }
  } catch {
    // Always non-fatal
  }
}

export const authService = {
  async register(email: string, password: string): Promise<void> {
    const result = await apiClient.post<AuthResponse>(
      '/auth/register',
      { email, password },
      { skipAuth: true }
    );
    const { setSession } = useAuthStore.getState();
    await setSession(
      { id: result.userId, email, isAnonymous: false, username: result.username ?? null },
      result.accessToken,
      result.refreshToken
    );
  },

  async login(email: string, password: string): Promise<void> {
    const result = await apiClient.post<AuthResponse>(
      '/auth/login',
      { email, password },
      { skipAuth: true }
    );
    const { setSession } = useAuthStore.getState();
    await setSession(
      { id: result.userId, email, isAnonymous: false, username: result.username ?? null },
      result.accessToken,
      result.refreshToken
    );
    // Merge progress after login — non-blocking
    mergeProgressOnLogin(result.userId).catch(() => {});
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
      { id: result.userId, email: null, isAnonymous: true, username: null },
      result.accessToken,
      result.refreshToken
    );
  },

  async upgradeAccount(email: string, password: string): Promise<void> {
    const result = await apiClient.post<AuthResponse>('/auth/upgrade', { email, password });
    const { setSession } = useAuthStore.getState();
    await setSession(
      { id: result.userId, email, isAnonymous: false, username: result.username ?? null },
      result.accessToken,
      result.refreshToken
    );
  },

  async logout(): Promise<void> {
    const { clearSession } = useAuthStore.getState();
    await clearSession();
  },
};