import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

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

// Reduced sizes: easy 5, medium 6, hard 7, expert 8
// Avoids exponential seeding time while still providing meaningful challenge.
export const NONOGRAM_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 5,
  [Difficulty.MEDIUM]: 6,
  [Difficulty.HARD]: 7,
  [Difficulty.EXPERT]: 8,
};

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

export function computeClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let count = 0;
  for (const cell of line) {
    if (cell) { count++; }
    else if (count > 0) { clues.push(count); count = 0; }
  }
  if (count > 0) clues.push(count);
  return clues.length > 0 ? clues : [0];
}

// O(n·k) leftmost/rightmost sweep — replaces exponential enumeration
function solveLineDefinite(
  clues: number[],
  known: (boolean | null)[],
  length: number
): (boolean | null)[] {
  if (clues[0] === 0) return Array(length).fill(false);
  const k = clues.length;

  // Leftmost placement
  const left: number[] = new Array(k).fill(0);
  {
    let pos = 0;
    for (let i = 0; i < k; i++) {
      while (pos < length) {
        let fits = true;
        for (let j = 0; j < clues[i]; j++) {
          if (pos + j >= length || known[pos + j] === false) { fits = false; break; }
        }
        if (fits && pos + clues[i] < length && known[pos + clues[i]] === true) fits = false;
        if (fits) break;
        pos++;
      }
      if (pos + clues[i] > length) return Array(length).fill(null);
      left[i] = pos;
      pos += clues[i] + 1;
    }
  }

  // Rightmost placement
  const right: number[] = new Array(k).fill(0);
  {
    let pos = length - 1;
    for (let i = k - 1; i >= 0; i--) {
      let start = pos - clues[i] + 1;
      while (start >= 0) {
        let fits = true;
        for (let j = 0; j < clues[i]; j++) {
          if (known[start + j] === false) { fits = false; break; }
        }
        if (fits && start - 1 >= 0 && known[start - 1] === true) fits = false;
        if (fits) break;
        start--;
      }
      if (start < 0) return Array(length).fill(null);
      right[i] = start;
      pos = start - 2;
    }
  }

  for (let i = 0; i < k; i++) {
    if (left[i] > right[i]) return Array(length).fill(null);
  }

  const result: (boolean | null)[] = Array(length).fill(null);
  for (let i = 0; i < k; i++) {
    for (let c = right[i]; c < left[i] + clues[i]; c++) result[c] = true;
  }
  for (let c = 0; c < length; c++) {
    if (result[c] !== null) continue;
    let inAny = false;
    for (let i = 0; i < k; i++) {
      if (c >= left[i] && c < right[i] + clues[i]) { inAny = true; break; }
    }
    if (!inAny) result[c] = false;
  }
  return result;
}

function tryPropagationOnly(
  rowClues: number[][],
  colClues: number[][],
  size: number
): 'solved' | 'contradiction' | 'incomplete' {
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r++) {
      const definite = solveLineDefinite(rowClues[r], grid[r], size);
      for (let c = 0; c < size; c++) {
        if (definite[c] !== null && grid[r][c] === null) { grid[r][c] = definite[c]; changed = true; }
        else if (definite[c] !== null && grid[r][c] !== definite[c]) return 'contradiction';
      }
    }
    for (let c = 0; c < size; c++) {
      const col = grid.map(row => row[c]);
      const definite = solveLineDefinite(colClues[c], col, size);
      for (let r = 0; r < size; r++) {
        if (definite[r] !== null && grid[r][c] === null) { grid[r][c] = definite[r]; changed = true; }
        else if (definite[r] !== null && grid[r][c] !== definite[r]) return 'contradiction';
      }
    }
  }
  return grid.every(row => row.every(c => c !== null)) ? 'solved' : 'incomplete';
}

