import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FutoshikiDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type InequalityDir = '<' | '>';

export interface FutoshikiConstraint {
  row1: number; col1: number;
  row2: number; col2: number;
  direction: InequalityDir; // col1,row1 direction col2,row2 — e.g., '<' means [r1,c1] < [r2,c2]
}

export interface FutoshikiPuzzleData {
  size: number;
  given: number[][]; // 0 = empty
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
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Generate complete Latin square ──────────────────────────────────────────

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
    const digits = shuffle(Array.from({ length: size }, (_, i) => i + 1), rng);
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

// ─── Count solutions (limit=2 for uniqueness) ────────────────────────────────

function countFutoshikiSolutions(
  size: number,
  given: number[][],
  constraints: FutoshikiConstraint[],
  limit: number
): number {
  const grid = given.map(r => [...r]);

  function canPlace(r: number, c: number, val: number): boolean {
    // Latin square
    for (let i = 0; i < size; i++) {
      if (i !== c && grid[r][i] === val) return false;
      if (i !== r && grid[i][c] === val) return false;
    }
    // Inequality constraints
    for (const con of constraints) {
      const { row1, col1, row2, col2, direction } = con;
      if (r === row1 && c === col1) {
        const other = grid[row2][col2];
        if (other !== 0) {
          if (direction === '<' && !(val < other)) return false;
          if (direction === '>' && !(val > other)) return false;
        }
      }
      if (r === row2 && c === col2) {
        const other = grid[row1][col1];
        if (other !== 0) {
          if (direction === '<' && !(other < val)) return false;
          if (direction === '>' && !(other > val)) return false;
        }
      }
    }
    return true;
  }

  let count = 0;
  function backtrack(pos: number): void {
    if (count >= limit) return;
    if (pos === size * size) { count++; return; }
    const r = Math.floor(pos / size);
    const c = pos % size;
    if (grid[r][c] !== 0) { backtrack(pos + 1); return; }
    for (let d = 1; d <= size; d++) {
      if (canPlace(r, c, d)) {
        grid[r][c] = d;
        backtrack(pos + 1);
        grid[r][c] = 0;
        if (count >= limit) return;
      }
    }
  }

  backtrack(0);
  return count;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): FutoshikiGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const size = FUTOSHIKI_SIZE_CONFIG[difficulty];

  const solution = generateLatinSquare(size, rng);

  // Generate inequality constraints from adjacent pairs
  const constraints: FutoshikiConstraint[] = [];
  const constraintChance = 0.3;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 1; c++) {
      if (rng() < constraintChance) {
        const dir: InequalityDir = solution[r][c] < solution[r][c+1] ? '<' : '>';
        constraints.push({ row1: r, col1: c, row2: r, col2: c+1, direction: dir });
      }
    }
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size; c++) {
      if (rng() < constraintChance) {
        const dir: InequalityDir = solution[r][c] < solution[r+1][c] ? '<' : '>';
        constraints.push({ row1: r, col1: c, row2: r+1, col2: c, direction: dir });
      }
    }
  }

  // Remove cells while preserving uniqueness
  const revealRate: Record<Difficulty, number> = {
    [Difficulty.EASY]: 0.5,
    [Difficulty.MEDIUM]: 0.35,
    [Difficulty.HARD]: 0.2,
    [Difficulty.EXPERT]: 0.1,
  };

  const given = solution.map(r => [...r]);
  const positions = shuffle(
    Array.from({ length: size * size }, (_, i) => i),
    rng
  );

  for (const pos of positions) {
    const r = Math.floor(pos / size);
    const c = pos % size;
    if (given[r][c] === 0) continue;

    const backup = given[r][c];
    given[r][c] = 0;

    if (countFutoshikiSolutions(size, given, constraints, 2) !== 1) {
      given[r][c] = backup;
    }
  }

  return {
    puzzleData: { size, given, constraints },
    solution: { grid: solution },
    difficulty,
    seed: actualSeed,
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateFutoshikiBoard(
  board: number[][],
  size: number,
  constraints: FutoshikiConstraint[]
): { conflicts: Array<{ row: number; col: number }> } {
  const conflictSet = new Set<string>();

  // Latin square check
  for (let r = 0; r < size; r++) {
    const rowVals = new Map<number, number[]>();
    for (let c = 0; c < size; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (!rowVals.has(v)) rowVals.set(v, []);
      rowVals.get(v)!.push(c);
    }
    for (const [, cols] of rowVals) {
      if (cols.length > 1) cols.forEach(c => conflictSet.add(`${r},${c}`));
    }
  }

  for (let c = 0; c < size; c++) {
    const colVals = new Map<number, number[]>();
    for (let r = 0; r < size; r++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (!colVals.has(v)) colVals.set(v, []);
      colVals.get(v)!.push(r);
    }
    for (const [, rows] of colVals) {
      if (rows.length > 1) rows.forEach(r => conflictSet.add(`${r},${c}`));
    }
  }

  // Inequality check
  for (const { row1, col1, row2, col2, direction } of constraints) {
    const a = board[row1][col1];
    const b = board[row2][col2];
    if (a === 0 || b === 0) continue;
    if (direction === '<' && !(a < b)) {
      conflictSet.add(`${row1},${col1}`);
      conflictSet.add(`${row2},${col2}`);
    }
    if (direction === '>' && !(a > b)) {
      conflictSet.add(`${row1},${col1}`);
      conflictSet.add(`${row2},${col2}`);
    }
  }

  return {
    conflicts: Array.from(conflictSet).map(k => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isFutoshikiSolved(board: number[][], solution: FutoshikiSolution): boolean {
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
        const newBoard = board.map(row => [...row]);
        newBoard[r][c] = solution.grid[r][c];
        return {
          description: `Cell (${r+1},${c+1}) should be ${solution.grid[r][c]}.`,
          revealedState: { board: newBoard, selectedCell: { row: r, col: c } },
          position: { row: r, col: c },
        };
      }
    }
  }
  return null;
}
