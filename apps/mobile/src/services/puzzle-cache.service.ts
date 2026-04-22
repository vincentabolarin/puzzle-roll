import { Difficulty, GameType } from '@puzzle-roll/shared';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'puzzleroll.db';
const DB_VERSION = 1;

interface CachedPuzzle {
  id: string;
  gameType: string;
  difficulty: Difficulty;
  puzzleData: string; // JSON string
  cachedAt: number;
}

interface CachedDailyPuzzle {
  gameType: GameType;
  date: string;
  dailyPuzzleId: string;
  puzzleId: string;
  puzzleData: string; // JSON string
  validUntil: number; // timestamp
}

interface CachedCompletion {
  id: string;
  puzzleId: string;
  completedAt: string;
  gameType: GameType;
}

class PuzzleCacheService {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.createTables();
  }

  private async createTables(): Promise<void> {
    if (!this.db) return;
    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS puzzles (
        id TEXT PRIMARY KEY,
        game_type TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        puzzle_data TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_puzzles_game_diff
        ON puzzles(game_type, difficulty);

      CREATE TABLE IF NOT EXISTS daily_puzzles (
        game_type TEXT NOT NULL,
        date TEXT NOT NULL,
        daily_puzzle_id TEXT NOT NULL,
        puzzle_id TEXT NOT NULL,
        puzzle_data TEXT NOT NULL,
        valid_until INTEGER NOT NULL,
        PRIMARY KEY (game_type, date)
      );

      CREATE TABLE IF NOT EXISTS offline_queue (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS completed_puzzles (
        id TEXT PRIMARY KEY,
        puzzle_id TEXT NOT NULL UNIQUE,
        completed_at TEXT NOT NULL,
        game_type TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ─── Puzzles ──────────────────────────────────────────────────────────────

  async cachePuzzles(puzzles: Array<{ id: string; gameType: GameType; difficulty: Difficulty; puzzleData: unknown }>): Promise<void> {
    if (!this.db) return;
    const now = Date.now();

    await this.db.withTransactionAsync(async () => {
      for (const puzzle of puzzles) {
        await this.db!.runAsync(
          `INSERT OR REPLACE INTO puzzles (id, game_type, difficulty, puzzle_data, cached_at)
           VALUES (?, ?, ?, ?, ?)`,
          [puzzle.id, puzzle.gameType, puzzle.difficulty, JSON.stringify(puzzle.puzzleData), now]
        );
      }
    });
  }

  async getPuzzles(gameType: GameType, difficulty: Difficulty, limit = 20): Promise<CachedPuzzle[]> {
    if (!this.db) return [];
    const rows = await this.db.getAllAsync<{
      id: string;
      game_type: string;
      difficulty: Difficulty;
      puzzle_data: string;
      cached_at: number;
    }>(
      `SELECT id, game_type, difficulty, puzzle_data, cached_at
       FROM puzzles
       WHERE game_type = ? AND difficulty = ?
       ORDER BY cached_at DESC
       LIMIT ?`,
      [gameType, difficulty, limit]
    );

    return rows.map((r) => ({
      id: r.id,
      gameType: r.game_type,
      difficulty: r.difficulty,
      puzzleData: r.puzzle_data,
      cachedAt: r.cached_at,
    }));
  }

  async getPuzzleById(id: string): Promise<CachedPuzzle | null> {
    if (!this.db) return null;
    const row = await this.db.getFirstAsync<{
      id: string;
      game_type: GameType;
      difficulty: Difficulty;
      puzzle_data: string;
      cached_at: number;
    }>(`SELECT * FROM puzzles WHERE id = ?`, [id]);

    if (!row) return null;
    return {
      id: row.id,
      gameType: row.game_type,
      difficulty: row.difficulty,
      puzzleData: row.puzzle_data,
      cachedAt: row.cached_at,
    };
  }

  async hasPuzzles(): Promise<boolean> {
    if (!this.db) return false;
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM puzzles`
    );
    return (row?.count ?? 0) > 0;
  }

  // ─── Daily Puzzles ────────────────────────────────────────────────────────

  async cacheDailyPuzzle(params: {
    gameType: GameType;
    date: string;
    dailyPuzzleId: string;
    puzzleId: string;
    puzzleData: unknown;
  }): Promise<void> {
    if (!this.db) return;

    // valid until next midnight UTC
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    await this.db.runAsync(
      `INSERT OR REPLACE INTO daily_puzzles
         (game_type, date, daily_puzzle_id, puzzle_id, puzzle_data, valid_until)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.gameType,
        params.date,
        params.dailyPuzzleId,
        params.puzzleId,
        JSON.stringify(params.puzzleData),
        tomorrow.getTime(),
      ]
    );
  }

  async getDailyPuzzle(gameType: GameType, date: string): Promise<CachedDailyPuzzle | null> {
    if (!this.db) return null;
    const now = Date.now();
    const row = await this.db.getFirstAsync<{
      game_type: GameType;
      date: string;
      daily_puzzle_id: string;
      puzzle_id: string;
      puzzle_data: string;
      valid_until: number;
    }>(
      `SELECT * FROM daily_puzzles
       WHERE game_type = ? AND date = ? AND valid_until > ?`,
      [gameType, date, now]
    );

    if (!row) return null;
    return {
      gameType: row.game_type,
      date: row.date,
      dailyPuzzleId: row.daily_puzzle_id,
      puzzleId: row.puzzle_id,
      puzzleData: row.puzzle_data,
      validUntil: row.valid_until,
    };
  }

  // ─── Offline Queue ────────────────────────────────────────────────────────

  async enqueueCompletion(id: string, payload: unknown): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync(
      `INSERT OR IGNORE INTO offline_queue (id, payload, created_at) VALUES (?, ?, ?)`,
      [id, JSON.stringify(payload), Date.now()]
    );
  }

  async getQueuedCompletions(): Promise<Array<{ id: string; payload: unknown; retryCount: number }>> {
    if (!this.db) return [];
    const rows = await this.db.getAllAsync<{
      id: string;
      payload: string;
      retry_count: number;
    }>(`SELECT id, payload, retry_count FROM offline_queue ORDER BY created_at ASC`);

    return rows.map((r) => ({
      id: r.id,
      payload: JSON.parse(r.payload) as unknown,
      retryCount: r.retry_count,
    }));
  }

  async removeFromQueue(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync(`DELETE FROM offline_queue WHERE id = ?`, [id]);
  }

  async incrementQueueRetry(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync(
      `UPDATE offline_queue SET retry_count = retry_count + 1 WHERE id = ?`,
      [id]
    );
  }

  // ─── Completed Puzzles ────────────────────────────────────────────────────

  async markCompleted(puzzleId: string, gameType: string): Promise<void> {
    if (!this.db) return;
    const id = `${Date.now()}-${puzzleId}`;
    await this.db.runAsync(
      `INSERT OR IGNORE INTO completed_puzzles (id, puzzle_id, completed_at, game_type) VALUES (?, ?, ?, ?)`,
      [id, puzzleId, new Date().toISOString(), gameType]
    );
  }

  async isCompleted(puzzleId: string): Promise<boolean> {
    if (!this.db) return false;
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM completed_puzzles WHERE puzzle_id = ?`,
      [puzzleId]
    );
    return (row?.count ?? 0) > 0;
  }

  // ─── Meta ──────────────────────────────────────────────────────────────────

  async getMeta(key: string): Promise<string | null> {
    if (!this.db) return null;
    const row = await this.db.getFirstAsync<{ value: string }>(
      `SELECT value FROM meta WHERE key = ?`,
      [key]
    );
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync(
      `INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`,
      [key, value]
    );
  }

  async hasInitialSync(): Promise<boolean> {
    const value = await this.getMeta('initial_sync_complete');
    return value === 'true';
  }

  async markInitialSyncComplete(): Promise<void> {
    await this.setMeta('initial_sync_complete', 'true');
  }
}

export const puzzleCache = new PuzzleCacheService();
