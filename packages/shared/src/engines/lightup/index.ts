import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LightUpCellType = 'white' | 'black';
export type LightUpCellState = 'empty' | 'bulb' | 'lit' | 'conflict';

export interface LightUpCell {
  type: LightUpCellType;
  adjacentBulbClue: number | null; // null = black with no number
  state: LightUpCellState;
  isLit: boolean;
}

export interface LightUpPuzzleData {
  rows: number;
  cols: number;
  grid: Array<Array<{ type: LightUpCellType; adjacentBulbClue: number | null }>>;
}

export interface LightUpSolution {
  bulbPositions: Array<{ row: number; col: number }>;
}

export interface LightUpGameState {
  board: LightUpCell[][];
}

export type LightUpGeneratedPuzzle = GeneratedPuzzle<LightUpPuzzleData, LightUpSolution>;
export type LightUpHintResult = HintResult<LightUpGameState>;

export const LIGHTUP_SIZE_CONFIG: Record<Difficulty, { rows: number; cols: number }> = {
  [Difficulty.EASY]: { rows: 7, cols: 7 },
  [Difficulty.MEDIUM]: { rows: 10, cols: 10 },
  [Difficulty.HARD]: { rows: 14, cols: 14 },
  [Difficulty.EXPERT]: { rows: 18, cols: 18 },
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

// ─── Compute illumination for a given bulb placement ─────────────────────────

function computeLit(
  bulbs: Set<string>,
  blackCells: Set<string>,
  rows: number,
  cols: number
): Set<string> {
  const lit = new Set<string>();

  for (const key of bulbs) {
    const [r, c] = key.split(',').map(Number);
    lit.add(key);
    // Cast rays in 4 directions
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const nk = `${nr},${nc}`;
        if (blackCells.has(nk)) break;
        lit.add(nk);
        nr += dr; nc += dc;
      }
    }
  }
  return lit;
}

// ─── Check if two bulbs illuminate each other ────────────────────────────────

function bulbsConflict(
  r1: number, c1: number, r2: number, c2: number,
  blackCells: Set<string>
): boolean {
  if (r1 !== r2 && c1 !== c2) return false;
  const [dr, dc] = r1 === r2 ? [0, 1] : [1, 0];
  const [minR, minC] = [Math.min(r1, r2), Math.min(c1, c2)];
  const [maxR, maxC] = [Math.max(r1, r2), Math.max(c1, c2)];
  for (let r = minR, c = minC; r <= maxR && c <= maxC; r += dr, c += dc) {
    if ((r !== r1 || c !== c1) && (r !== r2 || c !== c2)) {
      if (blackCells.has(`${r},${c}`)) return false;
    }
  }
  return true;
}

// ─── Place bulbs via backtracking ─────────────────────────────────────────────

function solveLightUp(
  whiteCells: Array<[number, number]>,
  blackCells: Set<string>,
  clues: Map<string, number>,
  rows: number,
  cols: number,
  limit: number
): Array<Set<string>> {
  const solutions: Array<Set<string>> = [];
  const bulbs = new Set<string>();

  function countAdjacentBulbs(r: number, c: number): number {
    let count = 0;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      if (bulbs.has(`${r+dr},${c+dc}`)) count++;
    }
    return count;
  }

  function cluesConsistent(): boolean {
    for (const [key, clue] of clues) {
      const [r, c] = key.split(',').map(Number);
      const adj = countAdjacentBulbs(r, c);
      if (adj > clue) return false;
    }
    return true;
  }

  function allIlluminated(): boolean {
    const lit = computeLit(bulbs, blackCells, rows, cols);
    return whiteCells.every(([r, c]) => lit.has(`${r},${c}`));
  }

  function noConflicts(): boolean {
    const arr = Array.from(bulbs).map(k => k.split(',').map(Number) as [number, number]);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (bulbsConflict(arr[i][0], arr[i][1], arr[j][0], arr[j][1], blackCells)) return false;
      }
    }
    return true;
  }

  function backtrack(idx: number): void {
    if (solutions.length >= limit) return;

    if (!cluesConsistent()) return;

    if (idx === whiteCells.length) {
      if (allIlluminated() && noConflicts()) {
        // Verify all clues are exactly met
        for (const [key, clue] of clues) {
          const [r, c] = key.split(',').map(Number);
          if (countAdjacentBulbs(r, c) !== clue) return;
        }
        solutions.push(new Set(bulbs));
      }
      return;
    }

    const [r, c] = whiteCells[idx];

    // Try placing bulb
    bulbs.add(`${r},${c}`);
    backtrack(idx + 1);
    bulbs.delete(`${r},${c}`);

    // Try not placing
    backtrack(idx + 1);
  }

  backtrack(0);
  return solutions;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): LightUpGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const { rows, cols } = LIGHTUP_SIZE_CONFIG[difficulty];

  // Place black cells randomly (~20% of grid)
  const blackRate = 0.18;
  const isBlack: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rng() < blackRate)
  );

  const blackCells = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlack[r][c]) blackCells.add(`${r},${c}`);
    }
  }

  const whiteCells: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isBlack[r][c]) whiteCells.push([r, c]);
    }
  }

  // Generate a valid bulb placement
  const shuffledWhite = shuffle([...whiteCells], rng);
  const bulbs = new Set<string>();

  // Greedy placement: illuminate as many unlit cells as possible
  const unlit = new Set(whiteCells.map(([r, c]) => `${r},${c}`));

  for (const [r, c] of shuffledWhite) {
    if (!unlit.size) break;
    const key = `${r},${c}`;
    if (!unlit.has(key)) continue;

    // Check no conflict with existing bulbs
    let conflict = false;
    for (const bk of bulbs) {
      const [br, bc] = bk.split(',').map(Number);
      if (bulbsConflict(r, c, br, bc, blackCells)) { conflict = true; break; }
    }
    if (conflict) continue;

    bulbs.add(key);
    const lit = computeLit(new Set([key]), blackCells, rows, cols);
    for (const lk of lit) unlit.delete(lk);
  }

  if (unlit.size > 0) return generatePuzzle(difficulty, actualSeed + 1);

  // Compute clues for black cells (assign number clues to ~40% of black cells)
  const clues = new Map<string, number>();
  for (const bk of blackCells) {
    if (rng() < 0.4) {
      const [r, c] = bk.split(',').map(Number);
      let adj = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (bulbs.has(`${r+dr},${c+dc}`)) adj++;
      }
      clues.set(bk, adj);
    }
  }

  // Build puzzle grid
  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      type: (isBlack[r][c] ? 'black' : 'white') as LightUpCellType,
      adjacentBulbClue: clues.get(`${r},${c}`) ?? null,
    }))
  );

  const bulbPositions = Array.from(bulbs).map(k => {
    const [r, c] = k.split(',').map(Number);
    return { row: r, col: c };
  });

  return {
    puzzleData: { rows, cols, grid },
    solution: { bulbPositions },
    difficulty,
    seed: actualSeed,
  };
}

