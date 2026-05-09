/**
 * game-registry.ts
 *
 * Central registry of all game components.
 * To add a new game:
 *   1. Create the component in src/components/game/
 *   2. Add it here
 *   3. Deploy via `eas update` — no Play Store submission needed
 */
import { Difficulty, GameType } from '@puzzle-roll/shared';
import type { ComponentType } from 'react';

export interface GameProps {
  puzzleId: string;
  puzzleData: unknown;
  solution: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
  puzzleNumber?: number;
  difficulty?: Difficulty;
}

// Lazy imports so unused game bundles are not loaded at startup
import SudokuGame from '../components/game/SudokuGame';
import TangoGame from '../components/game/TangoGame';
import QueensGame from '../components/game/QueensGame';
import ZipGame from '../components/game/ZipGame';
import NonogramGame from '../components/game/NonogramGame';
import MinesweeperGame from '../components/game/MinesweeperGame';
import KakuroGame from '../components/game/KakuroGame';
import LightUpGame from '../components/game/LightUpGame';
import FutoshikiGame from '../components/game/FutoshikiGame';
import HitoriGame from '../components/game/HitoriGame';

export const GAME_REGISTRY: Partial<Record<GameType, ComponentType<GameProps>>> = {
  [GameType.SUDOKU]: SudokuGame,
  [GameType.TANGO]: TangoGame,
  [GameType.QUEENS]: QueensGame,
  [GameType.ZIP]: ZipGame,
  [GameType.NONOGRAM]: NonogramGame,
  [GameType.MINESWEEPER]: MinesweeperGame,
  [GameType.KAKURO]: KakuroGame,
  [GameType.LIGHT_UP]: LightUpGame,
  [GameType.FUTOSHIKI]: FutoshikiGame,
  [GameType.HITORI]: HitoriGame,
};

export const GAME_NAMES: Record<string, string> = {
  [GameType.SUDOKU]: 'Sudoku',
  [GameType.TANGO]: 'Tango',
  [GameType.QUEENS]: 'Queens',
  [GameType.ZIP]: 'Zip',
  [GameType.NONOGRAM]: 'Nonogram',
  [GameType.MINESWEEPER]: 'Minesweeper',
  [GameType.KAKURO]: 'Kakuro',
  [GameType.LIGHT_UP]: 'Light Up',
  [GameType.FUTOSHIKI]: 'Futoshiki',
  [GameType.HITORI]: 'Hitori',
};