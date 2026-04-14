import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, runOnJS } from 'react-native-reanimated';
import { useMutation } from '@tanstack/react-query';
import { SudokuEngine, GameType, Difficulty } from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useGameBoardSize } from '../../hooks/useGameBoardSize';
import { useSettingsStore } from '../../stores/settings.store';
import { useOfflineQueueStore } from '../../stores/offline-queue.store';
import { apiClient } from '../../lib/api-client';
import { puzzleCache } from '../../services/puzzle-cache.service';
import { generateShareableResult } from '../../lib/shareable-result';
import GameTimer from './GameTimer';
import HintButton from './HintButton';
import CompletionModal from './CompletionModal';

interface SudokuGameProps {
  puzzleId: string;
  puzzleData: unknown;
  solution: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
}

type SudokuDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function buildInitialBoard(puzzleGrid: SudokuEngine.SudokuGrid): SudokuEngine.SudokuBoardState {
  return puzzleGrid.map((row, r) =>
    row.map((val, c): SudokuEngine.SudokuCellState => ({
      value: val,
      isGiven: val !== 0,
      isError: false,
      notes: new Set(),
    }))
  );
}

function CellView({
  cell,
  row,
  col,
  isSelected,
  isHighlighted,
  isConflict,
  cellSize,
  onPress,
}: {
  cell: SudokuEngine.SudokuCellState;
  row: number;
  col: number;
  isSelected: boolean;
  isHighlighted: boolean;
  isConflict: boolean;
  cellSize: number;
  onPress: () => void;
}) {
  const isBoxBorderRight = col === 2 || col === 5;
  const isBoxBorderBottom = row === 2 || row === 5;

  const bgColor = isSelected
    ? '#6366f1'
    : isConflict
    ? '#7f1d1d'
    : isHighlighted
    ? '#1f2937'
    : 'transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: cellSize,
        height: cellSize,
        backgroundColor: bgColor,
        borderRightWidth: isBoxBorderRight ? 2 : 0.5,
        borderBottomWidth: isBoxBorderBottom ? 2 : 0.5,
        borderColor: '#374151',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={`Cell row ${row + 1} column ${col + 1}, value ${cell.value || 'empty'}`}
      accessibilityRole="button"
    >
      {cell.value !== 0 ? (
        <Text
          style={{
            fontSize: cellSize * 0.45,
            fontFamily: 'SpaceGrotesk-Bold',
            color: cell.isGiven ? '#f9fafb' : isConflict ? '#fca5a5' : '#a5b4fc',
          }}
        >
          {cell.value}
        </Text>
      ) : cell.notes.size > 0 ? (
        <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: cellSize - 2 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <Text
              key={n}
              style={{
                width: (cellSize - 2) / 3,
                fontSize: cellSize * 0.12,
                textAlign: 'center',
                color: cell.notes.has(n as SudokuDigit) ? '#6b7280' : 'transparent',
                fontFamily: 'SpaceGrotesk-Regular',
              }}
            >
              {n}
            </Text>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function SudokuGame({ puzzleId, puzzleData, solution: _solution, isDaily, dailyPuzzleId }: SudokuGameProps) {
  const { session, startSession, updateState, undo, useHint, markSolved } = useGameSessionStore();
  const { lightImpact, heavyImpact, successNotification, errorNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { isTablet } = useBreakpoint();
  const { boardSize, cellSize } = useGameBoardSize(9);
  const { autoRemoveNotes } = useSettingsStore();
  const { enqueue } = useOfflineQueueStore();

  const completionScale = useSharedValue(1);
  const completionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: completionScale.value }],
  }));

  // Fetch solution lazily (only needed for hints and on completion check)
  const [solutionGrid, setSolutionGrid] = useState<SudokuEngine.SudokuGrid | null>(null);

  const loadSolution = useCallback(async () => {
    if (solutionGrid) return solutionGrid;
    try {
      const result = await apiClient.get<{ id: string; solution: { grid: SudokuEngine.SudokuGrid } }>(
        `/puzzles/id/${puzzleId}/solution`
      );
      setSolutionGrid(result.solution.grid);
      return result.solution.grid;
    } catch {
      return null;
    }
  }, [puzzleId, solutionGrid]);

  // Initialize session
  useEffect(() => {
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    const board = buildInitialBoard(pd.grid);
    startSession({
      puzzleId,
      gameType: GameType.SUDOKU,
      difficulty: Difficulty.MEDIUM,
      isDaily,
      dailyPuzzleId,
      initialState: { board, selectedCell: null, isNotesMode: false } satisfies SudokuEngine.SudokuGameState,
    });
  }, [puzzleId]);

  const gameState = session?.currentState as SudokuEngine.SudokuGameState | undefined;
  const board = gameState?.board;
  const selectedCell = gameState?.selectedCell;
  const isNotesMode = gameState?.isNotesMode ?? false;

  const { mutate: submitCompletion } = useMutation({
    mutationFn: (payload: {
      elapsedSeconds: number;
      hintsUsed: number;
      shareableResult: string;
    }) =>
      apiClient.post('/progress/complete', {
        puzzleId,
        gameType: GameType.SUDOKU,
        difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily,
        dailyPuzzleId,
        ...payload,
        completedAt: new Date().toISOString(),
      }),
    onError: (_, variables) => {
      // Enqueue for offline sync
      enqueue({
        puzzleId,
        gameType: GameType.SUDOKU,
        difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily,
        dailyPuzzleId,
        ...variables,
        shareableResult: variables.shareableResult,
      });
    },
  });

  const handleCellPress = useCallback((row: number, col: number) => {
    if (!gameState || session?.isSolved) return;
    lightImpact();
    updateState({ ...gameState, selectedCell: { row, col } }, false);
  }, [gameState, session?.isSolved, lightImpact, updateState]);

  const handleDigitPress = useCallback(async (digit: SudokuDigit) => {
    if (!gameState || !selectedCell || session?.isSolved) return;
    const { row, col } = selectedCell;
    const cell = gameState.board[row][col];
    if (cell.isGiven) return;

    lightImpact();

    let newBoard = gameState.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));

    if (isNotesMode) {
      const notes = new Set(newBoard[row][col].notes);
      if (notes.has(digit)) notes.delete(digit);
      else notes.add(digit);
      newBoard[row][col] = { ...newBoard[row][col], notes };
    } else {
      newBoard[row][col] = { ...newBoard[row][col], value: digit, notes: new Set() };
      if (autoRemoveNotes) {
        newBoard = SudokuEngine.applyAutoRemoveNotes(newBoard, row, col, digit);
      }
    }

    const conflicts = SudokuEngine.getBoardConflicts(newBoard);
    conflicts.forEach(([r, c]) => {
      newBoard[r][c] = { ...newBoard[r][c], isError: true };
    });
    // Clear previous errors
    newBoard.forEach((r, ri) =>
      r.forEach((cell, ci) => {
        if (!conflicts.some(([cr, cc]) => cr === ri && cc === ci)) {
          newBoard[ri][ci] = { ...newBoard[ri][ci], isError: false };
        }
      })
    );

    const newState: SudokuEngine.SudokuGameState = { ...gameState, board: newBoard };
    updateState(newState);

    // Check solved
    const sol = await loadSolution();
    if (sol && SudokuEngine.isBoardSolved(newBoard, sol)) {
      markSolved();
      successNotification();
      completionScale.value = withSequence(
        withSpring(1.05),
        withSpring(1)
      );

      const elapsed = session?.elapsedSeconds ?? 0;
      const hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({
        gameType: GameType.SUDOKU,
        difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        elapsedSeconds: elapsed,
        hintsUsed: hints,
        date: new Date().toISOString().slice(0, 10),
        isDaily,
      });

      submitCompletion({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await puzzleCache.markCompleted(puzzleId, GameType.SUDOKU);
      await showInterstitialIfDue();
    }
  }, [gameState, selectedCell, session, isNotesMode, autoRemoveNotes, lightImpact, updateState, loadSolution, markSolved, successNotification]);

  const handleHintPress = useCallback(async () => {
    if (!gameState) return;
    const canUse = useHint();
    if (!canUse) {
      // Show rewarded ad to earn hint
      const granted = await showRewardedAd();
      if (!granted) return;
      // Grant the hint manually without decrementing again
    }

    const sol = await loadSolution();
    if (!sol) return;

    const hint = SudokuEngine.getHint(gameState, sol);
    if (!hint) return;

    lightImpact();
    updateState(hint.revealedState as SudokuEngine.SudokuGameState);
  }, [gameState, useHint, showRewardedAd, loadSolution, lightImpact, updateState]);

  const handleErase = useCallback(() => {
    if (!gameState || !selectedCell || session?.isSolved) return;
    const { row, col } = selectedCell;
    const cell = gameState.board[row][col];
    if (cell.isGiven) return;
    lightImpact();
    const newBoard = gameState.board.map((r, ri) =>
      r.map((c, ci) =>
        ri === row && ci === col
          ? { ...c, value: 0 as const, notes: new Set<SudokuDigit>(), isError: false }
          : { ...c, notes: new Set(c.notes) }
      )
    );
    updateState({ ...gameState, board: newBoard });
  }, [gameState, selectedCell, session?.isSolved, lightImpact, updateState]);

  const toggleNotesMode = useCallback(() => {
    if (!gameState) return;
    lightImpact();
    updateState({ ...gameState, isNotesMode: !isNotesMode }, false);
  }, [gameState, isNotesMode, lightImpact, updateState]);

  if (!board || !session) {
    return (
      <View className="flex-1 items-center justify-center bg-navy-950">
        <Text className="text-text-secondary font-sans">Loading puzzle...</Text>
      </View>
    );
  }

  // Highlight: same row, col, box, or same digit
  const getHighlighted = (r: number, c: number) => {
    if (!selectedCell) return false;
    const { row, col } = selectedCell;
    if (r === row || c === col) return true;
    const boxRow = Math.floor(row / 3);
    const boxCol = Math.floor(col / 3);
    if (Math.floor(r / 3) === boxRow && Math.floor(c / 3) === boxCol) return true;
    const sv = board[row][col].value;
    if (sv !== 0 && board[r][c].value === sv) return true;
    return false;
  };

  const GameBoard = (
    <View
      style={{
        width: boardSize,
        height: boardSize,
        borderWidth: 2,
        borderColor: '#374151',
      }}
    >
      {board.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((cell, ci) => (
            <CellView
              key={ci}
              cell={cell}
              row={ri}
              col={ci}
              isSelected={selectedCell?.row === ri && selectedCell?.col === ci}
              isHighlighted={getHighlighted(ri, ci)}
              isConflict={cell.isError}
              cellSize={cellSize}
              onPress={() => handleCellPress(ri, ci)}
            />
          ))}
        </View>
      ))}
    </View>
  );

  const Controls = (
    <View className={isTablet ? 'flex-1 pl-6' : 'mt-4'}>
      {/* Timer + controls row */}
      <View className="flex-row items-center justify-between mb-4">
        <GameTimer />
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => undo()}
            className="bg-surface rounded-xl px-3 py-2"
            accessibilityLabel="Undo last move"
          >
            <Text className="text-text-primary font-sans text-sm">↩ Undo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleNotesMode}
            className={`rounded-xl px-3 py-2 ${isNotesMode ? 'bg-game-sudoku' : 'bg-surface'}`}
            accessibilityLabel={`Notes mode ${isNotesMode ? 'on' : 'off'}`}
          >
            <Text className={`font-sans text-sm ${isNotesMode ? 'text-white' : 'text-text-primary'}`}>
              ✏️ Notes
            </Text>
          </TouchableOpacity>
          <HintButton
            hintsRemaining={session.hintsRemaining}
            onPress={handleHintPress}
          />
        </View>
      </View>

      {/* Digit pad */}
      <View className="flex-row flex-wrap gap-2">
        {([1, 2, 3, 4, 5, 6, 7, 8, 9] as SudokuDigit[]).map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => handleDigitPress(d)}
            className="bg-surface rounded-xl items-center justify-center border border-border-subtle"
            style={{ width: 44, height: 52 }}
            accessibilityLabel={`Enter ${d}`}
            accessibilityRole="button"
          >
            <Text className="text-text-primary font-sans-bold text-xl">{d}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={handleErase}
          className="bg-surface rounded-xl items-center justify-center border border-border-subtle"
          style={{ width: 44, height: 52 }}
          accessibilityLabel="Erase cell"
          accessibilityRole="button"
        >
          <Text className="text-text-secondary font-sans text-lg">⌫</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className={`flex-1 px-4 pt-2 ${isTablet ? 'flex-row items-start' : 'items-center'}`}>
      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.back()}
        className="absolute top-2 left-4 z-10"
        accessibilityLabel="Go back"
      >
        <Text className="text-text-secondary font-sans text-base">←</Text>
      </TouchableOpacity>

      <Animated.View style={completionStyle}>
        {GameBoard}
      </Animated.View>

      {Controls}

      {session.isSolved && (
        <CompletionModal
          gameType={GameType.SUDOKU}
          elapsedSeconds={session.elapsedSeconds}
          hintsUsed={session.hintsUsed}
          isDaily={isDaily}
          shareableResult={generateShareableResult({
            gameType: GameType.SUDOKU,
            difficulty: session.difficulty,
            elapsedSeconds: session.elapsedSeconds,
            hintsUsed: session.hintsUsed,
            date: new Date().toISOString().slice(0, 10),
            isDaily,
          })}
          onClose={() => router.back()}
        />
      )}
    </View>
  );
}


