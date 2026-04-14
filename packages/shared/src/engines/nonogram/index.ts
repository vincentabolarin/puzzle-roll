import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NonogramCellState = 'empty' | 'filled' | 'marked'; // marked = known empty (X)

export interface NonogramPuzzleData {
  size: number;
  rowClues: number[][];
  colClues: number[][];
}

export interface NonogramSolution {
  grid: boolean[][]; // true = filled
}

export interface NonogramGameState {
  board: NonogramCellState[][];
}

export type NonogramGeneratedPuzzle = GeneratedPuzzle<NonogramPuzzleData, NonogramSolution>;
export type NonogramHintResult = HintResult<NonogramGameState>;

export const NONOGRAM_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 5,
  [Difficulty.MEDIUM]: 10,
  [Difficulty.HARD]: 15,
  [Difficulty.EXPERT]: 20,
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

// ─── Compute clues from a binary row/column ───────────────────────────────────

export function computeClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let count = 0;
  for (const cell of line) {
    if (cell) {
      count++;
    } else if (count > 0) {
      clues.push(count);
      count = 0;
    }
  }
  if (count > 0) clues.push(count);
  return clues.length > 0 ? clues : [0];
}

// ─── Nonogram line solver (constraint propagation) ────────────────────────────

function getLineSolutions(clues: number[], length: number): boolean[][] {
  const results: boolean[][] = [];

  function place(clueIdx: number, pos: number, current: boolean[]): void {
    if (clueIdx === clues.length) {
      if (clues[0] === 0) { results.push([...current]); return; }
      const filled = [...current];
      while (filled.length < length) filled.push(false);
      results.push(filled);
      return;
    }
    const clue = clues[clueIdx];
    const remaining = clues.slice(clueIdx + 1).reduce((a, b) => a + b, 0) + (clues.length - clueIdx - 1);
    const maxStart = length - remaining - clue;

    for (let start = pos; start <= maxStart; start++) {
      const line = [...current];
      // Fill empty up to start
      while (line.length < start) line.push(false);
      // Fill clue
      for (let i = 0; i < clue; i++) line.push(true);
      // Gap after (if not last clue)
      if (clueIdx < clues.length - 1) line.push(false);
      place(clueIdx + 1, line.length, line);
    }
  }

  if (clues[0] === 0) {
    results.push(Array(length).fill(false));
  } else {
    place(0, 0, []);
  }
  return results;
}

// ─── Determine definite cells via constraint propagation ─────────────────────

function solveLineDefinite(clues: number[], length: number): (boolean | null)[] {
  const solutions = getLineSolutions(clues, length);
  if (solutions.length === 0) return Array(length).fill(null);

  return Array.from({ length }, (_, i) => {
    const allTrue = solutions.every(s => s[i] === true);
    const allFalse = solutions.every(s => s[i] === false);
    if (allTrue) return true;
    if (allFalse) return false;
    return null;
  });
}

// ─── Full nonogram solver (constraint propagation + backtracking) ─────────────

function solveNonogram(
  rowClues: number[][],
  colClues: number[][],
  size: number,
  limit: number
): boolean[][][] {
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const solutions: boolean[][][] = [];

  function propagate(): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < size; r++) {
        const line = grid[r].map(v => v);
        const clues = rowClues[r];
        const definite = solveLineDefinite(clues, size);
        for (let c = 0; c < size; c++) {
          if (definite[c] !== null && grid[r][c] === null) {
            grid[r][c] = definite[c];
            changed = true;
          } else if (definite[c] !== null && grid[r][c] !== definite[c]) {
            return false; // contradiction
          }
        }
      }
      for (let c = 0; c < size; c++) {
        const col = grid.map(row => row[c]);
        const clues = colClues[c];
        const definite = solveLineDefinite(clues, size);
        for (let r = 0; r < size; r++) {
          if (definite[r] !== null && grid[r][c] === null) {
            grid[r][c] = definite[r];
            changed = true;
          } else if (definite[r] !== null && grid[r][c] !== definite[r]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function backtrack(): void {
    if (solutions.length >= limit) return;
    if (!propagate()) return;

    // Find first unknown cell
    let br = -1, bc = -1;
    outer: for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === null) { br = r; bc = c; break outer; }
      }
    }

    if (br === -1) {
      // Check all clues satisfied
      const result = grid as boolean[][];
      solutions.push(result.map(row => [...row]));
      return;
    }

    for (const val of [true, false]) {
      const snapshot = grid.map(row => [...row]);
      grid[br][bc] = val;
      backtrack();
      for (let r = 0; r < size; r++) grid[r] = snapshot[r];
      if (solutions.length >= limit) return;
    }
  }

  backtrack();
  return solutions;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): NonogramGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const size = NONOGRAM_SIZE_CONFIG[difficulty];

  // Generate random binary grid with ~50% fill
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rng() > 0.45)
  );

  const rowClues = grid.map(row => computeClues(row));
  const colClues = Array.from({ length: size }, (_, c) =>
    computeClues(grid.map(row => row[c]))
  );

  // Verify unique solution (use limit=2 for efficiency)
  const solutions = solveNonogram(rowClues, colClues, size, 2);
  if (solutions.length !== 1) {
    return generatePuzzle(difficulty, actualSeed + 1);
  }

  return {
    puzzleData: { size, rowClues, colClues },
    solution: { grid },
    difficulty,
    seed: actualSeed,
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function isRowClueComplete(board: NonogramCellState[], clues: number[]): boolean {
  const filled = board.map(c => c === 'filled');
  const computed = computeClues(filled);
  return JSON.stringify(computed) === JSON.stringify(clues);
}

export function isNonogramSolved(
  board: NonogramCellState[][],
  rowClues: number[][],
  colClues: number[][]
): boolean {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    if (!isRowClueComplete(board[r], rowClues[r])) return false;
  }
  for (let c = 0; c < size; c++) {
    const col = board.map(row => row[c]);
    if (!isRowClueComplete(col, colClues[c])) return false;
  }
  return true;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: NonogramGameState,
  solution: NonogramSolution
): NonogramHintResult | null {
  const { board } = gameState;
  const size = board.length;

  // Find first row or column that is incomplete and reveal it
  for (let r = 0; r < size; r++) {
    const rowComplete = board[r].every((cell, c) =>
      (cell === 'filled') === solution.grid[r][c]
    );
    if (!rowComplete) {
      const newBoard = board.map((row, ri) =>
        ri === r
          ? row.map((_, c): NonogramCellState => solution.grid[r][c] ? 'filled' : 'marked')
          : [...row]
      );
      return {
        description: `Row ${r + 1} has been revealed.`,
        revealedState: { board: newBoard },
        position: { row: r, col: 0 },
      };
    }
  }
  return null;
}
