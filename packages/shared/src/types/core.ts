// ─── Game Types ───────────────────────────────────────────────────────────────

export enum GameType {
  SUDOKU = 'sudoku',
  QUEENS = 'queens',
  ZIP = 'zip',
  TANGO = 'tango',
  NONOGRAM = 'nonogram',
  MINESWEEPER = 'minesweeper',
  KAKURO = 'kakuro',
  LIGHT_UP = 'light_up',
  FUTOSHIKI = 'futoshiki',
  HITORI = 'hitori',
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXPERT = 'expert',
}

// ─── Puzzle Base ──────────────────────────────────────────────────────────────

export interface BasePuzzle {
  id: string;
  gameType: GameType;
  difficulty: Difficulty;
  isDaily: boolean;
  dailyDate: string | null; // ISO date string YYYY-MM-DD
  createdAt: string;
}

export interface GeneratedPuzzle<TPuzzleData, TSolution> {
  puzzleData: TPuzzleData;
  solution: TSolution;
  difficulty: Difficulty;
  seed: number;
}

// ─── Game Session ─────────────────────────────────────────────────────────────

export interface Move {
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface GameSession<TGameState> {
  puzzleId: string;
  gameType: GameType;
  difficulty: Difficulty;
  isDaily: boolean;
  startedAt: Date;
  completedAt: Date | null;
  moves: Move[];
  hintsUsed: number;
  hintsRemaining: number;
  elapsedSeconds: number;
  isPaused: boolean;
  isSolved: boolean;
  undoStack: TGameState[];
  currentState: TGameState;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  elapsedSeconds: number;
  hintsUsed: number;
  completedAt: string;
}

export interface DailyLeaderboard {
  gameType: GameType;
  date: string;
  entries: LeaderboardEntry[];
  userEntry: LeaderboardEntry | null;
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  deviceId: string | null;
  createdAt: string;
}

export interface UserStats {
  gameType: GameType;
  gamesPlayed: number;
  gamesCompleted: number;
  bestTime: number | null;
  currentStreak: number;
  longestStreak: number;
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export interface GameCompletion {
  puzzleId: string;
  gameType: GameType;
  difficulty: Difficulty;
  isDaily: boolean;
  elapsedSeconds: number;
  hintsUsed: number;
  completedAt: string;
  shareableResult: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationSettings {
  enabled: boolean;
  notificationHour: number;
  timezoneOffsetMinutes: number;
  pushToken: string | null;
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

export interface OfflineQueueItem {
  id: string;
  type: 'complete_puzzle' | 'sync_progress';
  payload: GameCompletion | GameCompletion[];
  createdAt: number;
  retryCount: number;
}

// ─── Game-specific Puzzle Data types ─────────────────────────────────────────

export type Grid<T> = T[][];

export interface CellPosition {
  row: number;
  col: number;
}

// ─── Hint Result ──────────────────────────────────────────────────────────────

export interface HintResult<T> {
  description: string;
  revealedState: Partial<T>;
  position?: CellPosition;
}
