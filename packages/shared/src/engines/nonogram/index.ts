import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NonogramCellState = 'empty' | 'filled' | 'marked';

export interface NonogramPuzzleData {
  size: number;
  rowClues: number[][];
  colClues: number[][];
}

export interface NonogramSolution {
  grid: boolean[][];
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

// ─── Fast line solver using leftmost/rightmost sweep — O(n * k) ──────────────
// Returns an array of true (definitely filled), false (definitely empty), null (unknown).
// This replaces the exponential enumeration approach entirely.

function solveLineDefinite(
  clues: number[],
  known: (boolean | null)[],
  length: number
): (boolean | null)[] {
  if (clues[0] === 0) {
    // All cells must be empty
    return Array(length).fill(false);
  }

  const k = clues.length;

  // ── Leftmost valid placement ──────────────────────────────────────────────
  // left[i] = leftmost start position of block i
  const left: number[] = new Array(k).fill(0);

  // Forward pass: place each block as far left as possible
  {
    let pos = 0;
    for (let i = 0; i < k; i++) {
      // Advance past known-empty cells that would prevent placement
      while (pos < length) {
        let fits = true;
        // Check the block fits and doesn't overlap known-empty cells
        for (let j = 0; j < clues[i]; j++) {
          if (pos + j >= length || known[pos + j] === false) {
            fits = false;
            break;
          }
        }
        // The cell immediately after the block (if exists) must not be known-filled
        const after = pos + clues[i];
        if (fits && after < length && known[after] === true) fits = false;

        if (fits) break;
        pos++;
      }
      if (pos + clues[i] > length) return Array(length).fill(null); // no valid placement
      left[i] = pos;
      pos += clues[i] + 1;
    }
  }

  // ── Rightmost valid placement ─────────────────────────────────────────────
  const right: number[] = new Array(k).fill(0);

  {
    let pos = length - 1;
    for (let i = k - 1; i >= 0; i--) {
      // Find rightmost start where block fits
      let start = pos - clues[i] + 1;
      while (start >= 0) {
        let fits = true;
        for (let j = 0; j < clues[i]; j++) {
          if (known[start + j] === false) { fits = false; break; }
        }
        const before = start - 1;
        if (fits && before >= 0 && known[before] === true) fits = false;

        if (fits) break;
        start--;
      }
      if (start < 0) return Array(length).fill(null);
      right[i] = start;
      pos = start - 2; // leave gap
    }
  }

  // ── Validate: leftmost must be ≤ rightmost for each block ─────────────────
  for (let i = 0; i < k; i++) {
    if (left[i] > right[i]) return Array(length).fill(null);
  }

  // ── Build result: overlap of leftmost/rightmost = definitely filled ────────
  const result: (boolean | null)[] = Array(length).fill(null);

  // Mark definite fills (overlap regions)
  for (let i = 0; i < k; i++) {
    // Overlap: from right[i] to left[i] + clues[i] - 1
    for (let c = right[i]; c < left[i] + clues[i]; c++) {
      result[c] = true;
    }
  }

  // Mark definite empties: cells that cannot belong to any block
  // A cell is definitely empty if it falls in no block's range [left[i], right[i]+clues[i]-1]
  for (let c = 0; c < length; c++) {
    if (result[c] !== null) continue;
    let inAnyBlock = false;
    for (let i = 0; i < k; i++) {
      if (c >= left[i] && c < right[i] + clues[i]) {
        inAnyBlock = true;
        break;
      }
    }
    if (!inAnyBlock) result[c] = false;
  }

  return result;
}

// ─── Full nonogram solver: constraint propagation + bounded backtracking ──────

function solveNonogram(
  rowClues: number[][],
  colClues: number[][],
  size: number,
  limit: number
): boolean[][][] {
  const grid: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );
  const solutions: boolean[][][] = [];
  let nodes = 0;
  // Per-difficulty node budget: 5×5 is trivial, 20×20 needs more headroom
  const NODE_BUDGET = size <= 5 ? 1000 : size <= 10 ? 50000 : size <= 15 ? 500000 : 2000000;

