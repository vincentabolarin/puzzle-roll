import { create } from 'zustand';
import { GameType, Difficulty } from '@puzzle-roll/shared';

export interface ActiveSession<TState = unknown> {
  puzzleId: string;
  gameType: GameType;
  difficulty: Difficulty;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  hintsUsed: number;
  hintsRemaining: number;
  elapsedSeconds: number;
  isPaused: boolean;
  isSolved: boolean;
  undoStack: TState[];
  currentState: TState;
}

interface GameSessionState {
  session: ActiveSession | null;
  timerInterval: ReturnType<typeof setInterval> | null;
}

interface GameSessionActions {
  startSession: <TState>(params: {
    puzzleId: string;
    gameType: GameType;
    difficulty: Difficulty;
    isDaily: boolean;
    dailyPuzzleId: string | null;
    initialState: TState;
    /** Restore elapsed time when resuming a saved session. Defaults to 0. */
    initialElapsedSeconds?: number;
    /** Restore hints state when resuming a saved session. */
    initialHintsUsed?: number;
    initialHintsRemaining?: number;
  }) => void;
  updateState: <TState>(newState: TState, pushToUndo?: boolean) => void;
  undo: () => void;
  useHint: () => boolean;
  markSolved: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  clearSession: () => void;
  getElapsed: () => number;
}

export const useGameSessionStore = create<GameSessionState & GameSessionActions>((set, get) => ({
  session: null,
  timerInterval: null,

  startSession: ({
    puzzleId, gameType, difficulty, isDaily, dailyPuzzleId, initialState,
    initialElapsedSeconds = 0,
    initialHintsUsed = 0,
    initialHintsRemaining = 3,
  }) => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);

    const interval = setInterval(() => {
      const { session } = get();
      if (!session || session.isPaused || session.isSolved) return;
      set((s) => ({
        session: s.session
          ? { ...s.session, elapsedSeconds: s.session.elapsedSeconds + 1 }
          : null,
      }));
    }, 1000);

    set({
      session: {
        puzzleId,
        gameType,
        difficulty,
        isDaily,
        dailyPuzzleId,
        startedAt: new Date(),
        completedAt: null,
        hintsUsed: initialHintsUsed,
        hintsRemaining: initialHintsRemaining,
        elapsedSeconds: initialElapsedSeconds,
        isPaused: false,
        isSolved: false,
        undoStack: [],
        currentState: initialState,
      },
      timerInterval: interval,
    });
  },

  updateState: (newState, pushToUndo = true) => {
    set((s) => {
      if (!s.session) return s;
      const undoStack = pushToUndo
        ? [...s.session.undoStack.slice(-19), s.session.currentState]
        : s.session.undoStack;
      return { session: { ...s.session, currentState: newState, undoStack } };
    });
  },

  undo: () => {
    set((s) => {
      if (!s.session || s.session.undoStack.length === 0) return s;
      const undoStack = [...s.session.undoStack];
      const previousState = undoStack.pop();
      return { session: { ...s.session, currentState: previousState, undoStack } };
    });
  },

  useHint: () => {
    const { session } = get();
    if (!session || session.hintsRemaining <= 0) return false;
    set((s) => ({
      session: s.session
        ? { ...s.session, hintsUsed: s.session.hintsUsed + 1, hintsRemaining: s.session.hintsRemaining - 1 }
        : null,
    }));
    return true;
  },

  markSolved: () => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);
    set((s) => ({
      session: s.session
        ? { ...s.session, isSolved: true, completedAt: new Date(), isPaused: true }
        : null,
      timerInterval: null,
    }));
  },

  pauseTimer: () => set((s) => ({ session: s.session ? { ...s.session, isPaused: true } : null })),
  resumeTimer: () => set((s) => ({ session: s.session ? { ...s.session, isPaused: false } : null })),

  clearSession: () => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);
    set({ session: null, timerInterval: null });
  },

  getElapsed: () => get().session?.elapsedSeconds ?? 0,
}));