import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { useMutation } from '@tanstack/react-query';
import { SudokuEngine, GameType, Difficulty } from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useGameBoardSize } from '../../hooks/useGameBoardSize';
import { useSettingsStore } from '../../stores/settings.store';
import { useOfflineQueueStore } from '../../stores/offline-queue.store';
import { usePuzzleProgressStore } from '../../stores/puzzle-progress.store';
import { apiClient } from '../../lib/api-client';
import { puzzleCache } from '../../services/puzzle-cache.service';
import { generateShareableResult } from '../../lib/shareable-result';
import { playSound } from '../../services/sound.service';
import GameTimer from './GameTimer';
import HintButton from './HintButton';
import CompletionModal from './CompletionModal';
import PauseModal from './PauseModal';
import ResumeModal from './ResumeModal';

interface SudokuGameProps {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
}

type SudokuDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function buildInitialBoard(puzzleGrid: SudokuEngine.SudokuGrid): SudokuEngine.SudokuBoardState {
  return puzzleGrid.map((row) =>
    row.map((val): SudokuEngine.SudokuCellState => ({
      value: val,
      isGiven: val !== 0,
      isError: false,
      notes: new Set(),
    }))
  );
}

function CellView({
  cell, row, col, isSelected, isHighlighted, isConflict, cellSize, onPress,
}: {
  cell: SudokuEngine.SudokuCellState;
  row: number; col: number;
  isSelected: boolean; isHighlighted: boolean; isConflict: boolean;
  cellSize: number; onPress: () => void;
}) {
  const isBoxRight = col === 2 || col === 5;
  const isBoxBottom = row === 2 || row === 5;
  const noteSize = Math.max(9, cellSize * 0.22);
  const digitSize = Math.max(18, cellSize * 0.52);

  const bgColor = isSelected ? '#6366f1'
    : isConflict ? '#7f1d1d'
    : isHighlighted ? '#1f2937'
    : 'transparent';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: cellSize, height: cellSize,
        backgroundColor: bgColor,
        borderRightWidth: isBoxRight ? 2 : 0.5,
        borderBottomWidth: isBoxBottom ? 2 : 0.5,
        borderColor: '#374151',
        alignItems: 'center', justifyContent: 'center',
      }}
      accessibilityLabel={`Row ${row + 1} column ${col + 1}${cell.value ? `, value ${cell.value}` : ', empty'}`}
      accessibilityRole="button"
    >
      {cell.value !== 0 ? (
        <Text style={{
          fontSize: digitSize,
          fontFamily: 'SpaceGrotesk-Bold',
          color: cell.isGiven ? '#f9fafb' : isConflict ? '#fca5a5' : '#a5b4fc',
        }}>
          {cell.value}
        </Text>
      ) : cell.notes.size > 0 ? (
        // 3×3 note grid — only show digits that are actually in the notes Set
        <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: cellSize - 4 }}>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as SudokuDigit[]).map((n) => (
            <Text
              key={n}
              style={{
                width: (cellSize - 4) / 3,
                fontSize: noteSize,
                textAlign: 'center',
                color: cell.notes.has(n) ? '#818cf8' : 'transparent',
                fontFamily: 'SpaceGrotesk-Medium',
                lineHeight: noteSize + 4,
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

export default function SudokuGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: SudokuGameProps) {
  const { session, startSession, updateState, undo, useHint, markSolved, pauseTimer, resumeTimer } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { isTablet } = useBreakpoint();
  const { boardSize, cellSize } = useGameBoardSize(9);
  const { autoRemoveNotes } = useSettingsStore();
  const { enqueue } = useOfflineQueueStore();
  const { saveProgress, loadProgress, clearProgress, markCompleted: markProgressCompleted } = usePuzzleProgressStore();

  const [solutionGrid, setSolutionGrid] = useState<SudokuEngine.SudokuGrid | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [savedProgress, setSavedProgress] = useState<unknown>(null);
  const [initialized, setInitialized] = useState(false);

  const completionScale = useSharedValue(1);
  const completionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: completionScale.value }],
  }));

  const loadSolution = useCallback(async () => {
    if (solutionGrid) return solutionGrid;
    try {
      const result = await apiClient.get<{ id: string; solution: { grid: SudokuEngine.SudokuGrid } }>(
        `/puzzles/id/${puzzleId}/solution`
      );
      setSolutionGrid(result.solution.grid);
      return result.solution.grid;
    } catch { return null; }
  }, [puzzleId, solutionGrid]);

  // On mount: check for saved progress
  useEffect(() => {
    async function init() {
      const saved = await loadProgress(puzzleId);
      if (saved && !saved.hasOwnProperty('completedAt')) {
        // Has in-progress save
        setSavedProgress(saved);
        setShowResumeModal(true);
      } else {
        startFresh();
      }
    }
    init();
  }, [puzzleId]);

  function startFresh() {
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
    setInitialized(true);
  }

  function continueFromSave() {
    if (!savedProgress) { startFresh(); return; }
    const saved = savedProgress as ReturnType<typeof usePuzzleProgressStore.getState>['loadProgress'] extends (id: string) => Promise<infer T> ? NonNullable<T> : never;
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    startSession({
      puzzleId,
      gameType: GameType.SUDOKU,
      difficulty: Difficulty.MEDIUM,
      isDaily,
      dailyPuzzleId,
      initialState: (saved as { currentState: unknown }).currentState ?? { board: buildInitialBoard(pd.grid), selectedCell: null, isNotesMode: false },
    });
    setInitialized(true);
  }

  // Auto-save progress every 10 seconds
  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const interval = setInterval(async () => {
      if (session && !session.isSolved) {
        await saveProgress({
          puzzleId,
          gameType: GameType.SUDOKU,
          difficulty: session.difficulty,
          isDaily,
          dailyPuzzleId,
          elapsedSeconds: session.elapsedSeconds,
          hintsUsed: session.hintsUsed,
          hintsRemaining: session.hintsRemaining,
          currentState: session.currentState,
          savedAt: Date.now(),
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [initialized, session?.elapsedSeconds, session?.isSolved]);

  const gameState = session?.currentState as SudokuEngine.SudokuGameState | undefined;
  const board = gameState?.board;
  const selectedCell = gameState?.selectedCell;
  const isNotesMode = gameState?.isNotesMode ?? false;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submitCompletion } = useMutation({
    mutationFn: (payload: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', {
        puzzleId, gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily, dailyPuzzleId, ...payload, completedAt: new Date().toISOString(),
      }),
    onError: (_, variables) => {
      enqueue({
        puzzleId, gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily, dailyPuzzleId, ...variables, completedAt: '',
      });
    },
  });

  const handleCellPress = useCallback((row: number, col: number) => {
    if (!gameState || session?.isSolved || isPaused) return;
    lightImpact();
    playSound('cell_tap');
    updateState({ ...gameState, selectedCell: { row, col } }, false);
  }, [gameState, session?.isSolved, isPaused, lightImpact, updateState]);

  const handleDigitPress = useCallback(async (digit: SudokuDigit) => {
    if (!gameState || !selectedCell || session?.isSolved || isPaused) return;
    const { row, col } = selectedCell;
    const cell = gameState.board[row][col];
    if (cell.isGiven) return;

    lightImpact();

    let newBoard = gameState.board.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })));

    if (isNotesMode) {
      // In notes mode: toggle the specific note digit, leave others unchanged
      const notes = new Set(newBoard[row][col].notes);
      if (notes.has(digit)) {
        notes.delete(digit);
      } else {
        notes.add(digit);
      }
      newBoard[row][col] = { ...newBoard[row][col], notes };
      playSound('digit_place');
    } else {
      newBoard[row][col] = { ...newBoard[row][col], value: digit, notes: new Set() };
      if (autoRemoveNotes) {
        newBoard = SudokuEngine.applyAutoRemoveNotes(newBoard, row, col, digit);
      }
      playSound('digit_place');
    }

    // Conflict detection
    const conflicts = SudokuEngine.getBoardConflicts(newBoard);
    const conflictSet = new Set(conflicts.map(([r, c]) => `${r},${c}`));
    newBoard = newBoard.map((r, ri) =>
      r.map((c, ci) => ({ ...c, isError: conflictSet.has(`${ri},${ci}`) }))
    );

    if (conflicts.length > 0) playSound('error');

    const newState: SudokuEngine.SudokuGameState = { ...gameState, board: newBoard };
    updateState(newState);

    // Only check solved when placing an actual value (not notes)
    if (!isNotesMode) {
      const sol = await loadSolution();
      if (sol && SudokuEngine.isBoardSolved(newBoard, sol)) {
        markSolved();
        successNotification();
        playSound('complete');
        completionScale.value = withSequence(withSpring(1.05), withSpring(1));
        const elapsed = session?.elapsedSeconds ?? 0;
        const hints = session?.hintsUsed ?? 0;
        const shareable = generateShareableResult({
          gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
          elapsedSeconds: elapsed, hintsUsed: hints,
          date: new Date().toISOString().slice(0, 10), isDaily,
        });
        submitCompletion({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
        await markProgressCompleted(puzzleId);
        await puzzleCache.markCompleted(puzzleId, GameType.SUDOKU);
        await showInterstitialIfDue();
      }
    }
  }, [gameState, selectedCell, session, isNotesMode, isPaused, autoRemoveNotes, lightImpact, updateState, loadSolution, markSolved, successNotification]);

  const handleHintPress = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint();
    if (!canUse) {
      const granted = await showRewardedAd();
      if (!granted) return;
    }
    const sol = await loadSolution();
    if (!sol) return;
    const hint = SudokuEngine.getHint(gameState, sol);
    if (!hint) return;
    lightImpact();
    playSound('hint');
    updateState(hint.revealedState as SudokuEngine.SudokuGameState);
  }, [gameState, isPaused, useHint, showRewardedAd, loadSolution, lightImpact, updateState]);

  const handleErase = useCallback(() => {
    if (!gameState || !selectedCell || session?.isSolved || isPaused) return;
    const { row, col } = selectedCell;
    if (gameState.board[row][col].isGiven) return;
    lightImpact();
    const newBoard = gameState.board.map((r, ri) =>
      r.map((c, ci) =>
        ri === row && ci === col
          ? { ...c, value: 0 as const, notes: new Set<SudokuDigit>(), isError: false }
          : { ...c, notes: new Set(c.notes) }
      )
    );
    updateState({ ...gameState, board: newBoard });
  }, [gameState, selectedCell, session?.isSolved, isPaused, lightImpact, updateState]);

  const toggleNotesMode = useCallback(() => {
    if (!gameState || isPaused) return;
    lightImpact();
    updateState({ ...gameState, isNotesMode: !isNotesMode }, false);
  }, [gameState, isNotesMode, isPaused, lightImpact, updateState]);

  const handleReset = useCallback(() => {
    if (!gameState) return;
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    const freshBoard = buildInitialBoard(pd.grid);
    // Reset board but preserve timer
    updateState({ board: freshBoard, selectedCell: null, isNotesMode: false });
  }, [gameState, puzzleData, updateState]);

  const handlePauseToggle = useCallback(() => {
    if (isPaused) resumeTimer();
    else pauseTimer();
  }, [isPaused, pauseTimer, resumeTimer]);

  if (!initialized) {
    return (
      <ResumeModal
        visible={showResumeModal}
        elapsedSeconds={(savedProgress as { elapsedSeconds?: number })?.elapsedSeconds ?? 0}
        onContinue={() => { setShowResumeModal(false); continueFromSave(); }}
        onRestart={() => { setShowResumeModal(false); clearProgress(puzzleId); startFresh(); }}
      />
    );
  }

  if (!board || !session) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading puzzle...</Text>
      </View>
    );
  }

  const getHighlighted = (r: number, c: number) => {
    if (!selectedCell) return false;
    const { row, col } = selectedCell;
    if (r === row || c === col) return true;
    if (Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3)) return true;
    const sv = board[row][col].value;
    if (sv !== 0 && board[r][c].value === sv) return true;
    return false;
  };

  return (
    <View style={styles.root}>
      {/* Header row */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <GameTimer />
        <TouchableOpacity onPress={handlePauseToggle} style={styles.pauseBtn} accessibilityLabel={isPaused ? 'Resume' : 'Pause'}>
          <Text style={styles.pauseText}>{isPaused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]}
        showsVerticalScrollIndicator={false}
      >
        {/* Board */}
        <Animated.View style={[completionStyle, { marginTop: 8 }]}>
          <View style={{ width: boardSize, height: boardSize, borderWidth: 2, borderColor: '#374151' }}>
            {board.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {row.map((cell, ci) => (
                  <CellView
                    key={ci} cell={cell} row={ri} col={ci}
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
        </Animated.View>

        {/* Controls */}
        <View style={isTablet ? styles.controlsTablet : styles.controls}>
          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={() => { undo(); playSound('undo'); }} style={styles.actionBtn} accessibilityLabel="Undo">
              <Text style={styles.actionBtnText}>↩</Text>
              <Text style={styles.actionBtnLabel}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleNotesMode}
              style={[styles.actionBtn, isNotesMode && styles.actionBtnActive]}
              accessibilityLabel={`Notes mode ${isNotesMode ? 'on' : 'off'}`}
            >
              <Text style={styles.actionBtnText}>✏️</Text>
              <Text style={[styles.actionBtnLabel, isNotesMode && styles.actionBtnLabelActive]}>Notes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleErase} style={styles.actionBtn} accessibilityLabel="Erase">
              <Text style={styles.actionBtnText}>⌫</Text>
              <Text style={styles.actionBtnLabel}>Erase</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReset} style={styles.actionBtn} accessibilityLabel="Reset board">
              <Text style={styles.actionBtnText}>🔄</Text>
              <Text style={styles.actionBtnLabel}>Reset</Text>
            </TouchableOpacity>
            <HintButton hintsRemaining={session.hintsRemaining} onPress={handleHintPress} />
          </View>

          {/* Number pad — 3×3 grid */}
          <View style={styles.numPad}>
            {([1, 2, 3, 4, 5, 6, 7, 8, 9] as SudokuDigit[]).map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => handleDigitPress(d)}
                style={styles.numKey}
                accessibilityLabel={`Enter ${d}`}
                accessibilityRole="button"
              >
                <Text style={styles.numKeyText}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Pause overlay */}
      <PauseModal
        visible={isPaused && !session.isSolved}
        elapsedSeconds={session.elapsedSeconds}
        hintsUsed={session.hintsUsed}
        hintsRemaining={session.hintsRemaining}
        gameName="Sudoku"
        onResume={resumeTimer}
      />

      {/* Completion */}
      {session.isSolved && (
        <CompletionModal
          gameType={GameType.SUDOKU}
          elapsedSeconds={session.elapsedSeconds}
          hintsUsed={session.hintsUsed}
          isDaily={isDaily}
          shareableResult={generateShareableResult({
            gameType: GameType.SUDOKU, difficulty: session.difficulty,
            elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed,
            date: new Date().toISOString().slice(0, 10), isDaily,
          })}
          onClose={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060818' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#060818' },
  loadingText: { color: '#9ca3af', fontFamily: 'SpaceGrotesk-Regular' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 16,
  },
  backBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { color: '#9ca3af', fontFamily: 'SpaceGrotesk-Regular', fontSize: 22 },
  pauseBtn: {
    padding: 8, minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1f2937', borderRadius: 12,
  },
  pauseText: { fontSize: 20 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  scrollTablet: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 32 },
  controls: { width: '100%', marginTop: 20 },
  controlsTablet: { flex: 1, paddingLeft: 16, maxWidth: 280 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111827', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    minWidth: 56, minHeight: 56,
  },
  actionBtnActive: { backgroundColor: '#3730a3' },
  actionBtnText: { fontSize: 18, marginBottom: 2 },
  actionBtnLabel: { color: '#9ca3af', fontFamily: 'SpaceGrotesk-Medium', fontSize: 10 },
  actionBtnLabelActive: { color: '#a5b4fc' },
  numPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  numKey: {
    width: '30%',
    aspectRatio: 1.6,
    backgroundColor: '#111827',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
    minHeight: 52,
  },
  numKeyText: {
    color: '#f9fafb',
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 24,
  },
});