  function propagate(): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < size; r++) {
        const definite = solveLineDefinite(rowClues[r], grid[r], size);
        for (let c = 0; c < size; c++) {
          if (definite[c] !== null && grid[r][c] === null) {
            grid[r][c] = definite[c];
            changed = true;
          } else if (definite[c] !== null && grid[r][c] !== definite[c]) {
            return false;
          }
        }
      }
      for (let c = 0; c < size; c++) {
        const col = grid.map((row) => row[c]);
        const definite = solveLineDefinite(colClues[c], col, size);
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
    if (solutions.length >= limit || nodes > NODE_BUDGET) return;
    nodes++;

    if (!propagate()) return;

    // Find unknown cell with most constraints (MCV heuristic)
    let br = -1, bc = -1, bestConstraint = -1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === null) {
          // Score by how many definite neighbors exist
          const score =
            (grid[r][c - 1] !== null ? 1 : 0) +
            (grid[r][c + 1] !== null ? 1 : 0) +
            (r > 0 && grid[r - 1][c] !== null ? 1 : 0) +
            (r < size - 1 && grid[r + 1][c] !== null ? 1 : 0);
          if (score > bestConstraint) {
            bestConstraint = score;
            br = r;
            bc = c;
          }
        }
      }
    }

    if (br === -1) {
      solutions.push(grid.map((row) => [...row]) as boolean[][]);
      return;
    }

    for (const val of [true, false]) {
      const snapshot = grid.map((row) => [...row]);
      grid[br][bc] = val;
      backtrack();
      for (let r = 0; r < size; r++) grid[r] = snapshot[r];
      if (solutions.length >= limit || nodes > NODE_BUDGET) return;
    }
  }

  backtrack();
  return solutions;
}

// ─── Generator ────────────────────────────────────────────────────────────────
// Strategy: generate a random grid, compute clues, check if constraint propagation
// alone (no backtracking) can fully solve it. If yes → provably unique by construction.
// This is much faster than running a full backtracking uniqueness check.

export function generatePuzzle(difficulty: Difficulty, seed?: number): NonogramGeneratedPuzzle {
  const size = NONOGRAM_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 200;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined
        ? seed + attempt * 1000003
        : Math.floor(Math.random() * 2 ** 31);

    const rng = createRng(actualSeed);

    // Generate random binary grid; vary fill density slightly for interest
    const fillProb = 0.4 + rng() * 0.2; // 40–60% filled
    const grid: boolean[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => rng() < fillProb)
    );

    const rowClues = grid.map((row) => computeClues(row));
    const colClues = Array.from({ length: size }, (_, c) =>
      computeClues(grid.map((row) => row[c]))
    );

    // Fast check: try constraint propagation alone (no backtracking)
    // If it fully solves → unique. This is O(n² * k) and very fast.
    const propagationResult = tryPropagationOnly(rowClues, colClues, size);

    if (propagationResult === 'solved') {
      // Propagation fully determined the grid — unique solution guaranteed
      return { puzzleData: { size, rowClues, colClues }, solution: { grid }, difficulty, seed: actualSeed };
    }

    if (propagationResult === 'contradiction') continue;

    // Propagation left unknowns — run bounded full solver to check uniqueness
    const solutions = solveNonogram(rowClues, colClues, size, 2);
    if (solutions.length === 1) {
      return { puzzleData: { size, rowClues, colClues }, solution: { grid }, difficulty, seed: actualSeed };
    }
  }

  throw new Error(`[NonogramEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`);
}

// ─── Propagation-only check (no backtracking) ─────────────────────────────────

function tryPropagationOnly(
  rowClues: number[][],
  colClues: number[][],
  size: number
): 'solved' | 'contradiction' | 'incomplete' {
  const grid: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  let changed = true;
  while (changed) {
    changed = false;

    for (let r = 0; r < size; r++) {
      const definite = solveLineDefinite(rowClues[r], grid[r], size);
      for (let c = 0; c < size; c++) {
        if (definite[c] !== null && grid[r][c] === null) {
          grid[r][c] = definite[c];
          changed = true;
        } else if (definite[c] !== null && grid[r][c] !== definite[c]) {
          return 'contradiction';
        }
      }
    }

    for (let c = 0; c < size; c++) {
      const col = grid.map((row) => row[c]);
      const definite = solveLineDefinite(colClues[c], col, size);
      for (let r = 0; r < size; r++) {
        if (definite[r] !== null && grid[r][c] === null) {
          grid[r][c] = definite[r];
          changed = true;
        } else if (definite[r] !== null && grid[r][c] !== definite[r]) {
          return 'contradiction';
        }
      }
    }
  }

  const allDetermined = grid.every((row) => row.every((cell) => cell !== null));
  return allDetermined ? 'solved' : 'incomplete';
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function isRowClueComplete(board: NonogramCellState[], clues: number[]): boolean {
  const filled = board.map((c) => c === 'filled');
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
    const col = board.map((row) => row[c]);
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

  for (let r = 0; r < size; r++) {
    const rowComplete = board[r].every(
      (cell, c) => (cell === 'filled') === solution.grid[r][c]
    );
    if (!rowComplete) {
      const newBoard = board.map((row, ri) =>
        ri === r
          ? row.map((_, c): NonogramCellState => (solution.grid[r][c] ? 'filled' : 'marked'))
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