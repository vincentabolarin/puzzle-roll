import { apiClient } from '../lib/api-client';
import { puzzleCache } from './puzzle-cache.service';
import { useOfflineQueueStore } from '../stores/offline-queue.store';
import { GameType, Difficulty } from '@puzzle-roll/shared';

const GAME_TYPES = Object.values(GameType);
const DIFFICULTIES = Object.values(Difficulty);
const MAX_RETRY = 3;

class SyncService {
  private isFlushing = false;

  // ─── Initial puzzle download (first launch) ────────────────────────────────

  async performInitialSync(onProgress?: (pct: number) => void): Promise<void> {
    const total = GAME_TYPES.length * DIFFICULTIES.length;
    let done = 0;

    for (const gameType of GAME_TYPES) {
      for (const difficulty of DIFFICULTIES) {
        try {
          const result = await apiClient.get<{
            data: Array<{ id: string; gameType: GameType; difficulty: Difficulty; puzzleData: unknown }>;
          }>(`/puzzles/${gameType}?difficulty=${difficulty}&limit=20&page=1`);

          const puzzles = Array.isArray(result)
            ? result
            : (result as { data: unknown[] }).data ?? [];

          await puzzleCache.cachePuzzles(
            (puzzles as Array<{ id: string; gameType: GameType; difficulty: Difficulty; puzzleData: unknown }>).map((p) => ({
              id: p.id,
              gameType: p.gameType ?? gameType,
              difficulty: p.difficulty ?? difficulty,
              puzzleData: p.puzzleData,
            }))
          );
        } catch {
          // Continue — partial sync is better than none
        }

        done++;
        onProgress?.(Math.round((done / total) * 100));
      }
    }

    await puzzleCache.markInitialSyncComplete();
  }

  // ─── Daily puzzle fetch and cache ─────────────────────────────────────────

  async fetchAndCacheDailyPuzzles(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    await Promise.allSettled(
      GAME_TYPES.map(async (gameType) => {
        try {
          const result = await apiClient.get<{
            dailyPuzzleId: string;
            date: string;
            gameType: string;
            puzzle: { id: string; puzzleData: unknown };
          }>(`/puzzles/${gameType}/daily`);

          await puzzleCache.cacheDailyPuzzle({
            gameType,
            date: today,
            dailyPuzzleId: result.dailyPuzzleId,
            puzzleId: result.puzzle.id,
            puzzleData: result.puzzle.puzzleData,
          });
        } catch {
          // Silently fall back to cached version
        }
      })
    );
  }

  // ─── Offline queue flush ──────────────────────────────────────────────────

  async flushOfflineQueue(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    const { queue, dequeue, incrementRetry } = useOfflineQueueStore.getState();
    if (queue.length === 0) {
      this.isFlushing = false;
      return;
    }

    const payload = queue.filter((item) => item.retryCount < MAX_RETRY);
    if (payload.length === 0) {
      this.isFlushing = false;
      return;
    }

    try {
      const completions = payload.map((item) => ({
        puzzleId: item.puzzleId,
        gameType: item.gameType,
        difficulty: item.difficulty,
        isDaily: item.isDaily,
        dailyPuzzleId: item.dailyPuzzleId ?? undefined,
        elapsedSeconds: item.elapsedSeconds,
        hintsUsed: item.hintsUsed,
        completedAt: item.completedAt,
        shareableResult: item.shareableResult ?? undefined,
      }));

      await apiClient.post('/progress/sync', { completions });

      // Remove successfully synced items
      for (const item of payload) {
        dequeue(item.id);
        await puzzleCache.removeFromQueue(item.id);
      }
    } catch {
      // Increment retry count for all failed items
      for (const item of payload) {
        incrementRetry(item.id);
        await puzzleCache.incrementQueueRetry(item.id);
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

export const syncService = new SyncService();
