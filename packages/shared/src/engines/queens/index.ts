import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types (kept in same file to avoid separate types.ts) ─────────────────────

export type QueensCellMark = 'empty' | 'queen' | 'x';

export interface QueensCellState {
  mark: QueensCellMark;
  region: number;
}

export type QueensBoard = QueensCellState[][];

export interface QueensPuzzleData {
  size: number;
  regions: number[][];
}

export interface QueensSolution {
  queenPositions: Array<{ row: number; col: number }>;
}

export interface QueensGameState {
  board: QueensBoard;
}

export type QueensGeneratedPuzzle = GeneratedPuzzle<QueensPuzzleData, QueensSolution>;
export type QueensHintResult = HintResult<QueensGameState>;

export const QUEENS_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 6,
  [Difficulty.MEDIUM]: 8,
  [Difficulty.HARD]: 10,
  [Difficulty.EXPERT]: 12,
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

// ─── Generate a valid queen placement ────────────────────────────────────────
// One queen per row, per column, no two queens adjacent (including diagonal).
// Uses backtracking with column and placed-queen tracking.

function generateQueenPlacement(
  size: number,
  rng: () => number
): Array<{ row: number; col: number }> | null {
  const placed: Array<{ row: number; col: number }> = [];
  const colUsed = new Set<number>();

  function canPlace(row: number, col: number): boolean {
    for (const q of placed) {
      if (Math.abs(q.row - row) <= 1 && Math.abs(q.col - col) <= 1) return false;
    }
    return true;
  }

  function backtrack(row: number): boolean {
    if (row === size) return true;
    const cols = shuffle(
      Array.from({ length: size }, (_, i) => i).filter((c) => !colUsed.has(c)),
      rng
    );
    for (const col of cols) {
      if (canPlace(row, col)) {
        placed.push({ row, col });
        colUsed.add(col);
        if (backtrack(row + 1)) return true;
        placed.pop();
        colUsed.delete(col);
      }
    }
    return false;
  }

  return backtrack(0) ? placed : null;
}

// ─── Assign regions via BFS flood-fill seeded from queen positions ────────────

function assignRegions(
  size: number,
  queens: Array<{ row: number; col: number }>,
  rng: () => number
): number[][] {
  const regions: number[][] = Array.from({ length: size }, () => Array(size).fill(-1));

  queens.forEach((q, i) => {
    regions[q.row][q.col] = i;
  });

  // BFS from all queens simultaneously; shuffle queue for organic shapes
  type QCell = { row: number; col: number; region: number };
  let queue: QCell[] = queens.map((q, i) => ({ ...q, region: i }));

  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    queue = shuffle(queue, rng);
    const { row, col, region } = queue.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
        regions[nr][nc] = region;
        queue.push({ row: nr, col: nc, region });
      }
    }
  }

  // Safety: fill any -1 cells (shouldn't happen but just in case)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === -1) regions[r][c] = 0;
    }
  }

  return regions;
}

// ─── Uniqueness verification — bounded backtracking ──────────────────────────
// Checks if (regions, size) has exactly one valid queen placement.
// Uses colUsed + regionUsed sets for O(n) feasibility per step.
// Adjacency is tracked by recording the placed column per row.

