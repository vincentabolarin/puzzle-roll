import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LightUpCellType = 'white' | 'black';
export type LightUpCellState = 'empty' | 'bulb' | 'lit' | 'conflict';

export interface LightUpCell {
  type: LightUpCellType;
  adjacentBulbClue: number | null;
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
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Compute illumination for a set of bulb positions ────────────────────────

function computeLit(
  bulbs: Set<number>, // encoded as r*cols+c
  isBlack: Uint8Array,
  rows: number,
  cols: number
): Set<number> {
  const lit = new Set<number>();

  for (const idx of bulbs) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    lit.add(idx);

    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const nidx = nr * cols + nc;
        if (isBlack[nidx]) break;
        lit.add(nidx);
        nr += dr;
        nc += dc;
      }
    }
  }

  return lit;
}

// ─── Check if two bulbs can see each other (conflict) ────────────────────────

function bulbsConflict(
  idx1: number,
  idx2: number,
  isBlack: Uint8Array,
  cols: number
): boolean {
  const r1 = Math.floor(idx1 / cols);
  const c1 = idx1 % cols;
  const r2 = Math.floor(idx2 / cols);
  const c2 = idx2 % cols;

  if (r1 !== r2 && c1 !== c2) return false;

  if (r1 === r2) {
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    for (let c = minC + 1; c < maxC; c++) {
      if (isBlack[r1 * cols + c]) return false;
    }
  } else {
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    for (let r = minR + 1; r < maxR; r++) {
      if (isBlack[r * cols + c1]) return false;
    }
  }

  return true;
}

// ─── Generator ────────────────────────────────────────────────────────────────
// Strategy:
// 1. Place black cells randomly
// 2. Use a greedy set-cover to place bulbs that illuminate all white cells
//    with no two bulbs in line-of-sight
// 3. Assign number clues to a subset of black cells
// The greedy approach is deterministic and cannot loop — if it fails we retry
// with a different seed, bounded by MAX_ATTEMPTS.

export function generatePuzzle(
  difficulty: Difficulty,
  seed?: number
): LightUpGeneratedPuzzle {
  const { rows, cols } = LIGHTUP_SIZE_CONFIG[difficulty];
  const MAX_ATTEMPTS = 80;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const actualSeed =
      seed !== undefined
        ? seed + attempt * 1000003
        : Math.floor(Math.random() * 2 ** 31);

    const rng = createRng(actualSeed);
    const total = rows * cols;

    // Step 1: Place black cells (~18% density)
    const isBlack = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (rng() < 0.18) isBlack[i] = 1;
    }

    const whiteCells: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!isBlack[i]) whiteCells.push(i);
    }

    if (whiteCells.length === 0) continue;

    // Step 2: Greedy set-cover bulb placement
    // For each unlit white cell, find the bulb position (in its row or column)
    // that illuminates the most currently-unlit cells without conflicting.

    const bulbs = new Set<number>();
    const lit = new Set<number>();

    // Shuffle white cells to randomise greedy order
    const shuffled = shuffle([...whiteCells], rng);

    for (const targetIdx of shuffled) {
      if (lit.has(targetIdx)) continue; // already illuminated

      // Candidate bulb positions: all white cells visible from targetIdx
      // (same row or col, no black cell blocking) plus targetIdx itself
      const candidates: number[] = [];
      const tr = Math.floor(targetIdx / cols);
      const tc = targetIdx % cols;

      // Horizontal candidates
      for (let c = tc; c < cols; c++) {
        const idx = tr * cols + c;
        if (isBlack[idx]) break;
        if (!bulbs.has(idx)) candidates.push(idx);
      }
      for (let c = tc - 1; c >= 0; c--) {
        const idx = tr * cols + c;
        if (isBlack[idx]) break;
        if (!bulbs.has(idx)) candidates.push(idx);
      }

      // Vertical candidates
      for (let r = tr + 1; r < rows; r++) {
        const idx = r * cols + tc;
        if (isBlack[idx]) break;
        if (!bulbs.has(idx)) candidates.push(idx);
      }
      for (let r = tr - 1; r >= 0; r--) {
        const idx = r * cols + tc;
        if (isBlack[idx]) break;
        if (!bulbs.has(idx)) candidates.push(idx);
      }

      if (candidates.length === 0) continue;

      // Pick candidate that illuminates the most unlit cells
      // and doesn't conflict with existing bulbs
      let bestIdx = -1;
      let bestScore = -1;

      for (const cIdx of candidates) {
        // Check no conflict with existing bulbs
        let conflicts = false;
        for (const b of bulbs) {
          if (bulbsConflict(cIdx, b, isBlack, cols)) {
            conflicts = true;
            break;
          }
        }
        if (conflicts) continue;

        // Score: count newly illuminated cells
        const cSet = new Set([cIdx]);
        const newLit = computeLit(cSet, isBlack, rows, cols);
        let score = 0;
        for (const l of newLit) {
          if (!lit.has(l) && !isBlack[l]) score++;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIdx = cIdx;
        }
      }

      if (bestIdx === -1) continue; // couldn't place — skip this cell for now

      bulbs.add(bestIdx);
      const newLit = computeLit(new Set([bestIdx]), isBlack, rows, cols);
      for (const l of newLit) lit.add(l);
    }

    // Verify all white cells are illuminated
    const allLit = whiteCells.every((idx) => lit.has(idx));
    if (!allLit) continue;

    // Verify no two bulbs conflict
    const bulbArr = Array.from(bulbs);
    let hasConflict = false;
    for (let i = 0; i < bulbArr.length && !hasConflict; i++) {
      for (let j = i + 1; j < bulbArr.length && !hasConflict; j++) {
        if (bulbsConflict(bulbArr[i], bulbArr[j], isBlack, cols)) {
          hasConflict = true;
        }
      }
    }
    if (hasConflict) continue;

    // Step 3: Assign number clues to ~35% of black cells
    const clues = new Map<number, number>();
    for (let i = 0; i < total; i++) {
      if (!isBlack[i]) continue;
      if (rng() > 0.35) continue;

      const r = Math.floor(i / cols);
      const c = i % cols;
      let adjBulbs = 0;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
        const ni = (r + dr) * cols + (c + dc);
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && bulbs.has(ni)) {
          adjBulbs++;
        }
      }
      clues.set(i, adjBulbs);
    }

    // Build puzzle grid
    const grid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        type: (isBlack[r * cols + c] ? 'black' : 'white') as LightUpCellType,
        adjacentBulbClue: clues.get(r * cols + c) ?? null,
      }))
    );

    const bulbPositions = bulbArr.map((idx) => ({
      row: Math.floor(idx / cols),
      col: idx % cols,
    }));

    return {
      puzzleData: { rows, cols, grid },
      solution: { bulbPositions },
      difficulty,
      seed: actualSeed,
    };
  }

  throw new Error(
    `[LightUpEngine] Failed to generate ${difficulty} puzzle after ${MAX_ATTEMPTS} attempts`
  );
}

