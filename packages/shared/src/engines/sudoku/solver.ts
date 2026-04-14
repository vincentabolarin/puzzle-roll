import { SudokuCell, SudokuDigit, SudokuGrid } from './types';

// ─── Deep copy a grid ─────────────────────────────────────────────────────────

export function copyGrid(grid: SudokuGrid): SudokuGrid {
  return grid.map((row) => [...row]);
}

// ─── Check if placing digit at (row, col) is valid ───────────────────────────

export function isValidPlacement(
  grid: SudokuGrid,
  row: number,
  col: number,
  digit: SudokuDigit
): boolean {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (grid[row][c] === digit) return false;
  }
  // Check column
  for (let r = 0; r < 9; r++) {
    if (grid[r][col] === digit) return false;
  }
  // Check 3×3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (grid[r][c] === digit) return false;
    }
  }
  return true;
}

// ─── Find the next empty cell using MRV heuristic ────────────────────────────

function findNextEmpty(grid: SudokuGrid): [number, number] | null {
  let bestRow = -1;
  let bestCol = -1;
  let bestCount = 10;

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        let count = 0;
        for (let d = 1; d <= 9; d++) {
          if (isValidPlacement(grid, row, col, d as SudokuDigit)) count++;
        }
        if (count < bestCount) {
          bestCount = count;
          bestRow = row;
          bestCol = col;
        }
      }
    }
  }

  if (bestRow === -1) return null;
  return [bestRow, bestCol];
}

// ─── Solve — returns true if a solution was found, modifies grid in place ────

export function solve(grid: SudokuGrid): boolean {
  const empty = findNextEmpty(grid);
  if (!empty) return true; // All cells filled — solved

  const [row, col] = empty;

  for (let d = 1; d <= 9; d++) {
    const digit = d as SudokuDigit;
    if (isValidPlacement(grid, row, col, digit)) {
      grid[row][col] = digit;
      if (solve(grid)) return true;
      grid[row][col] = 0;
    }
  }
  return false;
}

// ─── Count solutions (stops at 2 to determine uniqueness) ────────────────────

export function countSolutions(grid: SudokuGrid, limit = 2): number {
  const empty = findNextEmpty(grid);
  if (!empty) return 1;

  const [row, col] = empty;
  let count = 0;

  for (let d = 1; d <= 9; d++) {
    const digit = d as SudokuDigit;
    if (isValidPlacement(grid, row, col, digit)) {
      grid[row][col] = digit;
      count += countSolutions(grid, limit);
      grid[row][col] = 0;
      if (count >= limit) return count;
    }
  }
  return count;
}

// ─── Verify puzzle has exactly one solution ───────────────────────────────────

export function hasUniqueSolution(puzzle: SudokuGrid): boolean {
  const copy = copyGrid(puzzle);
  return countSolutions(copy) === 1;
}

// ─── Get all candidate digits for a cell ─────────────────────────────────────

export function getCandidates(grid: SudokuGrid, row: number, col: number): SudokuDigit[] {
  if (grid[row][col] !== 0) return [];
  const candidates: SudokuDigit[] = [];
  for (let d = 1; d <= 9; d++) {
    if (isValidPlacement(grid, row, col, d as SudokuDigit)) {
      candidates.push(d as SudokuDigit);
    }
  }
  return candidates;
}

// ─── Check if grid is fully and correctly filled ──────────────────────────────

export function isSolved(grid: SudokuGrid): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const val = grid[row][col];
      if (val === 0) return false;
      // Temporarily clear and check validity
      grid[row][col] = 0;
      if (!isValidPlacement(grid, row, col, val as SudokuDigit)) {
        grid[row][col] = val;
        return false;
      }
      grid[row][col] = val;
    }
  }
  return true;
}

// ─── Get all conflicting cells for a given placement ─────────────────────────

export function getConflicts(
  grid: SudokuGrid,
  row: number,
  col: number
): Array<[number, number]> {
  const val = grid[row][col] as SudokuCell;
  if (val === 0) return [];

  const conflicts: Array<[number, number]> = [];

  for (let c = 0; c < 9; c++) {
    if (c !== col && grid[row][c] === val) conflicts.push([row, c]);
  }
  for (let r = 0; r < 9; r++) {
    if (r !== row && grid[r][col] === val) conflicts.push([r, col]);
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if ((r !== row || c !== col) && grid[r][c] === val) conflicts.push([r, c]);
    }
  }

  return conflicts;
}
