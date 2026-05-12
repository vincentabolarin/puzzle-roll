import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameType, Difficulty } from '@puzzle-roll/shared';

const PROGRESS_KEY_PREFIX = 'proll_progress_';
const COMPLETED_KEY = 'proll_completed';
const DAILY_COMPLETED_KEY = 'proll_daily_completed';
const DAILY_RESULT_KEY_PREFIX = 'proll_daily_result_';

export interface SavedPuzzleProgress {
  puzzleId: string;
  gameType: GameType;
  difficulty: Difficulty;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  elapsedSeconds: number;
  hintsUsed: number;
  hintsRemaining: number;
  currentState: unknown;
  savedAt: number;
}

interface PuzzleProgressState {
  completedPuzzleIds: Set<string>;
  /** Puzzle IDs completed specifically via the daily route (isDaily = true) */
  dailyCompletedPuzzleIds: Set<string>;
  inProgressPuzzleIds: Set<string>;
}

interface PuzzleProgressActions {
  saveProgress: (progress: SavedPuzzleProgress) => Promise<void>;
  loadProgress: (puzzleId: string) => Promise<SavedPuzzleProgress | null>;
  clearProgress: (puzzleId: string) => Promise<void>;
  markCompleted: (puzzleId: string, isDaily?: boolean) => Promise<void>;
  isCompleted: (puzzleId: string) => boolean;
  /** Returns true only if completed via the daily route */
  isDailyCompleted: (puzzleId: string) => boolean;
  isInProgress: (puzzleId: string) => boolean;
  saveDailyResult: (dailyPuzzleId: string, shareableResult: string) => Promise<void>;
  getDailyResult: (dailyPuzzleId: string) => Promise<string | null>;
  /** Called on login/logout — clears in-memory state and AsyncStorage so it re-hydrates for the new user */
  resetForUserChange: () => Promise<void>;
}

export const usePuzzleProgressStore = create<PuzzleProgressState & PuzzleProgressActions>(
  (set, get) => ({
    completedPuzzleIds: new Set(),
    dailyCompletedPuzzleIds: new Set(),
    inProgressPuzzleIds: new Set(),

    saveProgress: async (progress) => {
      const key = `${PROGRESS_KEY_PREFIX}${progress.puzzleId}`;
      await AsyncStorage.setItem(key, JSON.stringify(progress));
      set((s) => ({
        inProgressPuzzleIds: new Set([...s.inProgressPuzzleIds, progress.puzzleId]),
      }));
    },

    loadProgress: async (puzzleId) => {
      try {
        const raw = await AsyncStorage.getItem(`${PROGRESS_KEY_PREFIX}${puzzleId}`);
        if (!raw) return null;
        return JSON.parse(raw) as SavedPuzzleProgress;
      } catch {
        return null;
      }
    },

    clearProgress: async (puzzleId) => {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${puzzleId}`);
      set((s) => {
        const next = new Set(s.inProgressPuzzleIds);
        next.delete(puzzleId);
        return { inProgressPuzzleIds: next };
      });
    },

    markCompleted: async (puzzleId, isDaily = false) => {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${puzzleId}`);
      const { completedPuzzleIds, dailyCompletedPuzzleIds } = get();

      // Daily completions go into dailyCompletedPuzzleIds only — not completedPuzzleIds.
      // This prevents daily puzzles from being marked "Done" in the free-play list.
      const updatedCompleted = isDaily
        ? completedPuzzleIds
        : new Set([...completedPuzzleIds, puzzleId]);
      const updatedDaily = isDaily
        ? new Set([...dailyCompletedPuzzleIds, puzzleId])
        : dailyCompletedPuzzleIds;

      try {
        await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify([...updatedCompleted]));
        if (isDaily) {
          await AsyncStorage.setItem(DAILY_COMPLETED_KEY, JSON.stringify([...updatedDaily]));
        }
      } catch {}

      set((s) => {
        const inProg = new Set(s.inProgressPuzzleIds);
        inProg.delete(puzzleId);
        return {
          completedPuzzleIds: updatedCompleted,
          dailyCompletedPuzzleIds: updatedDaily,
          inProgressPuzzleIds: inProg,
        };
      });
    },

    isCompleted: (puzzleId) => get().completedPuzzleIds.has(puzzleId),
    isDailyCompleted: (puzzleId) => get().dailyCompletedPuzzleIds.has(puzzleId),
    isInProgress: (puzzleId) =>
      !get().completedPuzzleIds.has(puzzleId) && get().inProgressPuzzleIds.has(puzzleId),

    saveDailyResult: async (dailyPuzzleId, shareableResult) => {
      try {
        await AsyncStorage.setItem(`${DAILY_RESULT_KEY_PREFIX}${dailyPuzzleId}`, shareableResult);
      } catch {}
    },

    getDailyResult: async (dailyPuzzleId) => {
      try {
        return await AsyncStorage.getItem(`${DAILY_RESULT_KEY_PREFIX}${dailyPuzzleId}`);
      } catch {
        return null;
      }
    },

    resetForUserChange: async () => {
      set({ completedPuzzleIds: new Set(), dailyCompletedPuzzleIds: new Set(), inProgressPuzzleIds: new Set() });
      await AsyncStorage.removeItem(COMPLETED_KEY);
      await AsyncStorage.removeItem(DAILY_COMPLETED_KEY);
      const allKeys = await AsyncStorage.getAllKeys();
      const progressKeys = allKeys.filter((k) => k.startsWith(PROGRESS_KEY_PREFIX));
      if (progressKeys.length > 0) await AsyncStorage.multiRemove(progressKeys);
    },
  })
);

export async function hydratePuzzleProgress(): Promise<void> {
  try {
    const [completedRaw, dailyCompletedRaw, allKeys] = await Promise.all([
      AsyncStorage.getItem(COMPLETED_KEY),
      AsyncStorage.getItem(DAILY_COMPLETED_KEY),
      AsyncStorage.getAllKeys(),
    ]);
    const completedIds: string[] = completedRaw ? JSON.parse(completedRaw) : [];
    const dailyCompletedIds: string[] = dailyCompletedRaw ? JSON.parse(dailyCompletedRaw) : [];
    const inProgressIds = (allKeys ?? [])
      .filter((k) => k.startsWith(PROGRESS_KEY_PREFIX))
      .map((k) => k.replace(PROGRESS_KEY_PREFIX, ''));
    usePuzzleProgressStore.setState({
      completedPuzzleIds: new Set(completedIds),
      dailyCompletedPuzzleIds: new Set(dailyCompletedIds),
      inProgressPuzzleIds: new Set(inProgressIds),
    });
  } catch {}
}