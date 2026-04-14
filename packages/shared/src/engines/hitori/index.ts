import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HitoriCellState = 'unshaded' | 'shaded' | 'circled'; // circled = confirmed unshaded

export interface HitoriCell {
  value: number;
  state: HitoriCellState;
}

export interface HitoriPuzzleData {
  size: number;
  grid: number[][]; // initial number grid
}

export interface HitoriSolution {
  shaded: boolean[][];
}

export interface HitoriGameState {
  board: HitoriCell[][];
}

export type HitoriGeneratedPuzzle = GeneratedPuzzle<HitoriPuzzleData, HitoriSolution>;
export type HitoriHintResult = HintResult<HitoriGameState>;

export const HITORI_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 5,
  [Difficulty.MEDIUM]: 7,
  [Difficulty.HARD]: 9,
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
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Connectivity check (BFS on unshaded cells) ───────────────────────────────

function isConnected(grid: number[][], shaded: boolean[][]): boolean {
  const size = grid.length;
  let start: [number, number] | null = null;
  let total = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!shaded[r][c]) {
        total++;
        if (!start) start = [r, c];
      }
    }
  }

  if (!start || total === 0) return false;

  const visited = new Set<string>();
  const queue: Array<[number, number]> = [start];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !shaded[nr][nc] && !visited.has(`${nr},${nc}`)) {
        queue.push([nr, nc]);
      }
    }
  }

  return visited.size === total;
}

// ─── Validate Hitori rules ───────────────────────────────────────────────────

function isValidHitori(grid: number[][], shaded: boolean[][]): boolean {
  const size = grid.length;

  // No adjacent shaded cells
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (shaded[r][c]) {
        if (r + 1 < size && shaded[r+1][c]) return false;
        if (c + 1 < size && shaded[r][c+1]) return false;
      }
    }
  }

  // No duplicate unshaded values in rows/cols
  for (let r = 0; r < size; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < size; c++) {
      if (!shaded[r][c]) {
        if (seen.has(grid[r][c])) return false;
        seen.add(grid[r][c]);
      }
    }
  }
  for (let c = 0; c < size; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < size; r++) {
      if (!shaded[r][c]) {
        if (seen.has(grid[r][c])) return false;
        seen.add(grid[r][c]);
      }
    }
  }

  return isConnected(grid, shaded);
}

// ─── Solve Hitori ─────────────────────────────────────────────────────────────

