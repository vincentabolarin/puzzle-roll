import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KakuroDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface KakuroBlackCell {
  type: 'black';
  acrossClue: number | null;
  downClue: number | null;
}

export interface KakuroWhiteCell {
  type: 'white';
  value: KakuroDigit | 0;
  isGiven: boolean;
}

export type KakuroCell = KakuroBlackCell | KakuroWhiteCell;

export interface KakuroPuzzleData {
  size: number;
  grid: KakuroCell[][];
}

export interface KakuroSolution {
  values: Array<{ row: number; col: number; value: KakuroDigit }>;
}

export interface KakuroGameState {
  board: KakuroCell[][];
  selectedCell: { row: number; col: number } | null;
}

export type KakuroGeneratedPuzzle = GeneratedPuzzle<KakuroPuzzleData, KakuroSolution>;
export type KakuroHintResult = HintResult<KakuroGameState>;

export const KAKURO_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 6,
  [Difficulty.MEDIUM]: 9,
  [Difficulty.HARD]: 12,
  [Difficulty.EXPERT]: 15,
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

// ─── Build a Kakuro grid layout ───────────────────────────────────────────────
// Row 0 and col 0 are always black (clue header row/col).
// Interior black cells split runs. Every white cell must belong to
// an across run (length ≥ 2) AND a down run (length ≥ 2).

function buildLayout(size: number, rng: () => number): boolean[][] {
  // true = white, false = black
  const white: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => r > 0 && c > 0)
  );

  // Scatter interior black cells (~18% of interior)
  for (let r = 1; r < size; r++) {
    for (let c = 1; c < size; c++) {
      if (rng() < 0.18) white[r][c] = false;
    }
  }

  // Fix: ensure every white cell has an across run of length ≥ 2
  // and a down run of length ≥ 2. Eliminate isolated cells.
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 1; r < size; r++) {
      for (let c = 1; c < size; c++) {
        if (!white[r][c]) continue;

        // Count across run length (including this cell)
        let acrossLen = 0;
        for (let cc = c; cc < size && white[r][cc]; cc++) acrossLen++;
        let acrossLeft = 0;
        for (let cc = c - 1; cc >= 1 && white[r][cc]; cc--) acrossLeft++;

        // Count down run length (including this cell)
        let downLen = 0;
        for (let rr = r; rr < size && white[rr][c]; rr++) downLen++;
        let downUp = 0;
        for (let rr = r - 1; rr >= 1 && white[rr][c]; rr--) downUp++;

        const totalAcross = acrossLeft + acrossLen;
        const totalDown = downUp + downLen;

        if (totalAcross < 2 || totalDown < 2) {
          white[r][c] = false;
          changed = true;
        }
      }
    }
  }

  return white;
}

// ─── Fill grid with valid digits using backtracking ───────────────────────────

interface Run {
  cells: Array<[number, number]>;
}

