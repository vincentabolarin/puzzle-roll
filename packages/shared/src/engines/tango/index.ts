import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

export type TangoSymbol = 'sun' | 'moon' | 'empty';
export type TangoConstraint = '=' | 'x' | null;

export interface TangoConstraints {
  horizontal: Record<string, TangoConstraint>;
  vertical: Record<string, TangoConstraint>;
}

export interface TangoPuzzleData {
  size: number;
  given: TangoSymbol[][];
  constraints: TangoConstraints;
}

export interface TangoSolution {
  grid: TangoSymbol[][];
}

export interface TangoGameState {
  board: TangoSymbol[][];
}

export type TangoGeneratedPuzzle = GeneratedPuzzle<TangoPuzzleData, TangoSolution>;
export type TangoHintResult = HintResult<TangoGameState>;

export const TANGO_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 4,
  [Difficulty.MEDIUM]: 6,
  [Difficulty.HARD]: 8,
  [Difficulty.EXPERT]: 10,
};

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

function generateSolution(
  size: number,
  constraints: TangoConstraints,
  rng: () => number
): TangoSymbol[][] | null {
  const grid: TangoSymbol[][] = Array.from({ length: size }, () => Array(size).fill('empty'));
  const half = size / 2;

  function countInRow(r: number, sym: TangoSymbol): number {
    return grid[r].filter((v) => v === sym).length;
  }
  function countInCol(c: number, sym: TangoSymbol): number {
    return grid.map((row) => row[c]).filter((v) => v === sym).length;
  }

  function canPlace(r: number, c: number, sym: TangoSymbol): boolean {
    if (countInRow(r, sym) >= half) return false;
    if (countInCol(c, sym) >= half) return false;
    if (c >= 2 && grid[r][c - 1] === sym && grid[r][c - 2] === sym) return false;
    if (r >= 2 && grid[r - 1][c] === sym && grid[r - 2][c] === sym) return false;
    if (c >= 1 && c < size - 1 && grid[r][c - 1] === sym && grid[r][c + 1] === sym) return false;
    if (r >= 1 && r < size - 1 && grid[r - 1][c] === sym && grid[r + 1][c] === sym) return false;
    // Check horizontal constraints
    const hLeft = `${r},${c - 1}`;
    if (c > 0 && constraints.horizontal[hLeft]) {
      const nb = grid[r][c - 1];
      if (nb !== 'empty') {
        if (constraints.horizontal[hLeft] === '=' && nb !== sym) return false;
        if (constraints.horizontal[hLeft] === 'x' && nb === sym) return false;
      }
    }
    const hRight = `${r},${c}`;
    if (c < size - 1 && constraints.horizontal[hRight]) {
      const nb = grid[r][c + 1];
      if (nb !== 'empty') {
        if (constraints.horizontal[hRight] === '=' && nb !== sym) return false;
        if (constraints.horizontal[hRight] === 'x' && nb === sym) return false;
      }
    }
    // Check vertical constraints
    const vUp = `${r - 1},${c}`;
    if (r > 0 && constraints.vertical[vUp]) {
      const nb = grid[r - 1][c];
      if (nb !== 'empty') {
        if (constraints.vertical[vUp] === '=' && nb !== sym) return false;
        if (constraints.vertical[vUp] === 'x' && nb === sym) return false;
      }
    }
    const vDown = `${r},${c}`;
    if (r < size - 1 && constraints.vertical[vDown]) {
      const nb = grid[r + 1][c];
      if (nb !== 'empty') {
        if (constraints.vertical[vDown] === '=' && nb !== sym) return false;
        if (constraints.vertical[vDown] === 'x' && nb === sym) return false;
      }
    }
    return true;
  }

  function backtrack(pos: number): boolean {
    if (pos === size * size) return true;
    const r = Math.floor(pos / size);
    const c = pos % size;
    const symbols: TangoSymbol[] = rng() > 0.5 ? ['sun', 'moon'] : ['moon', 'sun'];
    for (const sym of symbols) {
      if (canPlace(r, c, sym)) {
        grid[r][c] = sym;
        if (backtrack(pos + 1)) return true;
        grid[r][c] = 'empty';
      }
    }
    return false;
  }

  return backtrack(0) ? grid : null;
}