function solveHitori(
  grid: number[][],
  size: number,
  limit: number
): boolean[][][] {
  const shaded: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const solutions: boolean[][][] = [];

  // Collect cells that must be resolved (cells with duplicates)
  const candidates: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let hasDupRow = false, hasDupCol = false;
      for (let i = 0; i < size; i++) {
        if (i !== c && grid[r][i] === grid[r][c]) hasDupRow = true;
        if (i !== r && grid[i][c] === grid[r][c]) hasDupCol = true;
      }
      if (hasDupRow || hasDupCol) candidates.push([r, c]);
    }
  }

  function backtrack(idx: number): void {
    if (solutions.length >= limit) return;

    if (idx === candidates.length) {
      if (isValidHitori(grid, shaded)) {
        solutions.push(shaded.map(row => [...row]));
      }
      return;
    }

    const [r, c] = candidates[idx];

    // Try shaded
    if (
      !(r > 0 && shaded[r-1][c]) &&
      !(c > 0 && shaded[r][c-1]) &&
      !(r + 1 < size && shaded[r+1][c]) &&
      !(c + 1 < size && shaded[r][c+1])
    ) {
      shaded[r][c] = true;
      backtrack(idx + 1);
      shaded[r][c] = false;
    }

    // Try unshaded
    backtrack(idx + 1);
  }

  backtrack(0);
  return solutions;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): HitoriGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const size = HITORI_SIZE_CONFIG[difficulty];

  // Start from a valid shading, then construct the number grid
  const shaded: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Place shaded cells: randomly, no two adjacent, ~15% of cells
  const positions = shuffle(
    Array.from({ length: size * size }, (_, i) => i),
    rng
  );

  for (const pos of positions) {
    const r = Math.floor(pos / size);
    const c = pos % size;
    if (shaded[r][c]) continue;
    const hasAdjShaded =
      (r > 0 && shaded[r-1][c]) ||
      (r + 1 < size && shaded[r+1][c]) ||
      (c > 0 && shaded[r][c-1]) ||
      (c + 1 < size && shaded[r][c+1]);

    if (!hasAdjShaded && rng() < 0.15) {
      shaded[r][c] = true;
    }
  }

  // Build number grid: unshaded cells get unique values per row/col (Latin square style)
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));

  function fillUnshaded(): boolean {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shaded[r][c]) {
          grid[r][c] = Math.floor(rng() * size) + 1;
          continue;
        }
        const rowUsed = new Set<number>();
        const colUsed = new Set<number>();
        for (let i = 0; i < c; i++) {
          if (!shaded[r][i]) rowUsed.add(grid[r][i]);
        }
        for (let i = 0; i < r; i++) {
          if (!shaded[i][c]) colUsed.add(grid[i][c]);
        }
        const available = Array.from({ length: size }, (_, i) => i + 1)
          .filter(v => !rowUsed.has(v) && !colUsed.has(v));
        if (available.length === 0) return false;
        grid[r][c] = available[Math.floor(rng() * available.length)];
      }
    }
    return true;
  }

  if (!fillUnshaded() || !isConnected(grid, shaded)) {
    return generatePuzzle(difficulty, actualSeed + 1);
  }

  // Now introduce some duplicates in shaded cells' rows/cols by assigning them values that create conflicts
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (shaded[r][c]) {
        // Assign a value that exists elsewhere in the row or col to create a "needed" shade
        const rowVals = grid[r].filter((_, i) => i !== c && !shaded[r][i]);
        const colVals = grid.map((row, i) => row[c]).filter((_, i) => i !== r && !shaded[i][c]);
        const candidates = [...rowVals, ...colVals];
        if (candidates.length > 0) {
          grid[r][c] = candidates[Math.floor(rng() * candidates.length)];
        }
      }
    }
  }

  // Verify uniqueness
  const sols = solveHitori(grid, size, 2);
  if (sols.length !== 1) {
    return generatePuzzle(difficulty, actualSeed + 1);
  }

  return {
    puzzleData: { size, grid },
    solution: { shaded: sols[0] },
    difficulty,
    seed: actualSeed,
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateHitoriBoard(
  board: HitoriCell[][],
  size: number
): { conflicts: Array<{ row: number; col: number }> } {
  const conflictSet = new Set<string>();
  const shaded = board.map(row => row.map(c => c.state === 'shaded'));

  // Adjacent shaded
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (shaded[r][c]) {
        if (r + 1 < size && shaded[r+1][c]) {
          conflictSet.add(`${r},${c}`);
          conflictSet.add(`${r+1},${c}`);
        }
        if (c + 1 < size && shaded[r][c+1]) {
          conflictSet.add(`${r},${c}`);
          conflictSet.add(`${r},${c+1}`);
        }
      }
    }
  }

  // Duplicate unshaded in row
  for (let r = 0; r < size; r++) {
    const seen = new Map<number, number[]>();
    for (let c = 0; c < size; c++) {
      if (!shaded[r][c]) {
        const v = board[r][c].value;
        if (!seen.has(v)) seen.set(v, []);
        seen.get(v)!.push(c);
      }
    }
    for (const [, cols] of seen) {
      if (cols.length > 1) cols.forEach(c => conflictSet.add(`${r},${c}`));
    }
  }

  // Duplicate unshaded in col
  for (let c = 0; c < size; c++) {
    const seen = new Map<number, number[]>();
    for (let r = 0; r < size; r++) {
      if (!shaded[r][c]) {
        const v = board[r][c].value;
        if (!seen.has(v)) seen.set(v, []);
        seen.get(v)!.push(r);
      }
    }
    for (const [, rows] of seen) {
      if (rows.length > 1) rows.forEach(r => conflictSet.add(`${r},${c}`));
    }
  }

  return {
    conflicts: Array.from(conflictSet).map(k => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isHitoriSolved(board: HitoriCell[][], solution: HitoriSolution): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const isShaded = board[r][c].state === 'shaded';
      if (isShaded !== solution.shaded[r][c]) return false;
    }
  }
  return true;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: HitoriGameState,
  solution: HitoriSolution
): HitoriHintResult | null {
  const { board } = gameState;

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const cell = board[r][c];
      const shouldBeShaded = solution.shaded[r][c];
      const isShaded = cell.state === 'shaded';
      if (isShaded !== shouldBeShaded) {
        const newBoard = board.map((row, ri) =>
          row.map((cell, ci): HitoriCell => {
            if (ri === r && ci === c) {
              return { ...cell, state: shouldBeShaded ? 'shaded' : 'circled' };
            }
            return { ...cell };
          })
        );
        return {
          description: `Cell (${r+1},${c+1}) should be ${shouldBeShaded ? 'shaded' : 'unshaded'}.`,
          revealedState: { board: newBoard },
          position: { row: r, col: c },
        };
      }
    }
  }
  return null;
}
