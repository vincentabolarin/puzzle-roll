import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZipCell {
  number: number | null; // null = plain cell, 1..N = numbered waypoint
}

export interface ZipPuzzleData {
  size: number;
  grid: ZipCell[][];
}

export interface ZipSolution {
  path: Array<{ row: number; col: number }>; // ordered path visiting every cell
}

export interface ZipGameState {
  currentPath: Array<{ row: number; col: number }>;
  isDrawing: boolean;
}

export type ZipGeneratedPuzzle = GeneratedPuzzle<ZipPuzzleData, ZipSolution>;
export type ZipHintResult = HintResult<ZipGameState>;

export const ZIP_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 5,
  [Difficulty.MEDIUM]: 6,
  [Difficulty.HARD]: 7,
  [Difficulty.EXPERT]: 8,
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

// ─── Warnsdorff's heuristic — sort neighbours by their own onward-degree ─────
// This dramatically reduces backtracking on larger grids.

function getNeighbours(
  row: number,
  col: number,
  size: number,
  visited: boolean[][]
): Array<{ row: number; col: number }> {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const result: Array<{ row: number; col: number }> = [];
  for (const [dr, dc] of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc]) {
      result.push({ row: nr, col: nc });
    }
  }
  return result;
}

function warnsdorffDegree(
  row: number,
  col: number,
  size: number,
  visited: boolean[][]
): number {
  return getNeighbours(row, col, size, visited).length;
}

// ─── Generate a Hamiltonian path using Warnsdorff + limited backtracking ──────

function generateHamiltonianPath(
  size: number,
  rng: () => number
): Array<{ row: number; col: number }> | null {
  const total = size * size;
  // Cap backtracking nodes visited to avoid exponential blowup.
  // Empirically: 5×5 needs ~200, 6×6 ~2000, 7×7 ~50000, 8×8 ~200000
  const NODE_BUDGET = size <= 5 ? 500 : size <= 6 ? 5000 : size <= 7 ? 80000 : 300000;
  let nodesVisited = 0;

  const visited: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const path: Array<{ row: number; col: number }> = [];

  function dfs(row: number, col: number): boolean {
    if (nodesVisited > NODE_BUDGET) return false;
    nodesVisited++;

    visited[row][col] = true;
    path.push({ row, col });

    if (path.length === total) return true;

    // Get unvisited neighbours, sorted by Warnsdorff degree (fewest onward moves first)
    // Break ties randomly for variety
    const neighbours = getNeighbours(row, col, size, visited);
    const sorted = neighbours
      .map((n) => ({ ...n, degree: warnsdorffDegree(n.row, n.col, size, visited) }))
      .sort((a, b) => {
        if (a.degree !== b.degree) return a.degree - b.degree;
        return rng() - 0.5; // random tiebreak
      });

    for (const next of sorted) {
      if (dfs(next.row, next.col)) return true;
    }

    visited[row][col] = false;
    path.pop();
    return false;
  }

  // Try multiple random start positions
  const starts: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      starts.push({ row: r, col: c });
    }
  }
  const shuffledStarts = shuffle(starts, rng);

  for (const start of shuffledStarts) {
    nodesVisited = 0;
    // Reset visited and path for each start attempt
    for (let r = 0; r < size; r++) visited[r].fill(false);
    path.length = 0;

    if (dfs(start.row, start.col)) return path;
  }

  return null;
}

// ─── Place numbered waypoints along the path ─────────────────────────────────

function placeWaypoints(
  path: Array<{ row: number; col: number }>,
  size: number,
  rng: () => number
): number[] {
  const total = path.length;
  const waypointCount = size; // N waypoints for an N×N grid
  const step = (total - 1) / (waypointCount - 1);

  const indices: number[] = [0];
  for (let i = 1; i < waypointCount - 1; i++) {
    const base = Math.round(i * step);
    const jitter = Math.floor((rng() - 0.5) * step * 0.4);
    const idx = Math.max(1, Math.min(total - 2, base + jitter));
    indices.push(idx);
  }
  indices.push(total - 1);

  // Deduplicate and sort
  return [...new Set(indices)].sort((a, b) => a - b);
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(
  difficulty: Difficulty,
  seed?: number
): ZipGeneratedPuzzle {
  const size = ZIP_SIZE_CONFIG[difficulty];
  // Allow up to 20 full retries with different seeds before giving up
  const MAX_RETRIES = 20;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const actualSeed = (seed !== undefined ? seed + attempt * 1000003 : Math.floor(Math.random() * 2 ** 31));
    const rng = createRng(actualSeed);

    const path = generateHamiltonianPath(size, rng);
    if (!path) continue;

    const waypointIndices = placeWaypoints(path, size, rng);
    const grid: ZipCell[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({ number: null }))
    );

    waypointIndices.forEach((pathIdx, waypointNum) => {
      const cell = path[pathIdx];
      grid[cell.row][cell.col] = { number: waypointNum + 1 };
    });

    return {
      puzzleData: { size, grid },
      solution: { path },
      difficulty,
      seed: actualSeed,
    };
  }

  // Should never reach here, but TypeScript needs a return
  throw new Error(`[ZipEngine] Failed to generate a ${difficulty} puzzle after ${MAX_RETRIES} attempts`);
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateZipPath(
  currentPath: Array<{ row: number; col: number }>,
  puzzleData: ZipPuzzleData
): { valid: boolean; reason?: string } {
  const { size, grid } = puzzleData;
  const visited = new Set<string>();

  let lastWaypointNumber = 0;

  for (let i = 0; i < currentPath.length; i++) {
    const cell = currentPath[i];
    const key = `${cell.row},${cell.col}`;

    if (cell.row < 0 || cell.row >= size || cell.col < 0 || cell.col >= size) {
      return { valid: false, reason: 'Out of bounds' };
    }
    if (visited.has(key)) {
      return { valid: false, reason: 'Cell visited twice' };
    }
    visited.add(key);

    if (i > 0) {
      const prev = currentPath[i - 1];
      const dr = Math.abs(cell.row - prev.row);
      const dc = Math.abs(cell.col - prev.col);
      if (dr + dc !== 1) {
        return { valid: false, reason: 'Non-adjacent cells' };
      }
    }

    const num = grid[cell.row][cell.col].number;
    if (num !== null) {
      if (num !== lastWaypointNumber + 1) {
        return {
          valid: false,
          reason: `Waypoints out of order: expected ${lastWaypointNumber + 1}, got ${num}`,
        };
      }
      lastWaypointNumber = num;
    }
  }

  return { valid: true };
}

export function isZipSolved(
  currentPath: Array<{ row: number; col: number }>,
  puzzleData: ZipPuzzleData
): boolean {
  const { size } = puzzleData;
  if (currentPath.length !== size * size) return false;
  const { valid } = validateZipPath(currentPath, puzzleData);
  return valid;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: ZipGameState,
  solution: ZipSolution
): ZipHintResult | null {
  const { currentPath } = gameState;
  const nextIndex = currentPath.length;
  if (nextIndex >= solution.path.length) return null;

  const nextCell = solution.path[nextIndex];
  const revealCount = Math.min(2, solution.path.length - nextIndex);
  const revealedPath = [
    ...currentPath,
    ...solution.path.slice(nextIndex, nextIndex + revealCount),
  ];

  return {
    description: `Continue the path to row ${nextCell.row + 1}, column ${nextCell.col + 1}.`,
    revealedState: { currentPath: revealedPath, isDrawing: false },
    position: nextCell,
  };
}