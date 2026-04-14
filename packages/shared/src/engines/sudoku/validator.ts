import { SudokuBoardState, SudokuCell, SudokuDigit, SudokuGrid } from './types';
import { getConflicts, isSolved } from './solver';

// ─── Validate a single cell placement against the solution ───────────────────

export function validateCellPlacement(
  board: SudokuBoardState,
  row: number,
  col: number,
  solution: SudokuGrid
): boolean {
  const cell = board[row][col];
  if (cell.value === 0) return true; // Empty is always valid
  return cell.value === solution[row][col];
}

// ─── Build current grid from board state ─────────────────────────────────────

export function boardStateToGrid(board: SudokuBoardState): SudokuGrid {
  return board.map((row) => row.map((cell) => cell.value));
}

// ─── Get all error positions on the current board ────────────────────────────

export function getErrorPositions(
  board: SudokuBoardState,
  solution: SudokuGrid
): Array<[number, number]> {
  const errors: Array<[number, number]> = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (cell.value !== 0 && cell.value !== solution[r][c]) {
        errors.push([r, c]);
      }
    }
  }
  return errors;
}

// ─── Check if the current board state matches the solution ───────────────────

export function isBoardSolved(board: SudokuBoardState, solution: SudokuGrid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c].value !== solution[r][c]) return false;
    }
  }
  return true;
}

// ─── Get real-time conflict cells (regardless of solution) ───────────────────

export function getBoardConflicts(
  board: SudokuBoardState
): Array<[number, number]> {
  const grid = boardStateToGrid(board);
  const conflictSet = new Set<string>();

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) {
        const conflicts = getConflicts(grid, r, c);
        if (conflicts.length > 0) {
          conflictSet.add(`${r},${c}`);
          conflicts.forEach(([cr, cc]) => conflictSet.add(`${cr},${cc}`));
        }
      }
    }
  }

  return Array.from(conflictSet).map((key) => {
    const [r, c] = key.split(',').map(Number);
    return [r, c] as [number, number];
  });
}

// ─── Apply notes auto-removal after digit placement ──────────────────────────

export function applyAutoRemoveNotes(
  board: SudokuBoardState,
  row: number,
  col: number,
  digit: SudokuDigit
): SudokuBoardState {
  const newBoard = board.map((r) =>
    r.map((cell) => ({ ...cell, notes: new Set(cell.notes) }))
  );

  // Remove from same row
  for (let c = 0; c < 9; c++) {
    newBoard[row][c].notes.delete(digit);
  }
  // Remove from same column
  for (let r = 0; r < 9; r++) {
    newBoard[r][col].notes.delete(digit);
  }
  // Remove from same box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      newBoard[r][c].notes.delete(digit);
    }
  }

  return newBoard;
}
