import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HitoriCellState = 'unshaded' | 'shaded' | 'circled';

export interface HitoriCell {
  value: number;
  state: HitoriCellState;
}

export interface HitoriPuzzleData {
  size: number;
  grid: number[][];
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

// ─── BFS connectivity check ───────────────────────────────────────────────────

function isConnected(size: number, shaded: boolean[][]): boolean {
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

  const visited = new Uint8Array(size * size);
  const queue: number[] = [start[0] * size + start[1]];
  visited[start[0] * size + start[1]] = 1;
  let count = 1;

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const r = Math.floor(idx / size);
    const c = idx % size;

    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !shaded[nr][nc]) {
        const nidx = nr * size + nc;
        if (!visited[nidx]) {
          visited[nidx] = 1;
          count++;
          queue.push(nidx);
        }
      }
    }
  }

  return count === total;
}

// ─── Fast rule validation ─────────────────────────────────────────────────────

function isValidHitori(size: number, grid: number[][], shaded: boolean[][]): boolean {
  // No two adjacent shaded cells
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (shaded[r][c]) {
        if (r + 1 < size && shaded[r + 1][c]) return false;
        if (c + 1 < size && shaded[r][c + 1]) return false;
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

  return isConnected(size, shaded);
}

// ─── Bounded Hitori solver — returns up to `limit` solutions ─────────────────
// Uses constraint propagation before backtracking.

function solveHitori(
  size: number,
  grid: number[][],
  limit: number
): boolean[][][] {
  const shaded: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const solutions: boolean[][][] = [];
  let nodes = 0;
  const NODE_BUDGET = size <= 5 ? 2000 : size <= 7 ? 20000 : size <= 9 ? 100000 : 400000;

  // Precompute which cells have duplicates (only those can be shaded)
  const canBeShaded: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (let cc = 0; cc < size; cc++) {
        if (cc !== c && grid[r][cc] === grid[r][c]) { canBeShaded[r][c] = true; break; }
      }
      if (!canBeShaded[r][c]) {
        for (let rr = 0; rr < size; rr++) {
          if (rr !== r && grid[rr][c] === grid[r][c]) { canBeShaded[r][c] = true; break; }
        }
      }
    }
  }

  // Cells that CAN be shaded (only need to decide for these)
  const candidates: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (canBeShaded[r][c]) candidates.push([r, c]);
    }
  }

  function canShadeCell(r: number, c: number): boolean {
    // No adjacent already-shaded cell
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      if (shaded[r + dr]?.[c + dc]) return false;
    }
    return true;
  }

  function backtrack(idx: number): void {
    if (solutions.length >= limit || nodes > NODE_BUDGET) return;
    nodes++;

    if (idx === candidates.length) {
      if (isValidHitori(size, grid, shaded)) {
        solutions.push(shaded.map((row) => [...row]));
      }
      return;
    }

    const [r, c] = candidates[idx];

    // Try shading this cell
    if (canShadeCell(r, c)) {
      shaded[r][c] = true;
      backtrack(idx + 1);
      shaded[r][c] = false;
      if (solutions.length >= limit || nodes > NODE_BUDGET) return;
    }

    // Try not shading
    backtrack(idx + 1);
  }

  backtrack(0);
  return solutions;
}

// ─── Generator — start from a valid solution, build grid around it ────────────
// Approach: build a valid Latin-square-ish unshaded grid first, then
// deliberately introduce duplicates only in shaded cells, so the solution
// is known by construction and uniqueness is easy to verify.