function generateConstraints(
  size: number,
  solution: TangoSymbol[][],
  rng: () => number
): TangoConstraints {
  const horizontal: Record<string, TangoConstraint> = {};
  const vertical: Record<string, TangoConstraint> = {};
  const chance = 0.3;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 1; c++) {
      if (rng() < chance) {
        horizontal[`${r},${c}`] = solution[r][c] === solution[r][c + 1] ? '=' : 'x';
      }
    }
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size; c++) {
      if (rng() < chance) {
        vertical[`${r},${c}`] = solution[r][c] === solution[r + 1][c] ? '=' : 'x';
      }
    }
  }
  return { horizontal, vertical };
}

function countTangoSolutions(
  size: number,
  given: TangoSymbol[][],
  constraints: TangoConstraints,
  limit: number
): number {
  const grid: TangoSymbol[][] = given.map((row) => [...row]);
  const half = size / 2;

  function countInRow(r: number, sym: TangoSymbol) {
    return grid[r].filter((v) => v === sym).length;
  }
  function countInCol(c: number, sym: TangoSymbol) {
    return grid.map((row) => row[c]).filter((v) => v === sym).length;
  }

  function canPlace(r: number, c: number, sym: TangoSymbol): boolean {
    if (countInRow(r, sym) >= half) return false;
    if (countInCol(c, sym) >= half) return false;
    if (c >= 2 && grid[r][c - 1] === sym && grid[r][c - 2] === sym) return false;
    if (r >= 2 && grid[r - 1][c] === sym && grid[r - 2][c] === sym) return false;
    const hLeft = `${r},${c - 1}`;
    if (c > 0 && constraints.horizontal[hLeft]) {
      const nb = grid[r][c - 1];
      if (nb !== 'empty') {
        if (constraints.horizontal[hLeft] === '=' && nb !== sym) return false;
        if (constraints.horizontal[hLeft] === 'x' && nb === sym) return false;
      }
    }
    const vUp = `${r - 1},${c}`;
    if (r > 0 && constraints.vertical[vUp]) {
      const nb = grid[r - 1][c];
      if (nb !== 'empty') {
        if (constraints.vertical[vUp] === '=' && nb !== sym) return false;
        if (constraints.vertical[vUp] === 'x' && nb === sym) return false;
      }
    }
    return true;
  }

  let count = 0;
  let nodes = 0;
  const NODE_BUDGET = size <= 6 ? 20000 : size <= 8 ? 100000 : 400000;

  function backtrack(pos: number): void {
    if (count >= limit || nodes > NODE_BUDGET) return;
    nodes++;
    if (pos === size * size) {
      count++;
      return;
    }
    const r = Math.floor(pos / size);
    const c = pos % size;
    if (grid[r][c] !== 'empty') {
      backtrack(pos + 1);
      return;
    }
    for (const sym of ['sun', 'moon'] as TangoSymbol[]) {
      if (canPlace(r, c, sym)) {
        grid[r][c] = sym;
        backtrack(pos + 1);
        grid[r][c] = 'empty';
        if (count >= limit || nodes > NODE_BUDGET) return;
      }
    }
  }

  backtrack(0);
  return count;
}

export function generatePuzzle(difficulty: Difficulty, seed?: number): TangoGeneratedPuzzle {
  const MAX_ATTEMPTS = 300;

  // Reveal rates raised significantly — expert was 5% (5/100 cells) which almost
  // never produces a uniquely-solvable puzzle. These rates are the minimum needed
  // to have the uniqueness check pass reliably within the attempt budget.
  const revealRate: Record<Difficulty, number> = {
    [Difficulty.EASY]: 0.55,   // 4×4 = ~9 cells given
    [Difficulty.MEDIUM]: 0.40, // 6×6 = ~15 cells given
    [Difficulty.HARD]: 0.28,   // 8×8 = ~18 cells given
    [Difficulty.EXPERT]: 0.20, // 10×10 = ~20 cells given
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined ? seed + attempt * 1000003 : Math.floor(Math.random() * 2 ** 31);

    const rng = createRng(actualSeed);
    const size = TANGO_SIZE_CONFIG[difficulty];

    const emptyGrid: TangoSymbol[][] = Array.from({ length: size }, () =>
      Array(size).fill('empty')
    );
    const constraints = generateConstraints(size, emptyGrid, rng);
    const solution = generateSolution(size, constraints, rng);
    if (!solution) continue;

    const realConstraints = generateConstraints(size, solution, rng);
    const verifiedSolution = generateSolution(size, realConstraints, rng);
    if (!verifiedSolution) continue;

    const revealCount = Math.max(
      size, // always reveal at least `size` cells
      Math.floor(size * size * revealRate[difficulty])
    );

    const positions = shuffle(
      Array.from({ length: size * size }, (_, i) => i),
      rng
    );

    const given: TangoSymbol[][] = Array.from({ length: size }, () =>
      Array(size).fill('empty')
    );

    for (let i = 0; i < revealCount; i++) {
      const pos = positions[i];
      const r = Math.floor(pos / size);
      const c = pos % size;
      given[r][c] = verifiedSolution[r][c];
    }

    if (countTangoSolutions(size, given, realConstraints, 2) !== 1) continue;

    return {
      puzzleData: { size, given, constraints: realConstraints },
      solution: { grid: verifiedSolution },
      difficulty,
      seed: actualSeed,
    };
  }

  throw new Error(`[TangoEngine] Failed after ${MAX_ATTEMPTS} attempts for ${difficulty}`);
}

