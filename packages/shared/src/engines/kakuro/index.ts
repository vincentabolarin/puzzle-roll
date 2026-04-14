import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KakuroDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface KakuroBlackCell {
  type: 'black';
  acrossClue: number | null; // sum for run to the right
  downClue: number | null;   // sum for run below
}

export interface KakuroWhiteCell {
  type: 'white';
  value: KakuroDigit | 0; // 0 = empty (given or player-filled)
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

// ─── Precomputed: all valid combinations for a run of length L summing to S ──

function getCombinations(sum: number, length: number): KakuroDigit[][] {
  const results: KakuroDigit[][] = [];
  function backtrack(remaining: number, start: KakuroDigit, current: KakuroDigit[]): void {
    if (current.length === length) {
      if (remaining === 0) results.push([...current]);
      return;
    }
    for (let d = start; d <= 9; d++) {
      if (d <= remaining) {
        current.push(d as KakuroDigit);
        backtrack(remaining - d, (d + 1) as KakuroDigit, current);
        current.pop();
      }
    }
  }
  backtrack(sum, 1, []);
  return results;
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
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Build a simple Kakuro grid layout ───────────────────────────────────────

function buildLayout(size: number, rng: () => number): boolean[][] {
  // true = white cell, false = black cell
  // Row 0 and col 0 are always black (clue row/col)
  const white: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => r > 0 && c > 0)
  );

  // Randomly black out some interior cells to create runs
  const blackRate = 0.2;
  for (let r = 1; r < size; r++) {
    for (let c = 1; c < size; c++) {
      if (rng() < blackRate) white[r][c] = false;
    }
  }

  // Ensure no white cell is isolated (has at least one white neighbour in its run)
  for (let r = 1; r < size; r++) {
    for (let c = 1; c < size; c++) {
      if (white[r][c]) {
        const acrossLen = getRunLength(white, r, c, 0, 1, size);
        const downLen = getRunLength(white, r, c, 1, 0, size);
        if (acrossLen < 2 && downLen < 2) white[r][c] = false;
      }
    }
  }

  return white;
}

function getRunLength(white: boolean[][], r: number, c: number, dr: number, dc: number, size: number): number {
  // Count cells in this direction including current
  let count = 1;
  let nr = r + dr, nc = c + dc;
  while (nr < size && nc < size && white[nr][nc]) { count++; nr += dr; nc += dc; }
  // Also count backwards
  nr = r - dr; nc = c - dc;
  while (nr >= 0 && nc >= 0 && nr < size && nc < size && white[nr][nc]) { count++; nr -= dr; nc -= dc; }
  return count;
}

// ─── Solve Kakuro with backtracking ─────────────────────────────────────────