function solveNonogram(rowClues: number[][], colClues: number[][], size: number, limit: number): boolean[][][] {
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const solutions: boolean[][][] = [];
  let nodes = 0;
  const NODE_BUDGET = 500000;

  function propagate(): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < size; r++) {
        const d = solveLineDefinite(rowClues[r], grid[r], size);
        for (let c = 0; c < size; c++) {
          if (d[c] !== null && grid[r][c] === null) { grid[r][c] = d[c]; changed = true; }
          else if (d[c] !== null && grid[r][c] !== d[c]) return false;
        }
      }
      for (let c = 0; c < size; c++) {
        const col = grid.map(row => row[c]);
        const d = solveLineDefinite(colClues[c], col, size);
        for (let r = 0; r < size; r++) {
          if (d[r] !== null && grid[r][c] === null) { grid[r][c] = d[r]; changed = true; }
          else if (d[r] !== null && grid[r][c] !== d[r]) return false;
        }
      }
    }
    return true;
  }

  function backtrack(): void {
    if (solutions.length >= limit || nodes > NODE_BUDGET) return;
    nodes++;
    if (!propagate()) return;
    let br = -1, bc = -1;
    outer: for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) { if (grid[r][c] === null) { br = r; bc = c; break outer; } }
    if (br === -1) { solutions.push(grid.map(row => [...row]) as boolean[][]); return; }
    for (const val of [true, false]) {
      const snap = grid.map(row => [...row]);
      grid[br][bc] = val;
      backtrack();
      for (let r = 0; r < size; r++) grid[r] = snap[r];
      if (solutions.length >= limit || nodes > NODE_BUDGET) return;
    }
  }

  backtrack();
  return solutions;
}

export function generatePuzzle(difficulty: Difficulty, seed?: number): NonogramGeneratedPuzzle {
  const size = NONOGRAM_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 200;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed = seed !== undefined ? seed + attempt * 1000003 : Math.floor(Math.random() * 2 ** 31);
    const rng = createRng(actualSeed);
    const fillProb = 0.4 + rng() * 0.2;
    const grid: boolean[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => rng() < fillProb)
    );
    const rowClues = grid.map(row => computeClues(row));
    const colClues = Array.from({ length: size }, (_, c) => computeClues(grid.map(row => row[c])));

    const propagationResult = tryPropagationOnly(rowClues, colClues, size);
    if (propagationResult === 'solved') {
      return { puzzleData: { size, rowClues, colClues }, solution: { grid }, difficulty, seed: actualSeed };
    }
    if (propagationResult === 'contradiction') continue;

    const solutions = solveNonogram(rowClues, colClues, size, 2);
    if (solutions.length === 1) {
      return { puzzleData: { size, rowClues, colClues }, solution: { grid }, difficulty, seed: actualSeed };
    }
  }

  throw new Error(`[NonogramEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`);
}

export function isRowClueComplete(board: NonogramCellState[], clues: number[]): boolean {
  const filled = board.map(c => c === 'filled');
  const computed = computeClues(filled);
  return JSON.stringify(computed) === JSON.stringify(clues);
}

export function isNonogramSolved(board: NonogramCellState[][], rowClues: number[][], colClues: number[][]): boolean {
  const size = board.length;
  for (let r = 0; r < size; r++) { if (!isRowClueComplete(board[r], rowClues[r])) return false; }
  for (let c = 0; c < size; c++) { const col = board.map(row => row[c]); if (!isRowClueComplete(col, colClues[c])) return false; }
  return true;
}

export function getHint(gameState: NonogramGameState, solution: NonogramSolution): NonogramHintResult | null {
  const { board } = gameState;
  const size = board.length;
  for (let r = 0; r < size; r++) {
    const rowComplete = board[r].every((cell, c) => (cell === 'filled') === solution.grid[r][c]);
    if (!rowComplete) {
      const newBoard = board.map((row, ri) =>
        ri === r ? row.map((_, c): NonogramCellState => solution.grid[r][c] ? 'filled' : 'marked') : [...row]
      );
      return { description: `Row ${r + 1} has been revealed.`, revealedState: { board: newBoard }, position: { row: r, col: 0 } };
    }
  }
  return null;
}