import { Difficulty } from '../../types/core';
import { generatePuzzle } from '../sudoku/generator';
import { solve, hasUniqueSolution, isSolved, copyGrid, getCandidates, isValidPlacement } from '../sudoku/solver';
import { boardStateToGrid, isBoardSolved, getBoardConflicts } from '../sudoku/validator';
import { getHint } from '../sudoku/hints';
import { SudokuBoardState, SudokuCellState, SudokuGrid } from '../sudoku/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBoardState(grid: SudokuGrid, givenGrid: SudokuGrid): SudokuBoardState {
  return grid.map((row, r) =>
    row.map((val, c): SudokuCellState => ({
      value: val,
      isGiven: givenGrid[r][c] !== 0,
      isError: false,
      notes: new Set(),
    }))
  );
}

// ─── Generator tests ──────────────────────────────────────────────────────────

describe('Sudoku Generator', () => {
  it('generates a valid easy puzzle with unique solution', () => {
    const result = generatePuzzle(Difficulty.EASY, 12345);
    expect(result.puzzleData.grid).toHaveLength(9);
    expect(result.puzzleData.grid[0]).toHaveLength(9);
    expect(hasUniqueSolution(result.puzzleData.grid)).toBe(true);
  });

  it('generates a valid expert puzzle with unique solution', () => {
    const result = generatePuzzle(Difficulty.EXPERT, 99999);
    expect(hasUniqueSolution(result.puzzleData.grid)).toBe(true);
  });

  it('easy puzzle has >= 40 givens', () => {
    const result = generatePuzzle(Difficulty.EASY, 11111);
    const givens = result.puzzleData.grid.flat().filter((v) => v !== 0).length;
    expect(givens).toBeGreaterThanOrEqual(40);
    expect(givens).toBeLessThanOrEqual(50);
  });

  it('expert puzzle has 17–25 givens', () => {
    const result = generatePuzzle(Difficulty.EXPERT, 77777);
    const givens = result.puzzleData.grid.flat().filter((v) => v !== 0).length;
    expect(givens).toBeGreaterThanOrEqual(17);
    expect(givens).toBeLessThanOrEqual(25);
  });

  it('is deterministic with same seed', () => {
    const a = generatePuzzle(Difficulty.MEDIUM, 42);
    const b = generatePuzzle(Difficulty.MEDIUM, 42);
    expect(a.puzzleData.grid).toEqual(b.puzzleData.grid);
  });

  it('produces different puzzles with different seeds', () => {
    const a = generatePuzzle(Difficulty.MEDIUM, 1);
    const b = generatePuzzle(Difficulty.MEDIUM, 2);
    expect(a.puzzleData.grid).not.toEqual(b.puzzleData.grid);
  });

  it('solution is a complete valid grid', () => {
    const result = generatePuzzle(Difficulty.MEDIUM, 54321);
    expect(isSolved(result.solution.grid)).toBe(true);
  });
});

// ─── Solver tests ─────────────────────────────────────────────────────────────

describe('Sudoku Solver', () => {
  it('solves a known puzzle correctly', () => {
    const puzzle: SudokuGrid = [
      [5,3,0,0,7,0,0,0,0],
      [6,0,0,1,9,5,0,0,0],
      [0,9,8,0,0,0,0,6,0],
      [8,0,0,0,6,0,0,0,3],
      [4,0,0,8,0,3,0,0,1],
      [7,0,0,0,2,0,0,0,6],
      [0,6,0,0,0,0,2,8,0],
      [0,0,0,4,1,9,0,0,5],
      [0,0,0,0,8,0,0,7,9],
    ];
    const copy = copyGrid(puzzle);
    const solved = solve(copy);
    expect(solved).toBe(true);
    expect(isSolved(copy)).toBe(true);
  });

  it('correctly detects invalid placement', () => {
    const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][0] = 5;
    expect(isValidPlacement(grid, 0, 1, 5)).toBe(false); // same row
    expect(isValidPlacement(grid, 1, 0, 5)).toBe(false); // same col
    expect(isValidPlacement(grid, 1, 1, 5)).toBe(false); // same box
    expect(isValidPlacement(grid, 0, 1, 3)).toBe(true);
  });

  it('hasUniqueSolution returns false for empty grid', () => {
    const empty: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    expect(hasUniqueSolution(empty)).toBe(false);
  });

  it('getCandidates returns correct candidates', () => {
    const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][0] = 1;
    grid[0][1] = 2;
    grid[0][2] = 3;
    const candidates = getCandidates(grid, 0, 3);
    expect(candidates).not.toContain(1);
    expect(candidates).not.toContain(2);
    expect(candidates).not.toContain(3);
  });
});

// ─── Validator tests ──────────────────────────────────────────────────────────

describe('Sudoku Validator', () => {
  it('detects a solved board', () => {
    const result = generatePuzzle(Difficulty.EASY, 42);
    const board = makeBoardState(result.solution.grid, result.puzzleData.grid);
    expect(isBoardSolved(board, result.solution.grid)).toBe(true);
  });

  it('detects unsolved board', () => {
    const result = generatePuzzle(Difficulty.EASY, 42);
    const board = makeBoardState(result.puzzleData.grid, result.puzzleData.grid);
    expect(isBoardSolved(board, result.solution.grid)).toBe(false);
  });

  it('detects conflicts', () => {
    const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][0] = 5;
    grid[0][1] = 5; // conflict in row
    const board = makeBoardState(grid, grid);
    const conflicts = getBoardConflicts(board);
    expect(conflicts.length).toBeGreaterThan(0);
  });
});

// ─── Hint tests ───────────────────────────────────────────────────────────────

describe('Sudoku Hints', () => {
  it('returns a valid hint for an incomplete puzzle', () => {
    const result = generatePuzzle(Difficulty.EASY, 42);
    const board = makeBoardState(result.puzzleData.grid, result.puzzleData.grid);
    const gameState = { board, selectedCell: null, isNotesMode: false };
    const hint = getHint(gameState, result.solution.grid);
    expect(hint).not.toBeNull();
    expect(hint!.position).toBeDefined();
  });

  it('hint reveals the correct solution value', () => {
    const result = generatePuzzle(Difficulty.MEDIUM, 42);
    const board = makeBoardState(result.puzzleData.grid, result.puzzleData.grid);
    const gameState = { board, selectedCell: null, isNotesMode: false };
    const hint = getHint(gameState, result.solution.grid);
    expect(hint).not.toBeNull();
    const { row, col } = hint!.position!;
    const hintedBoard = (hint!.revealedState as typeof gameState).board;
    expect(hintedBoard[row][col].value).toBe(result.solution.grid[row][col]);
  });

  it('returns null when board is already solved', () => {
    const result = generatePuzzle(Difficulty.EASY, 42);
    const board = makeBoardState(result.solution.grid, result.puzzleData.grid);
    const gameState = { board, selectedCell: null, isNotesMode: false };
    const hint = getHint(gameState, result.solution.grid);
    expect(hint).toBeNull();
  });
});
