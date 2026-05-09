import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZipCell {
  number: number | null; // null = plain cell, 1..N = numbered waypoint
}

/** A wall lives between two adjacent cells. Key format: "r1,c1-r2,c2" with r1<=r2, c1<=c2. */
export type ZipWalls = Set<string>;

export interface ZipPuzzleData {
  size: number;
  grid: ZipCell[][];
  /** Walls between cells. Each entry is "r1,c1-r2,c2" where the two cells are adjacent. */
  walls: string[];
}

export interface ZipSolution {
  path: Array<{ row: number; col: number }>;
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

/** Build a canonical wall key from two adjacent cells. */
export function wallKey(r1: number, c1: number, r2: number, c2: number): string {
  // Always put the smaller-row (or smaller-col for same row) cell first
  if (r1 < r2 || (r1 === r2 && c1 < c2)) return `${r1},${c1}-${r2},${c2}`;
  return `${r2},${c2}-${r1},${c1}`;
}

/** Returns true if there is a wall blocking movement between the two adjacent cells. */
export function hasWall(walls: string[], r1: number, c1: number, r2: number, c2: number): boolean {
  const key = wallKey(r1, c1, r2, c2);
  return walls.includes(key);
}

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

// ─── Warnsdorff's heuristic ───────────────────────────────────────────────────

function getNeighbours(
  row: number,
  col: number,
  size: number,
  visited: boolean[][],
  walls: string[]
): Array<{ row: number; col: number }> {
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const result: Array<{ row: number; col: number }> = [];
  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc] && !hasWall(walls, row, col, nr, nc)) {
      result.push({ row: nr, col: nc });
    }
  }
  return result;
}

function warnsdorffDegree(row: number, col: number, size: number, visited: boolean[][], walls: string[]): number {
  return getNeighbours(row, col, size, visited, walls).length;
}

function generateHamiltonianPath(
  size: number,
  rng: () => number,
  walls: string[]
): Array<{ row: number; col: number }> | null {
  const total = size * size;
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
    const neighbours = getNeighbours(row, col, size, visited, walls);
    const sorted = neighbours
      .map(n => ({ ...n, degree: warnsdorffDegree(n.row, n.col, size, visited, walls) }))
      .sort((a, b) => a.degree !== b.degree ? a.degree - b.degree : rng() - 0.5);
    for (const next of sorted) {
      if (dfs(next.row, next.col)) return true;
    }
    visited[row][col] = false;
    path.pop();
    return false;
  }

  const starts: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) starts.push({ row: r, col: c });
  const shuffledStarts = shuffle(starts, rng);

  for (const start of shuffledStarts) {
    nodesVisited = 0;
    for (let r = 0; r < size; r++) visited[r].fill(false);
    path.length = 0;
    if (dfs(start.row, start.col)) return path;
  }
  return null;
}

// ─── Wall generation ──────────────────────────────────────────────────────────
// Walls are placed on edges that are NOT used by the solution path, to add
// visual complexity without blocking the intended route.

function generateWalls(
  size: number,
  path: Array<{ row: number; col: number }>,
  rng: () => number
): string[] {
  // Build set of edges used by the solution path
  const pathEdges = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const { row: r1, col: c1 } = path[i];
    const { row: r2, col: c2 } = path[i + 1];
    pathEdges.add(wallKey(r1, c1, r2, c2));
  }

  // Collect all grid edges not on the path
  const candidates: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c + 1 < size) {
        const k = wallKey(r, c, r, c + 1);
        if (!pathEdges.has(k)) candidates.push(k);
      }
      if (r + 1 < size) {
        const k = wallKey(r, c, r + 1, c);
        if (!pathEdges.has(k)) candidates.push(k);
      }
    }
  }

  // Place walls on ~25% of non-path edges
  const shuffled = shuffle(candidates, rng);
  const wallCount = Math.floor(shuffled.length * 0.25);
  return shuffled.slice(0, wallCount);
}

// ─── Waypoints ────────────────────────────────────────────────────────────────