// ─── Compute board state after placing/removing bulbs ────────────────────────

export function computeBoardState(
  board: LightUpCell[][],
  rows: number,
  cols: number
): LightUpCell[][] {
  const isBlack = new Uint8Array(rows * cols);
  const bulbs = new Set<number>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (board[r][c].type === 'black') isBlack[idx] = 1;
      else if (board[r][c].state === 'bulb' || board[r][c].state === 'conflict') {
        bulbs.add(idx);
      }
    }
  }

  const lit = computeLit(bulbs, isBlack, rows, cols);

  const newBoard = board.map((row) => row.map((cell) => ({ ...cell })));

  // Reset non-bulb white cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = newBoard[r][c];
      if (cell.type === 'white') {
        const idx = r * cols + c;
        cell.isLit = lit.has(idx);
        if (cell.state !== 'bulb' && cell.state !== 'conflict') {
          cell.state = lit.has(idx) ? 'lit' : 'empty';
        }
      }
    }
  }

  // Mark conflicting bulbs
  const bulbArr = Array.from(bulbs);
  for (let i = 0; i < bulbArr.length; i++) {
    for (let j = i + 1; j < bulbArr.length; j++) {
      if (bulbsConflict(bulbArr[i], bulbArr[j], isBlack, cols)) {
        const r1 = Math.floor(bulbArr[i] / cols);
        const c1 = bulbArr[i] % cols;
        const r2 = Math.floor(bulbArr[j] / cols);
        const c2 = bulbArr[j] % cols;
        newBoard[r1][c1].state = 'conflict';
        newBoard[r2][c2].state = 'conflict';
      }
    }
  }

  return newBoard;
}

export function isLightUpSolved(
  board: LightUpCell[][],
  rows: number,
  cols: number,
  puzzleData: LightUpPuzzleData
): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell.type === 'white') {
        if (!cell.isLit) return false;
        if (cell.state === 'conflict') return false;
      }
    }
  }

  // Verify numbered black cell clues
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = puzzleData.grid[r][c].adjacentBulbClue;
      if (clue === null) continue;
      let adj = 0;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
        const nr = r + dr;
        const nc = c + dc;
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