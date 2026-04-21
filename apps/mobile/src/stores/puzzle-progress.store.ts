import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameType, Difficulty } from '@puzzle-roll/shared';

const PROGRESS_KEY_PREFIX = 'proll_progress_';
const COMPLETED_KEY = 'proll_completed';

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

    markCompleted: async (puzzleId) => {
      await AsyncStorage.removeItem(`${PROGRESS_KEY_PREFIX}${puzzleId}`);
      const { completedPuzzleIds } = get();
      const updated = new Set([...completedPuzzleIds, puzzleId]);
      try {
        await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify([...updated]));
      } catch {}
      set((s) => {
        const inProg = new Set(s.inProgressPuzzleIds);
        inProg.delete(puzzleId);
        return { completedPuzzleIds: updated, inProgressPuzzleIds: inProg };
      });
    },

    isCompleted: (puzzleId) => get().completedPuzzleIds.has(puzzleId),
    isInProgress: (puzzleId) =>
      !get().completedPuzzleIds.has(puzzleId) && get().inProgressPuzzleIds.has(puzzleId),
  })
);

export async function hydratePuzzleProgress(): Promise<void> {
  try {
    const [completedRaw, allKeys] = await Promise.all([
      AsyncStorage.getItem(COMPLETED_KEY),
      AsyncStorage.getAllKeys(),
    ]);
    const completedIds: string[] = completedRaw ? JSON.parse(completedRaw) : [];
    const inProgressIds = (allKeys ?? [])
      .filter((k) => k.startsWith(PROGRESS_KEY_PREFIX))
      .map((k) => k.replace(PROGRESS_KEY_PREFIX, ''));
    usePuzzleProgressStore.setState({
      completedPuzzleIds: new Set(completedIds),
      inProgressPuzzleIds: new Set(inProgressIds),
    });
  } catch {}
}