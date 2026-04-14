import { useWindowDimensions } from 'react-native';
import { useBreakpoint } from './useBreakpoint';

const MAX_BOARD_SIZE = 600;
const PHONE_PADDING = 32;
const TABLET_BOARD_RATIO = 0.55; // board takes 55% of width on tablet split layout

export function useGameBoardSize(gridSize: number): {
  boardSize: number;
  cellSize: number;
} {
  const { width, height } = useWindowDimensions();
  const { isTablet } = useBreakpoint();

  const availableWidth = isTablet
    ? width * TABLET_BOARD_RATIO - PHONE_PADDING
    : width - PHONE_PADDING;

  const availableHeight = height * 0.6;
  const available = Math.min(availableWidth, availableHeight, MAX_BOARD_SIZE);
  const boardSize = Math.floor(available);
  const cellSize = Math.floor(boardSize / gridSize);

  return { boardSize, cellSize };
}
