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
import { usePuzzleProgressStore, SavedPuzzleProgress } from '../../stores/puzzle-progress.store';
import { useAppTheme } from '../../hooks/useAppTheme';
import { apiClient } from '../../lib/api-client';
import { puzzleCache } from '../../services/puzzle-cache.service';
import { generateShareableResult } from '../../lib/shareable-result';
import { playSound } from '../../services/sound.service';
import GameTimer from './GameTimer';
import HintButton from './HintButton';
import CompletionModal from './CompletionModal';
import PauseModal from './PauseModal';
import ResumeModal from './ResumeModal';
import ConfirmModal from '../ui/ConfirmModal';

interface SudokuGameProps {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
}

type SudokuDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// Extended cell state: isWrongEntry = the cell the player just typed (red bg)
// isError = victim cells that conflict with it (red text only)
interface ExtendedCellState extends SudokuEngine.SudokuCellState {
  isWrongEntry?: boolean;
}

type ExtendedBoard = ExtendedCellState[][];

function buildInitialBoard(puzzleGrid: SudokuEngine.SudokuGrid): ExtendedBoard {
  return puzzleGrid.map((row) =>
    row.map((val): ExtendedCellState => ({
      value: val, isGiven: val !== 0, isError: false, isWrongEntry: false, notes: new Set(),
    }))
  );
}

/**
 * Reconstruct notes Sets after JSON deserialisation through AsyncStorage.
 * JSON.stringify turns Set → {}, so we must convert back on restore.
 */
function deserialiseBoardNotes(rawBoard: ExtendedCellState[][]): ExtendedBoard {
  return rawBoard.map((row) =>
    row.map((cell) => {
      const rawNotes = Array.isArray(cell.notes)
        ? cell.notes
        : Object.values(cell.notes ?? {});

      return {
        ...cell,
        isWrongEntry: false,
        notes: new Set<SudokuDigit>(rawNotes as SudokuDigit[]),
      };
    })
  );
}