export function validateTangoBoard(
  board: TangoSymbol[][],
  size: number,
  constraints: TangoConstraints
): { conflicts: Array<{ row: number; col: number }> } {
  const conflictSet = new Set<string>();
  const half = size / 2;

  for (let r = 0; r < size; r++) {
    let suns = 0, moons = 0;
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 'sun') suns++;
      if (board[r][c] === 'moon') moons++;
    }
    if (suns > half || moons > half) {
      for (let c = 0; c < size; c++) conflictSet.add(`${r},${c}`);
    }
    for (let c = 0; c <= size - 3; c++) {
      if (board[r][c] !== 'empty' && board[r][c] === board[r][c + 1] && board[r][c] === board[r][c + 2]) {
        conflictSet.add(`${r},${c}`);
        conflictSet.add(`${r},${c + 1}`);
        conflictSet.add(`${r},${c + 2}`);
      }
    }
  }

  for (let c = 0; c < size; c++) {
    let suns = 0, moons = 0;
    for (let r = 0; r < size; r++) {
      if (board[r][c] === 'sun') suns++;
      if (board[r][c] === 'moon') moons++;
    }
    if (suns > half || moons > half) {
      for (let r = 0; r < size; r++) conflictSet.add(`${r},${c}`);
    }
    for (let r = 0; r <= size - 3; r++) {
      if (board[r][c] !== 'empty' && board[r][c] === board[r + 1][c] && board[r][c] === board[r + 2][c]) {
        conflictSet.add(`${r},${c}`);
        conflictSet.add(`${r + 1},${c}`);
        conflictSet.add(`${r + 2},${c}`);
      }
    }
  }

  for (const [key, con] of Object.entries(constraints.horizontal)) {
    if (!con) continue;
    const [r, c] = key.split(',').map(Number);
    if (c + 1 >= size) continue;
    const a = board[r][c], b = board[r][c + 1];
    if (a === 'empty' || b === 'empty') continue;
    if (con === '=' && a !== b) { conflictSet.add(`${r},${c}`); conflictSet.add(`${r},${c + 1}`); }
    if (con === 'x' && a === b) { conflictSet.add(`${r},${c}`); conflictSet.add(`${r},${c + 1}`); }
  }

  for (const [key, con] of Object.entries(constraints.vertical)) {
    if (!con) continue;
    const [r, c] = key.split(',').map(Number);
    if (r + 1 >= size) continue;
    const a = board[r][c], b = board[r + 1][c];
    if (a === 'empty' || b === 'empty') continue;
    if (con === '=' && a !== b) { conflictSet.add(`${r},${c}`); conflictSet.add(`${r + 1},${c}`); }
    if (con === 'x' && a === b) { conflictSet.add(`${r},${c}`); conflictSet.add(`${r + 1},${c}`); }
  }

  return {
    conflicts: Array.from(conflictSet).map((k) => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isTangoSolved(board: TangoSymbol[][], size: number, solution: TangoSolution): boolean {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== solution.grid[r][c]) return false;
    }
  }
  return true;
}

export function getHint(
  gameState: TangoGameState,
  solution: TangoSolution,
  given: TangoSymbol[][]
): TangoHintResult | null {
  const { board } = gameState;
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (given[r][c] === 'empty' && board[r][c] === 'empty') {
        const newBoard = board.map((row) => [...row]);
        newBoard[r][c] = solution.grid[r][c];
        return {
          description: `Cell (${r + 1},${c + 1}) should be ${solution.grid[r][c] === 'sun' ? '☀' : '☾'}.`,
          revealedState: { board: newBoard },
          position: { row: r, col: c },
        };
      }
    }
  }
  return null;
}

export function cycleTangoSymbol(current: TangoSymbol): TangoSymbol {
  if (current === 'empty') return 'sun';
  if (current === 'sun') return 'moon';
  return 'empty';
}