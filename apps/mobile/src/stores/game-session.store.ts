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
  /** Integer tick count — kept for display only, incremented every second */
  elapsedSeconds: number;
  /** Accumulated elapsed seconds from previous play segments (before current resume) */
  accumulatedSeconds: number;
  /** Wall-clock timestamp of when the current active segment started (null if paused) */
  segmentStartMs: number | null;
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
    initialElapsedSeconds?: number;
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
  /** Returns real elapsed seconds computed from wall clock — use this for submission */
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
        accumulatedSeconds: initialElapsedSeconds,
        segmentStartMs: Date.now(),
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
    const { timerInterval, session } = get();
    if (timerInterval) clearInterval(timerInterval);
    // Freeze elapsed at real wall-clock time
    const realElapsed = session ? get().getElapsed() : 0;
    set((s) => ({
      session: s.session
        ? {
            ...s.session,
            isSolved: true,
            completedAt: new Date(),
            isPaused: true,
            segmentStartMs: null,
            elapsedSeconds: realElapsed,
            accumulatedSeconds: realElapsed,
          }
        : null,
      timerInterval: null,
    }));
  },

  pauseTimer: () => {
    const { session } = get();
    if (!session || session.isPaused || session.isSolved) return;
    const now = Date.now();
    const segmentSeconds = session.segmentStartMs != null
      ? Math.floor((now - session.segmentStartMs) / 1000)
      : 0;
    const newAccumulated = session.accumulatedSeconds + segmentSeconds;
    set((s) => ({
      session: s.session
        ? {
            ...s.session,
            isPaused: true,
            segmentStartMs: null,
            accumulatedSeconds: newAccumulated,
            elapsedSeconds: newAccumulated,
          }
        : null,
    }));
  },

  resumeTimer: () => {
    set((s) => ({
      session: s.session
        ? { ...s.session, isPaused: false, segmentStartMs: Date.now() }
        : null,
    }));
  },

  clearSession: () => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);
    set({ session: null, timerInterval: null });
  },

  getElapsed: () => {
    const { session } = get();
    if (!session) return 0;
    if (session.isPaused || session.isSolved || session.segmentStartMs == null) {
      return session.accumulatedSeconds;
    }
    const segmentSeconds = Math.floor((Date.now() - session.segmentStartMs) / 1000);
    return session.accumulatedSeconds + segmentSeconds;
  },
}));