function CellView({
  cell, row, col, isSelected, isHighlighted, cellSize, onPress, isDark,
}: {
  cell: ExtendedCellState;
  row: number; col: number;
  isSelected: boolean; isHighlighted: boolean;
  cellSize: number; onPress: () => void; isDark: boolean;
}) {
  const noteSize = Math.max(9, cellSize * 0.22);
  const digitSize = Math.max(18, cellSize * 0.52);

  const bgColor = isSelected
    ? '#6366f1'
    : cell.isWrongEntry
    ? (isDark ? '#7f1d1d' : '#fee2e2')
    : isHighlighted
    ? (isDark ? '#1f2937' : '#e0e7ff')
    : 'transparent';

  const digitColor = isSelected
    ? '#ffffff'
    : cell.isWrongEntry
    ? '#ef4444'
    : cell.isError
    ? '#ef4444'
    : cell.isGiven
    ? (isDark ? '#f9fafb' : '#111827')
    : '#6366f1';

  // Border: every cell has a thin border on all sides.
  // Box boundaries (cols 3,6 / rows 3,6) get a thicker RIGHT/BOTTOM border via margin trick.
  const isBoxRight = col === 2 || col === 5;
  const isBoxBottom = row === 2 || row === 5;

  return (
    <TouchableOpacity
      onPress={onPress}
      // delayPressIn=0 ensures instant visual feedback with no drag delay
      delayPressIn={0}
      style={{
        width: cellSize,
        height: cellSize,
        backgroundColor: bgColor,
        borderRightWidth: isBoxRight ? 2 : 0.5,
        borderBottomWidth: isBoxBottom ? 2 : 0.5,
        borderLeftWidth: col === 0 ? 0 : 0,
        borderTopWidth: row === 0 ? 0 : 0,
        borderColor: isDark ? '#374151' : '#9ca3af',
        // Victim cells: highlight border in red
        ...(cell.isError && !cell.isWrongEntry ? {
          borderColor: '#ef4444',
        } : {}),
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={`Row ${row + 1} col ${col + 1}${cell.value ? `, ${cell.value}` : ''}`}
      accessibilityRole="button"
    >
      {cell.value !== 0 ? (
        <Text style={{ fontSize: digitSize, fontFamily: 'SpaceGrotesk-Bold', color: digitColor }}>
          {cell.value}
        </Text>
      ) : cell.notes.size > 0 ? (
        <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: cellSize - 4 }}>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as SudokuDigit[]).map((n) => (
            <Text key={n} style={{
              width: (cellSize - 4) / 3, fontSize: noteSize, textAlign: 'center',
              color: cell.notes.has(n) ? (isSelected ? '#ffffff' : '#818cf8') : 'transparent',
              fontFamily: 'SpaceGrotesk-Medium', lineHeight: noteSize + 4,
            }}>
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
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';

  const [solutionGrid, setSolutionGrid] = useState<SudokuEngine.SudokuGrid | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const completionScale = useSharedValue(1);
  const completionStyle = useAnimatedStyle(() => ({ transform: [{ scale: completionScale.value }] }));

  const loadSolution = useCallback(async () => {
    if (solutionGrid) return solutionGrid;
    try {
      const r = await apiClient.get<{ id: string; solution: { grid: SudokuEngine.SudokuGrid } }>(`/puzzles/id/${puzzleId}/solution`);
      setSolutionGrid(r.solution.grid);
      return r.solution.grid;
    } catch { return null; }
  }, [puzzleId, solutionGrid]);

  useEffect(() => {
    async function init() {
      const saved = await loadProgress(puzzleId);
      if (saved) { setSavedData(saved); setShowResumeModal(true); }
      else startFresh();
    }
    init();
  }, [puzzleId]);

  function startFresh() {
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    startSession({
      puzzleId, gameType: GameType.SUDOKU, difficulty: Difficulty.MEDIUM,
      isDaily, dailyPuzzleId,
      initialState: { board: buildInitialBoard(pd.grid), selectedCell: null, isNotesMode: false },
      initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3,
    });
    setInitialized(true);
  }

  function continueFromSave() {
    if (!savedData) { startFresh(); return; }
    // Deserialise: notes Set becomes {} after JSON round-trip through AsyncStorage
    const rawState = savedData.currentState as { board: ExtendedCellState[][]; selectedCell: unknown; isNotesMode: boolean };
    const deserialisedBoard = deserialiseBoardNotes(rawState.board);
    startSession({
      puzzleId, gameType: GameType.SUDOKU, difficulty: Difficulty.MEDIUM,
      isDaily, dailyPuzzleId,
      initialState: { ...rawState, board: deserialisedBoard },
      initialElapsedSeconds: savedData.elapsedSeconds,
      initialHintsUsed: savedData.hintsUsed,
      initialHintsRemaining: savedData.hintsRemaining,
    });
    setInitialized(true);
  }

  const doSaveProgress = useCallback(() => {
    const s = useGameSessionStore.getState().session;
    if (!s || s.isSolved) return;
    saveProgress({
      puzzleId, gameType: GameType.SUDOKU, difficulty: s.difficulty,
      isDaily, dailyPuzzleId,
      elapsedSeconds: s.elapsedSeconds,
      hintsUsed: s.hintsUsed,
      hintsRemaining: s.hintsRemaining,
      currentState: s.currentState,
      savedAt: Date.now(),
    });
  }, [puzzleId, isDaily, dailyPuzzleId, saveProgress]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(doSaveProgress, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved, doSaveProgress]);

  const gameState = session?.currentState as (SudokuEngine.SudokuGameState & { board: ExtendedBoard }) | undefined;
  const board = gameState?.board as ExtendedBoard | undefined;
  const selectedCell = gameState?.selectedCell;
  const isNotesMode = gameState?.isNotesMode ?? false;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submitCompletion } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', {
        puzzleId, gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString(),
      }),
    onError: (_, v) => enqueue({
      puzzleId, gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
      isDaily, dailyPuzzleId, ...v, completedAt: '',
    }),
  });

  const handleCellPress = useCallback((row: number, col: number) => {
    if (!gameState || session?.isSolved || isPaused) return;
    lightImpact(); playSound('cell_tap');
    updateState({ ...gameState, selectedCell: { row, col } }, false);
  }, [gameState, session?.isSolved, isPaused, lightImpact, updateState]);

  const handleDigitPress = useCallback(async (digit: SudokuDigit) => {
    if (!gameState || !selectedCell || session?.isSolved || isPaused) return;
    const { row, col } = selectedCell;
    if (gameState.board[row][col].isGiven) return;
    lightImpact();

    let newBoard: ExtendedBoard = gameState.board.map((r) =>
      r.map((c) => ({ ...c, notes: new Set(c.notes) }))
    );

    if (isNotesMode) {
      const notes = new Set(newBoard[row][col].notes);
      if (notes.has(digit)) notes.delete(digit); else notes.add(digit);
      newBoard[row][col] = { ...newBoard[row][col], notes };
      playSound('digit_place');
    } else {
      // Clear the previous wrong-entry and all victim errors first
      newBoard = newBoard.map(r => r.map(c => ({ ...c, isError: false, isWrongEntry: false })));
      newBoard[row][col] = { ...newBoard[row][col], value: digit, notes: new Set() };

      if (autoRemoveNotes) newBoard = SudokuEngine.applyAutoRemoveNotes(newBoard, row, col, digit) as ExtendedBoard;

      const conflicts = SudokuEngine.getBoardConflicts(newBoard);
      const cs = new Set(conflicts.map(([r, c]) => `${r},${c}`));

      if (cs.has(`${row},${col}`)) {
        // This placed cell caused the conflict → wrong entry (red background)
        newBoard[row][col] = { ...newBoard[row][col], isWrongEntry: true, isError: false };
        // All OTHER cells in the conflict set are victims (red text only)
        newBoard = newBoard.map((r, ri) => r.map((c, ci) => {
          if (ri === row && ci === col) return c;
          return cs.has(`${ri},${ci}`) ? { ...c, isError: true, isWrongEntry: false } : c;
        }));
        playSound('error');
      } else {
        playSound('digit_place');
      }
    }

    updateState({ ...gameState, board: newBoard });

    if (!isNotesMode) {
      const sol = await loadSolution();
      if (sol && SudokuEngine.isBoardSolved(newBoard, sol)) {
        markSolved(); successNotification(); playSound('complete');
        completionScale.value = withSequence(withSpring(1.05), withSpring(1));
        const elapsed = session?.elapsedSeconds ?? 0;
        const hints = session?.hintsUsed ?? 0;
        const shareable = generateShareableResult({
          gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
          elapsedSeconds: elapsed, hintsUsed: hints,
          date: new Date().toISOString().slice(0, 10), isDaily,
        });
        submitCompletion({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
        await markCompleted(puzzleId);
        await puzzleCache.markCompleted(puzzleId, GameType.SUDOKU);
        await showInterstitialIfDue();
      }
    }
  }, [gameState, selectedCell, session, isNotesMode, isPaused, autoRemoveNotes, lightImpact, updateState, loadSolution, markSolved, successNotification]);

  const handleHintPress = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint();
    if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution();
    if (!sol) return;
    const hint = SudokuEngine.getHint(gameState, sol);
    if (!hint) return;
    lightImpact(); playSound('hint');
    updateState(hint.revealedState as SudokuEngine.SudokuGameState & { board: ExtendedBoard });
  }, [gameState, isPaused, useHint, showRewardedAd, loadSolution, lightImpact, updateState]);

  const handleErase = useCallback(() => {
    if (!gameState || !selectedCell || session?.isSolved || isPaused) return;
    const { row, col } = selectedCell;
    if (gameState.board[row][col].isGiven) return;
    lightImpact();
    // Clear the erased cell, and also clear all error/wrongEntry states (the conflict is gone)
    const newBoard: ExtendedBoard = gameState.board.map((r, ri) =>
      r.map((c, ci) =>
        ri === row && ci === col
          ? { ...c, value: 0 as const, notes: new Set<SudokuDigit>(), isError: false, isWrongEntry: false }
          : { ...c, isError: false, isWrongEntry: false, notes: new Set(c.notes) }
      )
    );
    updateState({ ...gameState, board: newBoard });
  }, [gameState, selectedCell, session?.isSolved, isPaused, lightImpact, updateState]);

  const toggleNotesMode = useCallback(() => {
    if (!gameState || isPaused) return;
    lightImpact();
    updateState({ ...gameState, isNotesMode: !isNotesMode }, false);
  }, [gameState, isNotesMode, isPaused, lightImpact, updateState]);

  const handlePauseToggle = useCallback(() => {
    if (isPaused) {
      resumeTimer();
    } else {
      pauseTimer();
      doSaveProgress();
    }
  }, [isPaused, pauseTimer, resumeTimer, doSaveProgress]);

  const handleConfirmReset = useCallback(() => {
    if (!gameState) return;
    setShowResetConfirm(false);
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    useGameSessionStore.setState((s) => ({
      session: s.session ? {
        ...s.session,
        currentState: { board: buildInitialBoard(pd.grid), selectedCell: null, isNotesMode: false },
        undoStack: [],
      } : null,
    }));
  }, [gameState, puzzleData]);

  if (!initialized) {
    return (
      <ResumeModal
        visible={showResumeModal}
        elapsedSeconds={savedData?.elapsedSeconds ?? 0}
        onContinue={() => { setShowResumeModal(false); continueFromSave(); }}
        onRestart={() => { setShowResumeModal(false); clearProgress(puzzleId); startFresh(); }}
      />
    );
  }

  if (!board || !session) {
    return (
      <View style={[styles.loading, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular' }}>Loading…</Text>
      </View>
    );
  }

  const getHighlighted = (r: number, c: number) => {
    if (!selectedCell) return false;
    const { row, col } = selectedCell;
    if (r === row || c === col) return true;
    if (Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3)) return true;
    const sv = board[row][col].value;
    return sv !== 0 && board[r][c].value === sv;
  };

  const iconColor = isDark ? '#e5e7eb' : '#374151';
  const actionBg = isDark ? '#1f2937' : '#f3f4f6';

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Go back">
          <Text style={[styles.backText, { color: t.textSecondary }]}>←</Text>
        </TouchableOpacity>
        <GameTimer />
        <TouchableOpacity
          onPress={handlePauseToggle}
          style={[styles.pauseBtn, { backgroundColor: t.surface2 }]}
          accessibilityLabel={isPaused ? 'Resume' : 'Pause'}
        >
          <Text style={styles.pauseIcon}>{isPaused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[completionStyle, { marginTop: 8 }]}>
          <View style={{ width: boardSize, height: boardSize, borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280' }}>
            {board.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {row.map((cell, ci) => (
                  <CellView
                    key={ci} cell={cell} row={ri} col={ci}
                    isSelected={selectedCell?.row === ri && selectedCell?.col === ci}
                    isHighlighted={getHighlighted(ri, ci)}
                    cellSize={cellSize}
                    onPress={() => handleCellPress(ri, ci)}
                    isDark={isDark}
                  />
                ))}
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={[styles.controls, isTablet && styles.controlsTablet]}>
          <View style={styles.actionRow}>
            {[
              { icon: '↩', label: 'Undo',  onPress: () => { undo(); playSound('undo'); } },
              { icon: '✏️', label: 'Notes', onPress: toggleNotesMode, active: isNotesMode },
              { icon: '⌫', label: 'Erase', onPress: handleErase },
              { icon: '🔄', label: 'Reset', onPress: () => setShowResetConfirm(true) },
            ].map(({ icon, label, onPress, active }) => (
              <TouchableOpacity
                key={label}
                onPress={onPress}
                style={[styles.actionBtn, { backgroundColor: active ? '#3730a3' : actionBg, borderColor: t.border }]}
                accessibilityLabel={label}
              >
                <Text style={[styles.actionIcon, { color: iconColor }]}>{icon}</Text>
                <Text style={[styles.actionLabel, { color: active ? '#a5b4fc' : t.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <HintButton hintsRemaining={session.hintsRemaining} onPress={handleHintPress} />
          </View>

          <View style={styles.numPad}>
            {([1,2,3,4,5,6,7,8,9] as SudokuDigit[]).map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => handleDigitPress(d)}
                style={[styles.numKey, { backgroundColor: t.surface, borderColor: t.border }]}
                accessibilityLabel={`Enter ${d}`}
                accessibilityRole="button"
              >
                <Text style={[styles.numKeyText, { color: t.textPrimary }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <PauseModal
        visible={isPaused && !session.isSolved}
        elapsedSeconds={session.elapsedSeconds}
        hintsUsed={session.hintsUsed}
        hintsRemaining={session.hintsRemaining}
        gameName="Sudoku"
        onResume={resumeTimer}
      />

      <ConfirmModal
        visible={showResetConfirm}
        title="Reset board?"
        message="All your progress on this puzzle will be cleared. The timer will keep running."
        confirmLabel="Reset"
        confirmDanger
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />

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
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 16,
  },
  headerBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22 },
  pauseBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  pauseIcon: { fontSize: 18 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  scrollTablet: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 32 },
  controls: { width: '100%', marginTop: 20 },
  controlsTablet: { flex: 1, paddingLeft: 16, maxWidth: 280 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  actionBtn: {
    alignItems: 'center', justifyContent: 'center', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 10, minWidth: 52, minHeight: 52, borderWidth: 1,
  },
  actionIcon: { fontSize: 16, marginBottom: 2 },
  actionLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 9 },
  numPad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  numKey: {
    width: '30%', aspectRatio: 1.5, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, minHeight: 52,
  },
  numKeyText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24 },
});