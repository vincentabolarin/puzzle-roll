import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FutoshikiDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type InequalityDir = '<' | '>';

export interface FutoshikiConstraint {
  row1: number;
  col1: number;
  row2: number;
  col2: number;
  direction: InequalityDir;
}

export interface FutoshikiPuzzleData {
  size: number;
  given: number[][];
  constraints: FutoshikiConstraint[];
}

export interface FutoshikiSolution {
  grid: number[][];
}

export interface FutoshikiGameState {
  board: number[][];
  selectedCell: { row: number; col: number } | null;
}

export type FutoshikiGeneratedPuzzle = GeneratedPuzzle<FutoshikiPuzzleData, FutoshikiSolution>;
export type FutoshikiHintResult = HintResult<FutoshikiGameState>;

export const FUTOSHIKI_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 4,
  [Difficulty.MEDIUM]: 5,
  [Difficulty.HARD]: 6,
  [Difficulty.EXPERT]: 7,
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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Generate a complete Latin square ────────────────────────────────────────

function generateLatinSquare(size: number, rng: () => number): number[][] {
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));

  function canPlace(r: number, c: number, val: number): boolean {
    for (let i = 0; i < size; i++) {
      if (grid[r][i] === val || grid[i][c] === val) return false;
    }
    return true;
  }

  function backtrack(pos: number): boolean {
    if (pos === size * size) return true;
    const r = Math.floor(pos / size);
    const c = pos % size;
    const digits = shuffle(
      Array.from({ length: size }, (_, i) => i + 1),
      rng
    );
    for (const d of digits) {
      if (canPlace(r, c, d)) {
        grid[r][c] = d;
        if (backtrack(pos + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  backtrack(0);
  return grid;
}

// ─── Count solutions up to `limit` (bounded) ─────────────────────────────────
// Uses a node budget to guarantee termination on all grid sizes.

function countFutoshikiSolutions(
  size: number,
  given: number[][],
  constraints: FutoshikiConstraint[],
  limit: number
): number {
  const grid = given.map((r) => [...r]);

  // Build fast constraint lookup: for each cell, which constraints apply?
  const cellConstraints = new Map<string, FutoshikiConstraint[]>();
  for (const con of constraints) {
    const k1 = `${con.row1},${con.col1}`;
    const k2 = `${con.row2},${con.col2}`;
    if (!cellConstraints.has(k1)) cellConstraints.set(k1, []);
    if (!cellConstraints.has(k2)) cellConstraints.set(k2, []);
    cellConstraints.get(k1)!.push(con);
    cellConstraints.get(k2)!.push(con);
  }

  function canPlace(r: number, c: number, val: number): boolean {
    // Latin square
    for (let i = 0; i < size; i++) {
      if (i !== c && grid[r][i] === val) return false;
      if (i !== r && grid[i][c] === val) return false;
    }
    // Inequality constraints touching this cell
    const key = `${r},${c}`;
    for (const con of cellConstraints.get(key) ?? []) {
      const { row1, col1, row2, col2, direction } = con;
      const isFirst = row1 === r && col1 === c;
      const otherVal = isFirst ? grid[row2][col2] : grid[row1][col1];
      if (otherVal === 0) continue; // other cell not yet placed
      const a = isFirst ? val : otherVal;
      const b = isFirst ? otherVal : val;
      if (direction === '<' && !(a < b)) return false;
      if (direction === '>' && !(a > b)) return false;
    }
    return true;
  }

  let count = 0;
  let nodes = 0;
  const NODE_BUDGET = size <= 4 ? 2000 : size <= 5 ? 10000 : size <= 6 ? 50000 : 150000;

  function backtrack(pos: number): void {
    if (count >= limit || nodes > NODE_BUDGET) return;
    nodes++;
    if (pos === size * size) {
      count++;
      return;
    }
    const r = Math.floor(pos / size);
    const c = pos % size;
    if (grid[r][c] !== 0) {
      backtrack(pos + 1);
      return;
    }
    for (let d = 1; d <= size; d++) {
      if (canPlace(r, c, d)) {
        grid[r][c] = d;
        backtrack(pos + 1);
        grid[r][c] = 0;
        if (count >= limit || nodes > NODE_BUDGET) return;
      }
    }
  }

  backtrack(0);
  return count;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(
  difficulty: Difficulty,
  seed?: number
): FutoshikiGeneratedPuzzle {
  const size = FUTOSHIKI_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 100;

  // How many cells to keep revealed per difficulty
  const revealRate: Record<Difficulty, number> = {
    [Difficulty.EASY]: 0.55,
    [Difficulty.MEDIUM]: 0.40,
    [Difficulty.HARD]: 0.25,
    [Difficulty.EXPERT]: 0.15,
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined
        ? seed + attempt * 1000003
        : Math.floor(Math.random() * 2 ** 31);

    const rng = createRng(actualSeed);
    const solution = generateLatinSquare(size, rng);

    // Generate inequality constraints (~30% of adjacent pairs)
    const constraints: FutoshikiConstraint[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size - 1; c++) {
        if (rng() < 0.3) {
          constraints.push({
            row1: r, col1: c, row2: r, col2: c + 1,
            direction: solution[r][c] < solution[r][c + 1] ? '<' : '>',
          });
        }
      }
    }
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size; c++) {
        if (rng() < 0.3) {
          constraints.push({
            row1: r, col1: c, row2: r + 1, col2: c,
            direction: solution[r][c] < solution[r + 1][c] ? '<' : '>',
          });
        }
      }
    }

    // Build given grid — start with full solution, then remove cells
    const given = solution.map((r) => [...r]);

    // Shuffle positions and remove cells one at a time, checking uniqueness
    const positions = shuffle(
      Array.from({ length: size * size }, (_, i) => i),
      rng
    );

    const targetGivens = Math.max(
      size, // always keep at least `size` clues
      Math.round(size * size * revealRate[difficulty])
    );

    let currentGivens = size * size;

    for (const pos of positions) {
      if (currentGivens <= targetGivens) break;

      const r = Math.floor(pos / size);
      const c = pos % size;
      if (given[r][c] === 0) continue;

      const backup = given[r][c];
      given[r][c] = 0;

      if (countFutoshikiSolutions(size, given, constraints, 2) !== 1) {
        given[r][c] = backup; // restore — removal broke uniqueness
      } else {
        currentGivens--;
      }
    }

    // Accept if we have a unique solution
    if (countFutoshikiSolutions(size, given, constraints, 2) === 1) {
      return {
        puzzleData: { size, given, constraints },
        solution: { grid: solution },
        difficulty,
        seed: actualSeed,
      };
    }
  }

  throw new Error(
    `[FutoshikiEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`
  );
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateFutoshikiBoard(
  board: number[][],
  size: number,
  constraints: FutoshikiConstraint[]
): { conflicts: Array<{ row: number; col: number }> } {
  const conflictSet = new Set<string>();

  for (let r = 0; r < size; r++) {
    const seen = new Map<number, number[]>();
    for (let c = 0; c < size; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v)!.push(c);
    }
    for (const [, cols] of seen) {
      if (cols.length > 1) cols.forEach((c) => conflictSet.add(`${r},${c}`));
    }
  }

  for (let c = 0; c < size; c++) {
    const seen = new Map<number, number[]>();
    for (let r = 0; r < size; r++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v)!.push(r);
    }
    for (const [, rows] of seen) {
      if (rows.length > 1) rows.forEach((r) => conflictSet.add(`${r},${c}`));
    }
  }

  for (const { row1, col1, row2, col2, direction } of constraints) {
    const a = board[row1][col1];
    const b = board[row2][col2];
    if (a === 0 || b === 0) continue;
    const violated =
      (direction === '<' && !(a < b)) || (direction === '>' && !(a > b));
    if (violated) {
      conflictSet.add(`${row1},${col1}`);
      conflictSet.add(`${row2},${col2}`);
    }
  }

  return {
    conflicts: Array.from(conflictSet).map((k) => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isFutoshikiSolved(
  board: number[][],
  solution: FutoshikiSolution
): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] !== solution.grid[r][c]) return false;
    }
  }
  return true;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: FutoshikiGameState,
  solution: FutoshikiSolution,
  given: number[][]
): FutoshikiHintResult | null {
  const { board } = gameState;
  const size = board.length;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (given[r][c] === 0 && board[r][c] === 0) {
        const newBoard = board.map((row) => [...row]);
        newBoard[r][c] = solution.grid[r][c];
        return {
          description: `Cell (${r + 1},${c + 1}) should be ${solution.grid[r][c]}.`,
          revealedState: { board: newBoard, selectedCell: { row: r, col: c } },
          position: { row: r, col: c },
        };
      }
    }
  }
  return null;
}