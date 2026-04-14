import { CellPosition, Difficulty, GeneratedPuzzle, HintResult } from '../types/core';

// ─── Sudoku Types ─────────────────────────────────────────────────────────────

export type SudokuDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type SudokuCell = SudokuDigit | 0; // 0 = empty
export type SudokuGrid = SudokuCell[][];

export interface SudokuPuzzleData {
  grid: SudokuGrid; // Initial puzzle with 0s for empty cells
  size: 9;
}

export interface SudokuSolution {
  grid: SudokuGrid; // Complete solution grid
}

export interface SudokuNotes {
  [key: string]: Set<SudokuDigit>; // key = "row,col"
}

export interface SudokuCellState {
  value: SudokuCell;
  isGiven: boolean;
  isError: boolean;
  notes: Set<SudokuDigit>;
}

export type SudokuBoardState = SudokuCellState[][];

export interface SudokuGameState {
  board: SudokuBoardState;
  selectedCell: CellPosition | null;
  isNotesMode: boolean;
}

export type SudokuGeneratedPuzzle = GeneratedPuzzle<SudokuPuzzleData, SudokuSolution>;

export type SudokuHintResult = HintResult<SudokuGameState>;

// ─── Difficulty config ────────────────────────────────────────────────────────

export const SUDOKU_DIFFICULTY_CONFIG: Record<Difficulty, { minGivens: number; maxGivens: number }> =
  {
    [Difficulty.EASY]: { minGivens: 40, maxGivens: 50 },
    [Difficulty.MEDIUM]: { minGivens: 32, maxGivens: 39 },
    [Difficulty.HARD]: { minGivens: 26, maxGivens: 31 },
    [Difficulty.EXPERT]: { minGivens: 17, maxGivens: 25 },
  };