function placeWaypoints(
  path: Array<{ row: number; col: number }>,
  size: number,
  rng: () => number
): number[] {
  const total = path.length;
  const waypointCount = size;
  const step = (total - 1) / (waypointCount - 1);
  const indices: number[] = [0];
  for (let i = 1; i < waypointCount - 1; i++) {
    const base = Math.round(i * step);
    const jitter = Math.floor((rng() - 0.5) * step * 0.4);
    const idx = Math.max(1, Math.min(total - 2, base + jitter));
    indices.push(idx);
  }
  indices.push(total - 1);
  return [...new Set(indices)].sort((a, b) => a - b);
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): ZipGeneratedPuzzle {
  const size = ZIP_SIZE_CONFIG[difficulty];
  const MAX_RETRIES = 20;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const actualSeed = seed !== undefined ? seed + attempt * 1000003 : Math.floor(Math.random() * 2 ** 31);
    const rng = createRng(actualSeed);

    // First pass: generate path without walls
    const path = generateHamiltonianPath(size, rng, []);
    if (!path) continue;

    const walls = generateWalls(size, path, rng);

    // Verify path still works with the generated walls (it always should since
    // walls only block non-path edges, but let's be safe)
    let pathValid = true;
    for (let i = 0; i < path.length - 1; i++) {
      if (hasWall(walls, path[i].row, path[i].col, path[i+1].row, path[i+1].col)) {
        pathValid = false;
        break;
      }
    }
    if (!pathValid) continue;

    const waypointIndices = placeWaypoints(path, size, rng);
    const grid: ZipCell[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({ number: null }))
    );
    waypointIndices.forEach((pathIdx, waypointNum) => {
      const cell = path[pathIdx];
      grid[cell.row][cell.col] = { number: waypointNum + 1 };
    });

    return { puzzleData: { size, grid, walls }, solution: { path }, difficulty, seed: actualSeed };
  }

  throw new Error(`[ZipEngine] Failed to generate a ${difficulty} puzzle after ${MAX_RETRIES} attempts`);
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateZipPath(
  currentPath: Array<{ row: number; col: number }>,
  puzzleData: ZipPuzzleData
): { valid: boolean; reason?: string } {
  const { size, grid, walls } = puzzleData;
  const visited = new Set<string>();
  let lastWaypointNumber = 0;

  for (let i = 0; i < currentPath.length; i++) {
    const cell = currentPath[i];
    const key = `${cell.row},${cell.col}`;
    if (cell.row < 0 || cell.row >= size || cell.col < 0 || cell.col >= size)
      return { valid: false, reason: 'Out of bounds' };
    if (visited.has(key)) return { valid: false, reason: 'Cell visited twice' };
    visited.add(key);
    if (i > 0) {
      const prev = currentPath[i - 1];
      const dr = Math.abs(cell.row - prev.row), dc = Math.abs(cell.col - prev.col);
      if (dr + dc !== 1) return { valid: false, reason: 'Non-adjacent cells' };
      if (hasWall(walls, prev.row, prev.col, cell.row, cell.col))
        return { valid: false, reason: 'Path crosses a wall' };
    }
    const num = grid[cell.row][cell.col].number;
    if (num !== null) {
      if (num !== lastWaypointNumber + 1) return { valid: false, reason: `Waypoints out of order: expected ${lastWaypointNumber + 1}, got ${num}` };
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
  return validateZipPath(currentPath, puzzleData).valid;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(gameState: ZipGameState, solution: ZipSolution): ZipHintResult | null {
  const { currentPath } = gameState;
  const nextIndex = currentPath.length;
  if (nextIndex >= solution.path.length) return null;
  const nextCell = solution.path[nextIndex];
  const revealCount = Math.min(2, solution.path.length - nextIndex);
  const revealedPath = [...currentPath, ...solution.path.slice(nextIndex, nextIndex + revealCount)];
  return {
    description: `Continue the path to row ${nextCell.row + 1}, column ${nextCell.col + 1}.`,
    revealedState: { currentPath: revealedPath, isDrawing: false },
    position: nextCell,
  };
}