function buildRuns(white: boolean[][], size: number): { across: Run[][]; down: Run[][] } {
  // across[r][c] = the Run containing cell (r,c) in across direction, or null
  const acrossRun: (Run | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );
  const downRun: (Run | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  // Build across runs
  for (let r = 1; r < size; r++) {
    let c = 1;
    while (c < size) {
      if (!white[r][c]) { c++; continue; }
      const run: Run = { cells: [] };
      while (c < size && white[r][c]) {
        run.cells.push([r, c]);
        acrossRun[r][c] = run;
        c++;
      }
    }
  }

  // Build down runs
  for (let c = 1; c < size; c++) {
    let r = 1;
    while (r < size) {
      if (!white[r][c]) { r++; continue; }
      const run: Run = { cells: [] };
      while (r < size && white[r][c]) {
        run.cells.push([r, c]);
        downRun[r][c] = run;
        r++;
      }
    }
  }

  return { across: acrossRun as Run[][], down: downRun as Run[][] };
}

function fillGrid(
  white: boolean[][],
  size: number,
  rng: () => number
): number[][] | null {
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const { across: acrossRun, down: downRun } = buildRuns(white, size);

  // Collect all white cells in reading order
  const whiteCells: Array<[number, number]> = [];
  for (let r = 1; r < size; r++) {
    for (let c = 1; c < size; c++) {
      if (white[r][c]) whiteCells.push([r, c]);
    }
  }

  let nodes = 0;
  const NODE_BUDGET = size <= 6 ? 5000 : size <= 9 ? 30000 : size <= 12 ? 100000 : 300000;

  function getUsedInRun(
    run: Run,
    excludeRow: number,
    excludeCol: number
  ): Set<number> {
    const used = new Set<number>();
    for (const [r, c] of run.cells) {
      if (r === excludeRow && c === excludeCol) continue;
      if (grid[r][c] !== 0) used.add(grid[r][c]);
    }
    return used;
  }

  function backtrack(idx: number): boolean {
    if (nodes > NODE_BUDGET) return false;
    nodes++;
    if (idx === whiteCells.length) return true;

    const [r, c] = whiteCells[idx];
    const ar = acrossRun[r][c];
    const dr = downRun[r][c];

    const acrossUsed = ar ? getUsedInRun(ar, r, c) : new Set<number>();
    const downUsed = dr ? getUsedInRun(dr, r, c) : new Set<number>();

    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9] as KakuroDigit[], rng);

    for (const d of digits) {
      if (acrossUsed.has(d) || downUsed.has(d)) continue;
      grid[r][c] = d;
      if (backtrack(idx + 1)) return true;
      grid[r][c] = 0;
    }

    return false;
  }

  return backtrack(0) ? grid : null;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(
  difficulty: Difficulty,
  seed?: number
): KakuroGeneratedPuzzle {
  const size = KAKURO_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 50;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined
        ? seed + attempt * 1000003
        : Math.floor(Math.random() * 2 ** 31);

    const rng = createRng(actualSeed);

    // Build layout
    const white = buildLayout(size, rng);

    // Check we have enough white cells to make an interesting puzzle
    let whiteCount = 0;
    for (let r = 1; r < size; r++) {
      for (let c = 1; c < size; c++) {
        if (white[r][c]) whiteCount++;
      }
    }
    if (whiteCount < size * 2) continue; // layout too sparse

    // Fill with valid digits
    const filledGrid = fillGrid(white, size, rng);
    if (!filledGrid) continue;

    // Build Kakuro grid structure with black cells and clues
    const grid: KakuroCell[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c): KakuroCell => {
        if (!white[r][c] || r === 0 || c === 0) {
          return { type: 'black', acrossClue: null, downClue: null };
        }
        return { type: 'white', value: 0, isGiven: false };
      })
    );

    // Compute clues for each black cell from the filled solution
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (white[r]?.[c]) continue; // skip white cells
        const black = grid[r][c] as KakuroBlackCell;

        // Across clue: sum of white run starting at (r, c+1)
        if (r > 0 && c + 1 < size && white[r][c + 1]) {
          let sum = 0;
          for (let cc = c + 1; cc < size && white[r][cc]; cc++) {
            sum += filledGrid[r][cc];
          }
          black.acrossClue = sum;
        }

        // Down clue: sum of white run starting at (r+1, c)
        if (c > 0 && r + 1 < size && white[r + 1]?.[c]) {
          let sum = 0;
          for (let rr = r + 1; rr < size && white[rr][c]; rr++) {
            sum += filledGrid[rr][c];
          }
          black.downClue = sum;
        }
      }
    }

    // Extract solution values
    const solutionValues: Array<{ row: number; col: number; value: KakuroDigit }> = [];
    for (let r = 1; r < size; r++) {
      for (let c = 1; c < size; c++) {
        if (white[r][c]) {
          solutionValues.push({ row: r, col: c, value: filledGrid[r][c] as KakuroDigit });
        }
      }
    }

    return {
      puzzleData: { size, grid },
      solution: { values: solutionValues },
      difficulty,
      seed: actualSeed,
    };
  }

  throw new Error(
    `[KakuroEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`
  );
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateKakuroBoard(
  board: KakuroCell[][],
  size: number
): { conflicts: Array<{ row: number; col: number }> } {
  const conflictSet = new Set<string>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c].type !== 'black') continue;
      const black = board[r][c] as KakuroBlackCell;

      if (black.acrossClue !== null) {
        const run: Array<{ row: number; col: number; value: number }> = [];
        for (let cc = c + 1; cc < size && board[r][cc].type === 'white'; cc++) {
          run.push({ row: r, col: cc, value: (board[r][cc] as KakuroWhiteCell).value });
        }
        const filled = run.filter((x) => x.value !== 0);
        const vals = filled.map((x) => x.value);
        const hasDuplicate = vals.length !== new Set(vals).size;
        const sum = vals.reduce((a, b) => a + b, 0);
        const complete = run.every((x) => x.value !== 0);
        if (hasDuplicate || (complete && sum !== black.acrossClue)) {
          run.forEach((x) => conflictSet.add(`${x.row},${x.col}`));
        }
      }

      if (black.downClue !== null) {
        const run: Array<{ row: number; col: number; value: number }> = [];
        for (let rr = r + 1; rr < size && board[rr][c].type === 'white'; rr++) {
          run.push({ row: rr, col: c, value: (board[rr][c] as KakuroWhiteCell).value });
        }
        const filled = run.filter((x) => x.value !== 0);
        const vals = filled.map((x) => x.value);
        const hasDuplicate = vals.length !== new Set(vals).size;
        const sum = vals.reduce((a, b) => a + b, 0);
        const complete = run.every((x) => x.value !== 0);
        if (hasDuplicate || (complete && sum !== black.downClue)) {
          run.forEach((x) => conflictSet.add(`${x.row},${x.col}`));
        }
      }
    }
  }

  return {
    conflicts: Array.from(conflictSet).map((k) => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isKakuroSolved(
  board: KakuroCell[][],
  solution: KakuroSolution
): boolean {
  for (const { row, col, value } of solution.values) {
    if ((board[row][col] as KakuroWhiteCell).value !== value) return false;
  }
  return true;
}

// ─── Hints ────────────────────────────────────────────────────────────────────

export function getHint(
  gameState: KakuroGameState,
  solution: KakuroSolution
): KakuroHintResult | null {
  for (const { row, col, value } of solution.values) {
    const cell = gameState.board[row][col] as KakuroWhiteCell;
    if (cell.value !== value) {
      const newBoard = gameState.board.map((r, ri) =>
        r.map((c, ci): KakuroCell => {
          if (ri === row && ci === col) {
            return { ...(c as KakuroWhiteCell), value } as KakuroWhiteCell;
          }
          return { ...c };
        })
      );
      return {
        description: `Cell (${row + 1}, ${col + 1}) should be ${value}.`,
        revealedState: { board: newBoard, selectedCell: { row, col } },
        position: { row, col },
      };
    }
  }
  return null;
}