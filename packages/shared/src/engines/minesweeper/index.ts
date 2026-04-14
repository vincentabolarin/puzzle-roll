import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MinesweeperCellState = 'hidden' | 'revealed' | 'flagged';

export interface MinesweeperCell {
  isMine: boolean;
  adjacentMines: number;
  state: MinesweeperCellState;
}

export interface MinesweeperConfig {
  rows: number;
  cols: number;
  mines: number;
}

export interface MinesweeperPuzzleData {
  config: MinesweeperConfig;
  // No pre-generated mine layout — mines are placed on first tap
}

export interface MinesweeperSolution {
  // Not applicable for minesweeper; any valid mine layout is a solution
  mineGrid: boolean[][];
}

export interface MinesweeperGameState {
  board: MinesweeperCell[][];
  minesPlaced: boolean;
  isGameOver: boolean;
  isWon: boolean;
  flagCount: number;
}

export type MinesweeperGeneratedPuzzle = GeneratedPuzzle<MinesweeperPuzzleData, MinesweeperSolution>;
export type MinesweeperHintResult = HintResult<MinesweeperGameState>;

export const MINESWEEPER_CONFIG: Record<Difficulty, MinesweeperConfig> = {
  [Difficulty.EASY]: { rows: 9, cols: 9, mines: 10 },
  [Difficulty.MEDIUM]: { rows: 16, cols: 16, mines: 40 },
  [Difficulty.HARD]: { rows: 16, cols: 30, mines: 99 },
  [Difficulty.EXPERT]: { rows: 20, cols: 24, mines: 130 },
};

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Generate puzzle metadata (no mines yet — placed on first tap) ────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): MinesweeperGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const config = MINESWEEPER_CONFIG[difficulty];

  return {
    puzzleData: { config },
    solution: { mineGrid: [] }, // populated on first tap
    difficulty,
    seed: actualSeed,
  };
}

// ─── Place mines on first tap, guaranteeing safe first cell + neighbours ──────

export function placeMines(
  config: MinesweeperConfig,
  safeRow: number,
  safeCol: number,
  seed: number
): boolean[][] {
  const { rows, cols, mines } = config;
  const rng = createRng(seed);

  // Safe zone: the tapped cell and all 8 neighbours
  const safeZone = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeRow + dr;
      const c = safeCol + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        safeZone.add(`${r},${c}`);
      }
    }
  }

  const available: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeZone.has(`${r},${c}`)) available.push([r, c]);
    }
  }

  // Fisher-Yates shuffle of available positions
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  const mineGrid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (let i = 0; i < mines && i < available.length; i++) {
    const [r, c] = available[i];
    mineGrid[r][c] = true;
  }

  return mineGrid;
}

// ─── Build initial game board ─────────────────────────────────────────────────

export function buildInitialBoard(config: MinesweeperConfig): MinesweeperCell[][] {
  return Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, (): MinesweeperCell => ({
      isMine: false,
      adjacentMines: 0,
      state: 'hidden',
    }))
  );
}

// ─── Apply mines to board, compute adjacency counts ──────────────────────────

export function applyMinesToBoard(
  board: MinesweeperCell[][],
  mineGrid: boolean[][]
): MinesweeperCell[][] {
  const rows = board.length;
  const cols = board[0].length;
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      newBoard[r][c].isMine = mineGrid[r][c];
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!newBoard[r][c].isMine) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mineGrid[nr][nc]) {
              count++;
            }
          }
        }
        newBoard[r][c].adjacentMines = count;
      }
    }
  }

  return newBoard;
}

// ─── Flood reveal empty cells (BFS) ─────────────────────────────────────────

export function floodReveal(
  board: MinesweeperCell[][],
  row: number,
  col: number
): MinesweeperCell[][] {
  const rows = board.length;
  const cols = board[0].length;
  const newBoard = board.map(r => r.map(cell => ({ ...cell })));

  const queue: Array<[number, number]> = [[row, col]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (newBoard[r][c].state === 'flagged') continue;
    newBoard[r][c].state = 'revealed';

    if (newBoard[r][c].adjacentMines === 0 && !newBoard[r][c].isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
              newBoard[nr][nc].state === 'hidden' &&
              !visited.has(`${nr},${nc}`)) {
            queue.push([nr, nc]);
          }
        }
      }
    }
  }

  return newBoard;
}

// ─── Check win condition ──────────────────────────────────────────────────────

export function checkWin(board: MinesweeperCell[][]): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && cell.state !== 'revealed') return false;
    }
  }
  return true;
}

// ─── Hint: safely reveal one hidden non-mine cell ────────────────────────────

export function getHint(gameState: MinesweeperGameState): MinesweeperHintResult | null {
  const { board } = gameState;
  if (!gameState.minesPlaced) return null;

  const candidates: Array<[number, number]> = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c].state === 'hidden' && !board[r][c].isMine) {
        candidates.push([r, c]);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Prefer cells adjacent to already-revealed cells
  const preferred = candidates.filter(([r, c]) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) {
          if (board[nr][nc].state === 'revealed') return true;
        }
      }
    }
    return false;
  });

  const [hr, hc] = (preferred.length > 0 ? preferred : candidates)[0];
  const newBoard = floodReveal(board, hr, hc);

  return {
    description: `Cell (${hr + 1}, ${hc + 1}) is safe.`,
    revealedState: {
      board: newBoard,
      minesPlaced: gameState.minesPlaced,
      isGameOver: false,
      isWon: checkWin(newBoard),
      flagCount: gameState.flagCount,
    },
    position: { row: hr, col: hc },
  };
}