// ─── Compute board illumination state ────────────────────────────────────────

export function computeBoardState(
  board: LightUpCell[][],
  rows: number,
  cols: number
): LightUpCell[][] {
  const blackCells = new Set<string>();
  const bulbs = new Set<string>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].type === 'black') blackCells.add(`${r},${c}`);
      else if (board[r][c].state === 'bulb' || board[r][c].state === 'conflict') bulbs.add(`${r},${c}`);
    }
  }

  const lit = computeLit(bulbs, blackCells, rows, cols);

  const newBoard = board.map(row => row.map(cell => ({ ...cell })));

  // Reset illumination
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = newBoard[r][c];
      if (cell.type === 'white') {
        if (cell.state !== 'bulb' && cell.state !== 'conflict') {
          cell.state = lit.has(`${r},${c}`) ? 'lit' : 'empty';
        }
        cell.isLit = lit.has(`${r},${c}`);
      }
    }
  }

  // Mark conflicting bulbs
  const bulbArr = Array.from(bulbs).map(k => k.split(',').map(Number) as [number, number]);
  for (let i = 0; i < bulbArr.length; i++) {
    for (let j = i + 1; j < bulbArr.length; j++) {
      if (bulbsConflict(bulbArr[i][0], bulbArr[i][1], bulbArr[j][0], bulbArr[j][1], blackCells)) {
        newBoard[bulbArr[i][0]][bulbArr[i][1]].state = 'conflict';
        newBoard[bulbArr[j][0]][bulbArr[j][1]].state = 'conflict';
      }
    }
  }

  return newBoard;
}

export function isLightUpSolved(board: LightUpCell[][], rows: number, cols: number, puzzleData: LightUpPuzzleData): boolean {
  // All white cells lit, no conflicts, clues satisfied
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.type === 'white') {
        if (!cell.isLit) return false;
        if (cell.state === 'conflict') return false;
      }
    }
  }
  // Check number clues
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = puzzleData.grid[r][c].adjacentBulbClue;
      if (clue === null) continue;
      let adj = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (board[nr][nc].state === 'bulb') adj++;
        }
      }
      if (adj !== clue) return false;
    }
  }
  return true;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: LightUpGameState,
  solution: LightUpSolution
): LightUpHintResult | null {
  for (const { row, col } of solution.bulbPositions) {
    if (gameState.board[row][col].state !== 'bulb') {
      const newBoard = gameState.board.map((r, ri) =>
        r.map((c, ci): LightUpCell => {
          if (ri === row && ci === col) return { ...c, state: 'bulb' };
          return { ...c };
        })
      );
      return {
        description: `Place a bulb at row ${row + 1}, column ${col + 1}.`,
        revealedState: { board: newBoard },
        position: { row, col },
      };
    }
  }
  return null;
}
