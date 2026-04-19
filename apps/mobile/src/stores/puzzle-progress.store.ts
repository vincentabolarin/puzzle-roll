import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameType, Difficulty } from '@puzzle-roll/shared';

const PROGRESS_KEY_PREFIX = 'puzzle_roll_progress_';
const COMPLETED_KEY = 'puzzle_roll_completed';

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
  inProgressPuzzleIds: Set<string>;
}

interface PuzzleProgressActions {
  saveProgress: (progress: SavedPuzzleProgress) => Promise<void>;
  loadProgress: (puzzleId: string) => Promise<SavedPuzzleProgress | null>;
  clearProgress: (puzzleId: string) => Promise<void>;
  markCompleted: (puzzleId: string) => Promise<void>;
  isCompleted: (puzzleId: string) => boolean;
  isInProgress: (puzzleId: string) => boolean;
  hydrateCompletedList: (puzzleIds: string[]) => void;
  hydrateInProgressList: (puzzleIds: string[]) => void;
}

export const usePuzzleProgressStore = create<PuzzleProgressState & PuzzleProgressActions>(
  (set, get) => ({
    completedPuzzleIds: new Set(),
    inProgressPuzzleIds: new Set(),

    saveProgress: async (progress) => {
      const key = `${PROGRESS_KEY_PREFIX}${progress.puzzleId}`;
      await AsyncStorage.setItem(key, JSON.stringify(progress));
      set((s) => ({
        inProgressPuzzleIds: new Set([...s.inProgressPuzzleIds, progress.puzzleId]),
      }));
    },

    loadProgress: async (puzzleId) => {
      const key = `${PROGRESS_KEY_PREFIX}${puzzleId}`;
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as SavedPuzzleProgress;
      } catch {
        return null;
      }
    },

    clearProgress: async (puzzleId) => {
      const key = `${PROGRESS_KEY_PREFIX}${puzzleId}`;
      await AsyncStorage.removeItem(key);
      set((s) => {
        const next = new Set(s.inProgressPuzzleIds);
        next.delete(puzzleId);
        return { inProgressPuzzleIds: next };
      });
    },

    markCompleted: async (puzzleId) => {
      // Clear in-progress state
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${puzzleId}`);

      // Add to completed set and persist
      const { completedPuzzleIds } = get();
      const updated = new Set([...completedPuzzleIds, puzzleId]);
      await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify([...updated]));

      set((s) => {
        const inProg = new Set(s.inProgressPuzzleIds);
        inProg.delete(puzzleId);
        return {
          completedPuzzleIds: updated,
          inProgressPuzzleIds: inProg,
        };
      });
    },

    isCompleted: (puzzleId) => get().completedPuzzleIds.has(puzzleId),
    isInProgress: (puzzleId) => get().inProgressPuzzleIds.has(puzzleId),

    hydrateCompletedList: (puzzleIds) => {
      set({ completedPuzzleIds: new Set(puzzleIds) });
    },

    hydrateInProgressList: (puzzleIds) => {
      set({ inProgressPuzzleIds: new Set(puzzleIds) });
    },
  })
);

/** Call once on app startup to load completed + in-progress puzzle IDs */
export async function hydratePuzzleProgress(): Promise<void> {
  try {
    const completedRaw = await AsyncStorage.getItem(COMPLETED_KEY);
    const completedIds: string[] = completedRaw ? JSON.parse(completedRaw) : [];

    // Scan AsyncStorage for in-progress keys
    const allKeys = await AsyncStorage.getAllKeys();
    const progressKeys = allKeys.filter((k) => k.startsWith(PROGRESS_KEY_PREFIX));
    const inProgressIds = progressKeys.map((k) => k.replace(PROGRESS_KEY_PREFIX, ''));

    usePuzzleProgressStore.getState().hydrateCompletedList(completedIds);
    usePuzzleProgressStore.getState().hydrateInProgressList(inProgressIds);
  } catch {
    // Non-fatal — app continues without progress state
  }
}