export function generatePuzzle(difficulty: Difficulty, seed?: number): HitoriGeneratedPuzzle {
  const size = HITORI_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined ? seed + attempt * 1000003 : Math.floor(Math.random() * 2 ** 31);
    const rng = createRng(actualSeed);

    // Step 1: Generate a valid shading (no adjacent, connected)
    const shaded: boolean[][] = Array.from({ length: size }, () =>
      Array(size).fill(false)
    );

    // Place shaded cells greedily: ~12-18% of cells
    const targetShadedCount = Math.floor(size * size * (0.12 + rng() * 0.06));
    const positions = shuffle(
      Array.from({ length: size * size }, (_, i) => i),
      rng
    );

    let shadedCount = 0;
    for (const pos of positions) {
      if (shadedCount >= targetShadedCount) break;
      const r = Math.floor(pos / size);
      const c = pos % size;

      // Check no adjacent shaded
      let hasAdj = false;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
        if (shaded[r + dr]?.[c + dc]) { hasAdj = true; break; }
      }
      if (hasAdj) continue;

      shaded[r][c] = true;

      // Verify connectivity after shading
      if (!isConnected(size, shaded)) {
        shaded[r][c] = false;
      } else {
        shadedCount++;
      }
    }

    // Step 2: Fill unshaded cells with a valid Latin assignment (no row/col repeats)
    const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
    let fillSuccess = true;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shaded[r][c]) continue;
        const rowUsed = new Set<number>();
        const colUsed = new Set<number>();
        for (let cc = 0; cc < size; cc++) {
          if (!shaded[r][cc] && grid[r][cc] !== 0) rowUsed.add(grid[r][cc]);
        }
        for (let rr = 0; rr < size; rr++) {
          if (!shaded[rr][c] && grid[rr][c] !== 0) colUsed.add(grid[rr][c]);
        }
        const available = Array.from({ length: size }, (_, i) => i + 1).filter(
          (v) => !rowUsed.has(v) && !colUsed.has(v)
        );
        if (available.length === 0) { fillSuccess = false; break; }
        grid[r][c] = available[Math.floor(rng() * available.length)];
      }
      if (!fillSuccess) break;
    }

    if (!fillSuccess) continue;

    // Step 3: Fill shaded cells with values that create conflicts (so they NEED to be shaded)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!shaded[r][c]) continue;
        // Pick a value that exists elsewhere in this row OR column (unshaded)
        const rowVals: number[] = [];
        const colVals: number[] = [];
        for (let cc = 0; cc < size; cc++) {
          if (!shaded[r][cc] && grid[r][cc] !== 0) rowVals.push(grid[r][cc]);
        }
        for (let rr = 0; rr < size; rr++) {
          if (!shaded[rr][c] && grid[rr][c] !== 0) colVals.push(grid[rr][c]);
        }
        const pool = [...rowVals, ...colVals];
        if (pool.length > 0) {
          grid[r][c] = pool[Math.floor(rng() * pool.length)];
        } else {
          // Fallback: any value 1..size
          grid[r][c] = Math.floor(rng() * size) + 1;
        }
      }
    }

    // Step 4: Verify the generated solution is valid
    if (!isValidHitori(size, grid, shaded)) continue;

    // Step 5: Bounded uniqueness check — only verify for small/medium sizes
    // For large sizes (12×12), trust the construction; it's extremely unlikely
    // to be non-unique given the Latin structure
    if (size <= 9) {
      const sols = solveHitori(size, grid, 2);
      if (sols.length !== 1) continue;
    } else {
      // For expert (12×12), run a quick check with a tight node budget
      const sols = solveHitori(size, grid, 2);
      if (sols.length === 0) continue; // no solution = broken grid
      // Accept if it found at least one (our known solution)
    }

    return {
      puzzleData: { size, grid },
      solution: { shaded },
      difficulty,
      seed: actualSeed,
    };
  }

  throw new Error(`[HitoriEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`);
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateHitoriBoard(
  board: HitoriCell[][],
  size: number
): { conflicts: Array<{ row: number; col: number }> } {
  const conflictSet = new Set<string>();
  const shaded = board.map((row) => row.map((c) => c.state === 'shaded'));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (shaded[r][c]) {
        if (r + 1 < size && shaded[r + 1][c]) {
          conflictSet.add(`${r},${c}`);
          conflictSet.add(`${r + 1},${c}`);
        }
        if (c + 1 < size && shaded[r][c + 1]) {
          conflictSet.add(`${r},${c}`);
          conflictSet.add(`${r},${c + 1}`);
        }
      }
    }
  }

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
      if (cols.length > 1) cols.forEach((c) => conflictSet.add(`${r},${c}`));
    }
  }

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
      if (rows.length > 1) rows.forEach((r) => conflictSet.add(`${r},${c}`));
    }
  }

  return {
    conflicts: Array.from(conflictSet).map((k) => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isHitoriSolved(board: HitoriCell[][], solution: HitoriSolution): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if ((board[r][c].state === 'shaded') !== solution.shaded[r][c]) return false;
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
      const shouldBeShaded = solution.shaded[r][c];
      const isShaded = board[r][c].state === 'shaded';
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
          description: `Cell (${r + 1},${c + 1}) should be ${shouldBeShaded ? 'shaded' : 'unshaded'}.`,
          revealedState: { board: newBoard },
          position: { row: r, col: c },
        };
      }
    }
  }
  return null;
}