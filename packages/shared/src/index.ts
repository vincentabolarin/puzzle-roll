// Core types
export * from './types/core';

// Game engines
export * as SudokuEngine from './engines/sudoku';
export * as QueensEngine from './engines/queens';
export * as ZipEngine from './engines/zip';
export * as TangoEngine from './engines/tango';
export * as NonogramEngine from './engines/nonogram';
export * as MinesweeperEngine from './engines/minesweeper';
export * as KakuroEngine from './engines/kakuro';
export * as LightUpEngine from './engines/lightup';
export * as FutoshikiEngine from './engines/futoshiki';
export * as HitoriEngine from './engines/hitori';

// Re-export individual engine types for convenience
export type { SudokuGrid, SudokuCellState, SudokuBoardState, SudokuGameState, SudokuGeneratedPuzzle } from './engines/sudoku/types';
export type { QueensBoard, QueensCellState, QueensGameState, QueensGeneratedPuzzle } from './engines/queens/types';
