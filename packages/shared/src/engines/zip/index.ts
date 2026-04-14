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
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Generate a Hamiltonian path on an N×N grid ───────────────────────────────

function generateHamiltonianPath(
  size: number,
  rng: () => number
): Array<{ row: number; col: number }> | null {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const path: Array<{ row: number; col: number }> = [];
  const dirs = shuffle([[-1,0],[1,0],[0,-1],[0,1]], rng);

  function dfs(row: number, col: number): boolean {
    visited[row][col] = true;
    path.push({ row, col });
    if (path.length === size * size) return true;

    const shuffledDirs = shuffle([...dirs], rng);
    for (const [dr, dc] of shuffledDirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc]) {
        if (dfs(nr, nc)) return true;
      }
    }

    visited[row][col] = false;
    path.pop();
    return false;
  }

  const startRow = Math.floor(rng() * size);
  const startCol = Math.floor(rng() * size);
  if (dfs(startRow, startCol)) return path;
  return null;
}

// ─── Place numbered waypoints along the path ─────────────────────────────────

function placeWaypoints(
  path: Array<{ row: number; col: number }>,
  size: number,
  rng: () => number
): number[] {
  const total = size * size;
  // Always include first and last as waypoints 1 and N
  // Place intermediate waypoints at regular-ish intervals with some jitter
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

export function generatePuzzle(difficulty: Difficulty, seed?: number): ZipGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const size = ZIP_SIZE_CONFIG[difficulty];

  let path: Array<{ row: number; col: number }> | null = null;
  let attempts = 0;

  while (!path && attempts < 50) {
    path = generateHamiltonianPath(size, rng);
    attempts++;
  }

  if (!path) return generatePuzzle(difficulty, actualSeed + 1);

  const waypointIndices = placeWaypoints(path, size, rng);
  const grid: ZipCell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ number: null }))
  );

  waypointIndices.forEach((pathIdx, waypointNum) => {
    const cell = path![pathIdx];
    grid[cell.row][cell.col] = { number: waypointNum + 1 };
  });

  return {
    puzzleData: { size, grid },
    solution: { path },
    difficulty,
    seed: actualSeed,
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateZipPath(
  currentPath: Array<{ row: number; col: number }>,
  puzzleData: ZipPuzzleData
): { valid: boolean; reason?: string } {
  const { size, grid } = puzzleData;
  const visited = new Set<string>();

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

    // Check adjacency
    if (i > 0) {
      const prev = currentPath[i - 1];
      const dr = Math.abs(cell.row - prev.row);
      const dc = Math.abs(cell.col - prev.col);
      if (dr + dc !== 1) {
        return { valid: false, reason: 'Non-adjacent cells' };
      }
    }
  }

  // Check waypoint order is respected
  let lastWaypointNumber = 0;
  for (const cell of currentPath) {
    const num = grid[cell.row][cell.col].number;
    if (num !== null) {
      if (num !== lastWaypointNumber + 1) {
        return { valid: false, reason: `Waypoints out of order: expected ${lastWaypointNumber + 1}, got ${num}` };
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
  // Reveal the next two correct cells
  const revealCount = Math.min(2, solution.path.length - nextIndex);
  const revealedPath = [...currentPath, ...solution.path.slice(nextIndex, nextIndex + revealCount)];

  return {
    description: `Continue the path to row ${nextCell.row + 1}, column ${nextCell.col + 1}.`,
    revealedState: { currentPath: revealedPath, isDrawing: false },
    position: nextCell,
  };
}
