/**
 * usePuzzleSolution — shared hook for fetching and caching puzzle solutions.
 *
 * Checks SQLite cache first → falls back to API → writes result to cache.
 * This makes hints work fully offline after the first successful fetch,
 * and means the JWT requirement on the solution endpoint is satisfied by
 * the anonymous JWT all users have (including guests).
 */
import { useCallback, useRef } from 'react';
import { apiClient } from '../lib/api-client';
import { puzzleCache } from '../services/puzzle-cache.service';

export function usePuzzleSolution<T = unknown>(puzzleId: string) {
  const cached = useRef<T | null>(null);

  const loadSolution = useCallback(async (): Promise<T | null> => {
    // 1. In-memory cache (fastest — same session)
    if (cached.current) return cached.current;

    // 2. SQLite cache (works offline after first fetch)
    try {
      const fromSQLite = await puzzleCache.getSolution(puzzleId) as T | null;
      if (fromSQLite) {
        cached.current = fromSQLite;
        return fromSQLite;
      }
    } catch {}

    // 3. Network fetch
    try {
      const r = await apiClient.get<{ id: string; solution: T }>(`/puzzles/id/${puzzleId}/solution`);
      if (r.solution) {
        cached.current = r.solution;
        // Cache in SQLite for future offline use — fire and forget
        puzzleCache.cacheSolution(puzzleId, r.solution).catch(() => {});
        return r.solution;
      }
    } catch {}

    return null;
  }, [puzzleId]);

  return { loadSolution };
}