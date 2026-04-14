import { Difficulty } from '../../types/core';
import { SUDOKU_DIFFICULTY_CONFIG, SudokuDigit, SudokuGeneratedPuzzle, SudokuGrid } from './types';
import { copyGrid, isValidPlacement, solve, hasUniqueSolution } from './solver';

// ─── Seeded pseudo-random number generator (Mulberry32) ───────────────────────

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Shuffle array in-place using seeded RNG ─────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Generate a complete valid 9×9 Sudoku grid ───────────────────────────────

function generateCompleteGrid(rng: () => number): SudokuGrid {
  const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));

  function fill(pos: number): boolean {
    if (pos === 81) return true;
    const row = Math.floor(pos / 9);
    const col = pos % 9;

    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9] as SudokuDigit[], rng);

    for (const digit of digits) {
      if (isValidPlacement(grid, row, col, digit)) {
        grid[row][col] = digit;
        if (fill(pos + 1)) return true;
        grid[row][col] = 0;
      }
    }
    return false;
  }

  fill(0);
  return grid;
}

// ─── Remove cells while preserving unique solution ───────────────────────────

function digHoles(
  completeGrid: SudokuGrid,
  targetGivens: number,
  rng: () => number
): SudokuGrid {
  const puzzle = copyGrid(completeGrid);

  // Build list of all 81 positions and shuffle
  const positions: Array<[number, number]> = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      positions.push([r, c]);
    }
  }
  shuffle(positions, rng);

  let givens = 81;

  for (const [row, col] of positions) {
    if (givens <= targetGivens) break;

    const backup = puzzle[row][col];
    puzzle[row][col] = 0;

    // Verify uniqueness after removal
    if (!hasUniqueSolution(puzzle)) {
      puzzle[row][col] = backup; // Restore — removal broke uniqueness
    } else {
      givens--;
    }
  }

  return puzzle;
}

// ─── Public generator ────────────────────────────────────────────────────────

export function generatePuzzle(
  difficulty: Difficulty,
  seed?: number
): SudokuGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);

  const config = SUDOKU_DIFFICULTY_CONFIG[difficulty];
  // Pick a target givens count within the allowed range
  const range = config.maxGivens - config.minGivens;
  const targetGivens = config.minGivens + Math.floor(rng() * (range + 1));

  const completeGrid = generateCompleteGrid(rng);
  const puzzleGrid = digHoles(completeGrid, targetGivens, rng);

  return {
    puzzleData: { grid: puzzleGrid, size: 9 },
    solution: { grid: completeGrid },
    difficulty,
    seed: actualSeed,
  };
}
