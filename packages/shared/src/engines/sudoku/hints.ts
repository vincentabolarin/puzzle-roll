import { SudokuBoardState, SudokuCellState, SudokuDigit, SudokuGameState, SudokuGrid } from './types';
import { getCandidates } from './solver';
import { boardStateToGrid } from './validator';
import { SudokuHintResult } from './types';

// ─── Find the best hint cell (prefers cells with fewest candidates) ───────────

function findBestHintCell(
  board: SudokuBoardState,
  solution: SudokuGrid
): [number, number] | null {
  // First try to find an incorrect cell (error correction hint)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      if (!cell.isGiven && cell.value !== 0 && cell.value !== solution[r][c]) {
        return [r, c];
      }
    }
  }

  // Otherwise find empty cell with fewest candidates
  const grid = boardStateToGrid(board);
  let bestRow = -1;
  let bestCol = -1;
  let fewest = 10;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!board[r][c].isGiven && board[r][c].value === 0) {
        const candidates = getCandidates(grid, r, c);
        if (candidates.length < fewest) {
          fewest = candidates.length;
          bestRow = r;
          bestCol = c;
        }
      }
    }
  }

  if (bestRow === -1) return null;
  return [bestRow, bestCol];
}

// ─── Generate a hint for the current game state ───────────────────────────────

export function getHint(
  gameState: SudokuGameState,
  solution: SudokuGrid
): SudokuHintResult | null {
  const { board } = gameState;
  const target = findBestHintCell(board, solution);
  if (!target) return null;

  const [row, col] = target;
  const correctValue = solution[row][col] as SudokuDigit;
  const currentCell = board[row][col];

  const isError = currentCell.value !== 0 && currentCell.value !== correctValue;
  const description = isError
    ? `Cell (${row + 1}, ${col + 1}) contains an incorrect value. The correct digit is ${correctValue}.`
    : `Cell (${row + 1}, ${col + 1}) should contain ${correctValue}.`;

  // Build the new board state with the hint applied
  const newBoard: SudokuBoardState = board.map((r, ri) =>
    r.map((cell, ci): SudokuCellState => {
      if (ri === row && ci === col) {
        return {
          value: correctValue,
          isGiven: false,
          isError: false,
          notes: new Set(),
        };
      }
      return { ...cell, notes: new Set(cell.notes) };
    })
  );

  const newState: SudokuGameState = {
    ...gameState,
    board: newBoard,
    selectedCell: { row, col },
  };

  return {
    description,
    revealedState: newState,
    position: { row, col },
  };
}

// ─── Check if a cell's value is incorrect compared to solution ────────────────

export function isIncorrectCell(
  board: SudokuBoardState,
  row: number,
  col: number,
  solution: SudokuGrid
): boolean {
  const cell = board[row][col];
  return !cell.isGiven && cell.value !== 0 && cell.value !== solution[row][col];
}
