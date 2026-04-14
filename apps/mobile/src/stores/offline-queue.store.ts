import { create } from 'zustand';
import { GameType, Difficulty } from '@puzzle-roll/shared';

export interface QueuedCompletion {
  id: string;
  puzzleId: string;
  gameType: GameType;
  difficulty: Difficulty;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  elapsedSeconds: number;
  hintsUsed: number;
  completedAt: string;
  shareableResult: string | null;
  retryCount: number;
  createdAt: number;
}

interface OfflineQueueState {
  queue: QueuedCompletion[];
  isSyncing: boolean;
}

interface OfflineQueueActions {
  enqueue: (completion: Omit<QueuedCompletion, 'id' | 'retryCount' | 'createdAt'>) => void;
  dequeue: (id: string) => void;
  incrementRetry: (id: string) => void;
  setSyncing: (syncing: boolean) => void;
  clearQueue: () => void;
  getQueue: () => QueuedCompletion[];
}

export const useOfflineQueueStore = create<OfflineQueueState & OfflineQueueActions>((set, get) => ({
  queue: [],
  isSyncing: false,

  enqueue: (completion) => {
    const item: QueuedCompletion = {
      ...completion,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      retryCount: 0,
      createdAt: Date.now(),
    };
    set((s) => ({ queue: [...s.queue, item] }));
  },

  dequeue: (id) => {
    set((s) => ({ queue: s.queue.filter((item) => item.id !== id) }));
  },

  incrementRetry: (id) => {
    set((s) => ({
      queue: s.queue.map((item) =>
        item.id === id ? { ...item, retryCount: item.retryCount + 1 } : item
      ),
    }));
  },

  setSyncing: (syncing) => set({ isSyncing: syncing }),
  clearQueue: () => set({ queue: [] }),
  getQueue: () => get().queue,
}));