function countQueenSolutions(
  size: number,
  regions: number[][],
  limit: number
): number {
  let count = 0;
  const colUsed = new Set<number>();
  const regionUsed = new Set<number>();
  // placedCols[r] = column of queen placed in row r (or -1)
  const placedCols: number[] = new Array(size).fill(-1);
  let nodes = 0;
  const NODE_BUDGET = size <= 6 ? 5000 : size <= 8 ? 50000 : size <= 10 ? 200000 : 500000;

  function isAdjacentToExisting(row: number, col: number): boolean {
    // Check row above
    if (row > 0 && placedCols[row - 1] !== -1) {
      if (Math.abs(placedCols[row - 1] - col) <= 1) return true;
    }
    return false;
  }

  function backtrack(row: number): void {
    if (count >= limit || nodes > NODE_BUDGET) return;
    nodes++;

    if (row === size) {
      count++;
      return;
    }

    for (let col = 0; col < size; col++) {
      if (colUsed.has(col)) continue;
      const reg = regions[row][col];
      if (regionUsed.has(reg)) continue;
      if (isAdjacentToExisting(row, col)) continue;

      // Also check adjacency with the queen that will go in row+1
      // We can't check that yet, so just check above (already done)
      // The constraint is symmetric — when we place row+1 we'll check row

      colUsed.add(col);
      regionUsed.add(reg);
      placedCols[row] = col;

      backtrack(row + 1);

      colUsed.delete(col);
      regionUsed.delete(reg);
      placedCols[row] = -1;

      if (count >= limit || nodes > NODE_BUDGET) return;
    }
  }

  backtrack(0);
  return count;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): QueensGeneratedPuzzle {
  const size = QUEENS_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined ? seed + attempt * 1000003 : Math.floor(Math.random() * 2 ** 31);
    const rng = createRng(actualSeed);

    const queens = generateQueenPlacement(size, rng);
    if (!queens) continue;

    const regions = assignRegions(size, queens, rng);

    // Verify uniqueness with bounded backtracking
    const count = countQueenSolutions(size, regions, 2);
    if (count !== 1) continue;

    return {
      puzzleData: { size, regions },
      solution: { queenPositions: queens },
      difficulty,
      seed: actualSeed,
    };
  }

  throw new Error(`[QueensEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`);
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateQueensBoard(
  board: QueensBoard,
  regions: number[][]
): { valid: boolean; conflicts: Array<{ row: number; col: number }> } {
  const size = board.length;
  const queens: Array<{ row: number; col: number }> = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c].mark === 'queen') queens.push({ row: r, col: c });
    }
  }

  const conflictSet = new Set<string>();

  // Row/col/region duplicates
  const rowCounts = new Map<number, number[]>();
  const colCounts = new Map<number, number[]>();
  const regionCounts = new Map<number, number[]>();

  for (const q of queens) {
    if (!rowCounts.has(q.row)) rowCounts.set(q.row, []);
    rowCounts.get(q.row)!.push(q.col);
    if (!colCounts.has(q.col)) colCounts.set(q.col, []);
    colCounts.get(q.col)!.push(q.row);
    const reg = regions[q.row][q.col];
    if (!regionCounts.has(reg)) regionCounts.set(reg, []);
    regionCounts.get(reg)!.push(q.row * size + q.col);
  }

  for (const [row, cols] of rowCounts) {
    if (cols.length > 1) cols.forEach((c) => conflictSet.add(`${row},${c}`));
  }
  for (const [col, rows] of colCounts) {
    if (rows.length > 1) rows.forEach((r) => conflictSet.add(`${r},${col}`));
  }
  for (const [, positions] of regionCounts) {
    if (positions.length > 1) {
      positions.forEach((pos) => {
        const r = Math.floor(pos / size);
        const c = pos % size;
        conflictSet.add(`${r},${c}`);
      });
    }
  }

  // Adjacency conflicts
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (
        Math.abs(queens[i].row - queens[j].row) <= 1 &&
        Math.abs(queens[i].col - queens[j].col) <= 1
      ) {
        conflictSet.add(`${queens[i].row},${queens[i].col}`);
        conflictSet.add(`${queens[j].row},${queens[j].col}`);
      }
    }
  }

  const conflicts = Array.from(conflictSet).map((k) => {
    const [r, c] = k.split(',').map(Number);
    return { row: r, col: c };
  });

  return { valid: conflicts.length === 0, conflicts };
}

export function isQueensBoardSolved(
  board: QueensBoard,
  regions: number[][]
): boolean {
  const size = board.length;
  const { valid } = validateQueensBoard(board, regions);
  if (!valid) return false;
  let queenCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c].mark === 'queen') queenCount++;
    }
  }
  return queenCount === size;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: QueensGameState,
  puzzleData: QueensPuzzleData,
  solution: QueensSolution
): QueensHintResult | null {
  const { board } = gameState;
  for (const pos of solution.queenPositions) {
    if (board[pos.row][pos.col].mark !== 'queen') {
      const newBoard: QueensBoard = board.map((row, r) =>
        row.map((cell, c) => {
          if (r === pos.row && c === pos.col) return { ...cell, mark: 'queen' as QueensCellMark };
          return { ...cell };
        })
      );
      return {
        description: `Place a queen at row ${pos.row + 1}, column ${pos.col + 1}.`,
        revealedState: { board: newBoard },
        position: { row: pos.row, col: pos.col },
      };
    }
  }
  return null;
}

export function cycleQueensMark(current: QueensCellMark): QueensCellMark {
  if (current === 'empty') return 'queen';
  if (current === 'queen') return 'x';
  return 'empty';
}