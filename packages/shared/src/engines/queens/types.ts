import { Difficulty, GeneratedPuzzle, HintResult } from '../../types/core';

export type QueensCellMark = 'empty' | 'queen' | 'x';

export interface QueensCellState {
  mark: QueensCellMark;
  region: number; // colour region id (0-indexed)
}

export type QueensBoard = QueensCellState[][];

export interface QueensPuzzleData {
  size: number;
  regions: number[][]; // region[row][col] = regionId
}

export interface QueensSolution {
  queenPositions: Array<{ row: number; col: number }>; // one per region
}

export interface QueensGameState {
  board: QueensBoard;
}

export type QueensGeneratedPuzzle = GeneratedPuzzle<QueensPuzzleData, QueensSolution>;
export type QueensHintResult = HintResult<QueensGameState>;

export const QUEENS_SIZE_CONFIG: Record<Difficulty, number> = {
  [Difficulty.EASY]: 6,
  [Difficulty.MEDIUM]: 8,
  [Difficulty.HARD]: 10,
  [Difficulty.EXPERT]: 12,
};
