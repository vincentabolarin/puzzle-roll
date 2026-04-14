import { Difficulty } from '../../types/core';
import {
  QueensBoard,
  QueensCellMark,
  QueensGameState,
  QueensGeneratedPuzzle,
  QueensHintResult,
  QueensPuzzleData,
  QueensSolution,
  QUEENS_SIZE_CONFIG,
} from './types';

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

// ─── Generate valid queen placement (one per row, col, no adjacency) ──────────

function generateQueenPlacement(size: number, rng: () => number): Array<{ row: number; col: number }> | null {
  const cols = Array.from({ length: size }, (_, i) => i);
  shuffle(cols, rng);

  const queens: Array<{ row: number; col: number }> = [];

  function canPlace(row: number, col: number): boolean {
    for (const q of queens) {
      if (Math.abs(q.row - row) <= 1 && Math.abs(q.col - col) <= 1) return false;
    }
    return true;
  }

  function backtrack(row: number, available: number[]): boolean {
    if (row === size) return true;
    const shuffled = shuffle([...available], rng);
    for (const col of shuffled) {
      if (canPlace(row, col)) {
        queens.push({ row, col });
        const next = available.filter((c) => c !== col);
        if (backtrack(row + 1, next)) return true;
        queens.pop();
      }
    }
    return false;
  }

  if (backtrack(0, cols)) return queens;
  return null;
}

// ─── Assign regions via flood-fill seeded growth ──────────────────────────────

function assignRegions(
  size: number,
  queens: Array<{ row: number; col: number }>,
  rng: () => number
): number[][] {
  const regions = Array.from({ length: size }, () => Array(size).fill(-1));
  const regionId = queens.map((_, i) => i);

  // Seed each queen's cell with its region
  queens.forEach((q, i) => {
    regions[q.row][q.col] = i;
  });

  // BFS flood-fill from all queens simultaneously
  type Cell = { row: number; col: number; region: number };
  const queue: Cell[] = queens.map((q, i) => ({ ...q, region: i }));

  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  while (queue.length > 0) {
    // Shuffle to get more organic region shapes
    shuffle(queue, rng);
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

  // Fill any remaining -1 cells with nearest region (shouldn't happen but safety)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === -1) regions[r][c] = 0;
    }
  }

  return regions;
}

// ─── Verify uniqueness: no other valid queen placement satisfies the regions ──

function countQueenSolutions(
  size: number,
  regions: number[][],
  rowUsed: boolean[],
  colUsed: boolean[],
  regionUsed: boolean[],
  row: number,
  limit: number
): number {
  if (row === size) return 1;
  let count = 0;

  for (let col = 0; col < size; col++) {
    if (colUsed[col]) continue;
    const reg = regions[row][col];
    if (regionUsed[reg]) continue;

    // Check adjacency with all placed queens
    let adjacent = false;
    for (let r = 0; r < row; r++) {
      // We need to track placed cols — pass along
      // We'll use a different approach below
    }

    if (!adjacent) {
      rowUsed[row] = true;
      colUsed[col] = true;
      regionUsed[reg] = true;
      count += countQueenSolutions(size, regions, rowUsed, colUsed, regionUsed, row + 1, limit);
      rowUsed[row] = false;
      colUsed[col] = false;
      regionUsed[reg] = false;
      if (count >= limit) return count;
    }
  }
  return count;
}

// Better uniqueness checker that tracks placed positions for adjacency
function verifyUniqueSolution(
  size: number,
  regions: number[][],
  solution: Array<{ row: number; col: number }>
): boolean {
  let solutionCount = 0;

  function backtrack(row: number, placed: Array<{ row: number; col: number }>, colUsed: Set<number>, regionUsed: Set<number>): void {
    if (solutionCount > 1) return;
    if (row === size) {
      solutionCount++;
      return;
    }

    for (let col = 0; col < size; col++) {
      if (colUsed.has(col)) continue;
      const reg = regions[row][col];
      if (regionUsed.has(reg)) continue;

      let adjacent = false;
      for (const p of placed) {
        if (Math.abs(p.row - row) <= 1 && Math.abs(p.col - col) <= 1) {
          adjacent = true;
          break;
        }
      }
      if (adjacent) continue;

      placed.push({ row, col });
      colUsed.add(col);
      regionUsed.add(reg);
      backtrack(row + 1, placed, colUsed, regionUsed);
      placed.pop();
      colUsed.delete(col);
      regionUsed.delete(reg);
    }
  }

  backtrack(0, [], new Set(), new Set());
  return solutionCount === 1;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): QueensGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const size = QUEENS_SIZE_CONFIG[difficulty];

  let queens: Array<{ row: number; col: number }> | null = null;
  let regions: number[][] | null = null;
  let attempts = 0;

  while (attempts < 100) {
    queens = generateQueenPlacement(size, rng);
    if (!queens) { attempts++; continue; }
    regions = assignRegions(size, queens, rng);
    if (verifyUniqueSolution(size, regions, queens)) break;
    attempts++;
  }

  if (!queens || !regions) {
    // Fallback: regenerate with different seed
    return generatePuzzle(difficulty, actualSeed + 1);
  }

  return {
    puzzleData: { size, regions },
    solution: { queenPositions: queens },
    difficulty,
    seed: actualSeed,
  };
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

  // Check row conflicts
  const rowCounts = new Map<number, number[]>();
  const colCounts = new Map<number, number[]>();
  const regionCounts = new Map<number, number[]>();

  for (const q of queens) {
    const key = `${q.row},${q.col}`;
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

  // Check adjacency
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (Math.abs(queens[i].row - queens[j].row) <= 1 &&
          Math.abs(queens[i].col - queens[j].col) <= 1) {
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
  regions: number[][],
  solution: QueensSolution
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
  const { queenPositions } = solution;

  // Find a queen in the solution not yet correctly placed
  for (const pos of queenPositions) {
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