function solveKakuro(
  grid: KakuroCell[][],
  size: number,
  limit: number
): Array<Array<{ row: number; col: number; value: KakuroDigit }>> {
  // Collect all white cells in order
  const whiteCells: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c].type === 'white') whiteCells.push({ row: r, col: c });
    }
  }

  const values = new Map<string, KakuroDigit>();
  const solutions: Array<Array<{ row: number; col: number; value: KakuroDigit }>> = [];

  // Get constraints for a run
  function getRunConstraint(
    row: number, col: number, dr: number, dc: number
  ): { sum: number; cells: Array<{ row: number; col: number }> } | null {
    // Find the black cell heading this run
    let r = row - dr, c = col - dc;
    while (r >= 0 && c >= 0 && grid[r][c].type === 'white') { r -= dr; c -= dc; }
    if (r < 0 || c < 0) return null;
    const black = grid[r][c] as KakuroBlackCell;
    const clue = dr === 1 ? black.downClue : black.acrossClue;
    if (clue === null) return null;

    const cells: Array<{ row: number; col: number }> = [];
    let nr = r + dr, nc = c + dc;
    while (nr < size && nc < size && grid[nr][nc].type === 'white') {
      cells.push({ row: nr, col: nc });
      nr += dr; nc += dc;
    }
    return { sum: clue, cells };
  }

  function isConsistent(row: number, col: number, val: KakuroDigit): boolean {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const constraint = getRunConstraint(row, col, dr, dc);
      if (!constraint) continue;
      const { sum, cells } = constraint;
      const filled: KakuroDigit[] = [];
      let runVal = 0;
      for (const cell of cells) {
        const v = cell.row === row && cell.col === col ? val : values.get(`${cell.row},${cell.col}`);
        if (v !== undefined) {
          if (filled.includes(v)) return false; // duplicate
          filled.push(v);
          runVal += v;
        }
      }
      // If all filled, check sum
      if (filled.length === cells.length && runVal !== sum) return false;
      // If partial, check not exceeding
      if (runVal > sum) return false;
    }
    return true;
  }

  function backtrack(idx: number): void {
    if (solutions.length >= limit) return;
    if (idx === whiteCells.length) {
      solutions.push(
        whiteCells.map(({ row, col }) => ({
          row, col, value: values.get(`${row},${col}`)!,
        }))
      );
      return;
    }

    const { row, col } = whiteCells[idx];
    for (let d = 1; d <= 9; d++) {
      const digit = d as KakuroDigit;
      if (isConsistent(row, col, digit)) {
        values.set(`${row},${col}`, digit);
        backtrack(idx + 1);
        values.delete(`${row},${col}`);
        if (solutions.length >= limit) return;
      }
    }
  }

  backtrack(0);
  return solutions;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export function generatePuzzle(difficulty: Difficulty, seed?: number): KakuroGeneratedPuzzle {
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(actualSeed);
  const size = KAKURO_SIZE_CONFIG[difficulty];

  const white = buildLayout(size, rng);

  // Build grid with black cells
  const grid: KakuroCell[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c): KakuroCell => {
      if (!white[r][c]) return { type: 'black', acrossClue: null, downClue: null };
      return { type: 'white', value: 0, isGiven: false };
    })
  );

  // First, place a temporary solution to compute clues
  // Use a simple fill: for each run, assign 1..len
  function fillRunsSimple(): boolean {
    // Fill white cells row by row with valid values
    for (let r = 1; r < size; r++) {
      for (let c = 1; c < size; c++) {
        if (!white[r][c]) continue;
        // Find used values in across and down runs
        const acrossUsed = new Set<number>();
        for (let cc = c - 1; cc >= 1 && white[r][cc]; cc--) {
          const cell = grid[r][cc] as KakuroWhiteCell;
          if (cell.value !== 0) acrossUsed.add(cell.value);
        }
        const downUsed = new Set<number>();
        for (let rr = r - 1; rr >= 1 && white[rr][c]; rr--) {
          const cell = grid[rr][c] as KakuroWhiteCell;
          if (cell.value !== 0) downUsed.add(cell.value);
        }
        const digits = shuffle([1,2,3,4,5,6,7,8,9], rng);
        const valid = digits.find(d => !acrossUsed.has(d) && !downUsed.has(d));
        if (!valid) return false;
        (grid[r][c] as KakuroWhiteCell).value = valid as KakuroDigit;
      }
    }
    return true;
  }

  if (!fillRunsSimple()) return generatePuzzle(difficulty, actualSeed + 1);

  // Compute clues from filled values
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c].type !== 'black') continue;
      const black = grid[r][c] as KakuroBlackCell;

      // Across clue: sum of run to the right
      if (c + 1 < size && white[r][c + 1]) {
        let sum = 0;
        for (let cc = c + 1; cc < size && white[r][cc]; cc++) {
          sum += (grid[r][cc] as KakuroWhiteCell).value;
        }
        black.acrossClue = sum;
      }

      // Down clue: sum of run below
      if (r + 1 < size && white[r + 1][c]) {
        let sum = 0;
        for (let rr = r + 1; rr < size && white[rr][c]; rr++) {
          sum += (grid[rr][c] as KakuroWhiteCell).value;
        }
        black.downClue = sum;
      }
    }
  }

  // Extract solution
  const solution: KakuroSolution = {
    values: [],
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c].type === 'white') {
        const cell = grid[r][c] as KakuroWhiteCell;
        solution.values.push({ row: r, col: c, value: cell.value as KakuroDigit });
        cell.value = 0; // Clear for puzzle
      }
    }
  }

  return {
    puzzleData: { size, grid },
    solution,
    difficulty,
    seed: actualSeed,
  };
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
        const filled = run.filter(x => x.value !== 0);
        const vals = filled.map(x => x.value);
        const hasDuplicate = vals.length !== new Set(vals).size;
        const sum = vals.reduce((a, b) => a + b, 0);
        if (hasDuplicate || (run.every(x => x.value !== 0) && sum !== black.acrossClue)) {
          run.forEach(x => conflictSet.add(`${x.row},${x.col}`));
        }
      }

      if (black.downClue !== null) {
        const run: Array<{ row: number; col: number; value: number }> = [];
        for (let rr = r + 1; rr < size && board[rr][c].type === 'white'; rr++) {
          run.push({ row: rr, col: c, value: (board[rr][c] as KakuroWhiteCell).value });
        }
        const filled = run.filter(x => x.value !== 0);
        const vals = filled.map(x => x.value);
        const hasDuplicate = vals.length !== new Set(vals).size;
        const sum = vals.reduce((a, b) => a + b, 0);
        if (hasDuplicate || (run.every(x => x.value !== 0) && sum !== black.downClue)) {
          run.forEach(x => conflictSet.add(`${x.row},${x.col}`));
        }
      }
    }
  }

  return {
    conflicts: Array.from(conflictSet).map(k => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    }),
  };
}

export function isKakuroSolved(board: KakuroCell[][], size: number, solution: KakuroSolution): boolean {
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
    if (cell.value === 0) {
      const newBoard = gameState.board.map((r, ri) =>
        r.map((c, ci): KakuroCell => {
          if (ri === row && ci === col) return { ...c, value } as KakuroWhiteCell;
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
