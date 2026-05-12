import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
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
import { usePuzzleSolution } from '@/hooks/usePuzzleSolution';
import { useHintToast } from '@/hooks/useHintToast';
import HintToastView from '../ui/HintToastView';
import { useHintHighlight } from '@/hooks/useHintHighlight';
import HintBox from '../ui/HintBox';

interface SudokuGameProps {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  puzzleNumber?: number;
  difficulty?: string;
  onNextPuzzle?: () => void;
}

type SudokuDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface ExtendedCellState extends SudokuEngine.SudokuCellState {
  isWrongEntry?: boolean;
}
type ExtendedBoard = ExtendedCellState[][];

function buildInitialBoard(puzzleGrid: SudokuEngine.SudokuGrid): ExtendedBoard {
  return puzzleGrid.map(row =>
    row.map((val): ExtendedCellState => ({
      value: val, isGiven: val !== 0, isError: false, isWrongEntry: false, notes: new Set(),
    }))
  );
}

function deserialiseBoardNotes(rawBoard: ExtendedCellState[][]): ExtendedBoard {
  return rawBoard.map(row =>
    row.map(cell => {
      const rawNotes = Array.isArray(cell.notes) ? cell.notes : Object.values(cell.notes ?? {});
      return { ...cell, isWrongEntry: false, notes: new Set<SudokuDigit>(rawNotes as SudokuDigit[]) };
    })
  );
}

function CellView({ cell, row, col, isSelected, isHighlighted, cellSize, onPress, isDark }: {
  cell: ExtendedCellState; row: number; col: number;
  isSelected: boolean; isHighlighted: boolean;
  cellSize: number; onPress: () => void; isDark: boolean;
}) {
  const noteSize = Math.max(9, cellSize * 0.22);
  const digitSize = Math.max(18, cellSize * 0.52);
  const isBoxRight = col === 2 || col === 5;
  const isBoxBottom = row === 2 || row === 5;

  const bgColor = isSelected ? '#6366f1'
    : cell.isWrongEntry ? (isDark ? '#7f1d1d' : '#fee2e2')
    : isHighlighted ? (isDark ? '#1f2937' : '#e0e7ff')
    : 'transparent';

  const digitColor = isSelected ? '#ffffff'
    : cell.isWrongEntry ? '#ef4444'
    : cell.isError ? '#ef4444'
    : cell.isGiven ? (isDark ? '#f9fafb' : '#111827')
    : '#6366f1';

  return (
    <TouchableOpacity
      onPress={onPress}
      delayPressIn={0}
      style={{
        width: cellSize, height: cellSize, backgroundColor: bgColor,
        borderRightWidth: isBoxRight ? 2 : 0.5,
        borderBottomWidth: isBoxBottom ? 2 : 0.5,
        borderLeftWidth: 0, borderTopWidth: 0,
        borderColor: cell.isError && !cell.isWrongEntry ? '#ef4444' : (isDark ? '#374151' : '#9ca3af'),
        alignItems: 'center', justifyContent: 'center',
      }}
      accessibilityLabel={`Row ${row + 1} col ${col + 1}${cell.value ? `, ${cell.value}` : ''}`}
    >
      {cell.value !== 0 ? (
        <Text style={{ fontSize: digitSize, fontFamily: 'SpaceGrotesk-Bold', color: digitColor }}>{cell.value}</Text>
      ) : cell.notes.size > 0 ? (
        <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: cellSize - 4 }}>
          {([1,2,3,4,5,6,7,8,9] as SudokuDigit[]).map(n => (
            <Text key={n} style={{
              width: (cellSize - 4) / 3, fontSize: noteSize, textAlign: 'center',
              color: cell.notes.has(n) ? (isSelected ? '#ffffff' : '#818cf8') : 'transparent',
              fontFamily: 'SpaceGrotesk-Medium', lineHeight: noteSize + 4,
            }}>{n}</Text>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function SudokuGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: SudokuGameProps) {
  const { session, startSession, updateState, undo, useHint, markSolved, pauseTimer, resumeTimer } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { isTablet } = useBreakpoint();
  const { boardSize, cellSize } = useGameBoardSize(9);
  const { autoRemoveNotes } = useSettingsStore();
  const { enqueue } = useOfflineQueueStore();
  const queryClient = useQueryClient();
  const { saveProgress, loadProgress, clearProgress, markCompleted, saveDailyResult } = usePuzzleProgressStore();
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';

  const [showResumeModal, setShowResumeModal] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pressedDigit, setPressedDigit] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | undefined>(undefined);

  const completionScale = useSharedValue(1);
  const completionStyle = useAnimatedStyle(() => ({ transform: [{ scale: completionScale.value }] }));

  const { loadSolution } = usePuzzleSolution<{ grid: SudokuEngine.SudokuGrid }>(puzzleId);
  const { hint, blinkAnim, showHint, dismissHint, isHinted } = useHintHighlight();
  const hintOverlayStyle = useAnimatedStyle(() => ({
    opacity: blinkAnim.value,
  }));

  useEffect(() => {
    async function init() { const saved = await loadProgress(puzzleId); if (saved) { setSavedData(saved); if (isDaily) { continueFromSave(); } else { setShowResumeModal(true); } } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() {
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    startSession({ puzzleId, gameType: GameType.SUDOKU, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: { board: buildInitialBoard(pd.grid), selectedCell: null, isNotesMode: false }, initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 });
    setInitialized(true);
  }

  function continueFromSave() {
    if (!savedData) { startFresh(); return; }
    const rawState = savedData.currentState as { board: ExtendedCellState[][]; selectedCell: unknown; isNotesMode: boolean };
    const deserialisedBoard = deserialiseBoardNotes(rawState.board);
    startSession({ puzzleId, gameType: GameType.SUDOKU, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: { ...rawState, board: deserialisedBoard }, initialElapsedSeconds: savedData.elapsedSeconds, initialHintsUsed: savedData.hintsUsed, initialHintsRemaining: savedData.hintsRemaining });
    setInitialized(true);
  }

  const doSaveProgress = useCallback(() => {
    const s = useGameSessionStore.getState().session;
    if (!s || s.isSolved) return;
    saveProgress({ puzzleId, gameType: GameType.SUDOKU, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
  }, [puzzleId, isDaily, dailyPuzzleId, saveProgress]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(doSaveProgress, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved, doSaveProgress]);


  // Save progress on unmount (covers back-navigation)
  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.SUDOKU, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: useGameSessionStore.getState().getElapsed(), hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);
  const gameState = session?.currentState as (SudokuEngine.SudokuGameState & { board: ExtendedBoard }) | undefined;
  const board = gameState?.board as ExtendedBoard | undefined;
  const selectedCell = gameState?.selectedCell;
  const isNotesMode = gameState?.isNotesMode ?? false;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submitCompletion } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.SUDOKU) });
      try {
        const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats');
        const s = stats.find(x => x.gameType === GameType.SUDOKU);
        if (s) setStreak(s.currentStreak);
      } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  async function triggerWin(currentBoard: ExtendedBoard, sol: SudokuEngine.SudokuGrid) {
    if (!SudokuEngine.isBoardSolved(currentBoard, sol)) return;
    markSolved(); successNotification(); playSound('complete');
    completionScale.value = withSequence(withSpring(1.05), withSpring(1));
    const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
    const shareable = generateShareableResult({ gameType: GameType.SUDOKU, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
    submitCompletion({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
    if (isDaily && dailyPuzzleId) saveDailyResult(dailyPuzzleId, shareable);
    await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.SUDOKU); await showInterstitialIfDue();
  }

  const handleCellPress = useCallback((row: number, col: number) => {
    if (!gameState || session?.isSolved || isPaused) return;
    lightImpact(); playSound('cell_tap');
    if (isHinted(row, col)) dismissHint();
    updateState({ ...gameState, selectedCell: { row, col } }, false);
  }, [gameState, session?.isSolved, isPaused, lightImpact, updateState, isHinted, dismissHint]);

  const handleDigitPress = useCallback(async (digit: SudokuDigit) => {
    if (!gameState || !selectedCell || session?.isSolved || isPaused) return;
    const { row, col } = selectedCell;
    if (gameState.board[row][col].isGiven) return;
    lightImpact();
    setPressedDigit(digit);
    setTimeout(() => setPressedDigit(null), 120);

    let newBoard: ExtendedBoard = gameState.board.map(r => r.map(c => ({ ...c, notes: new Set(c.notes) })));

    if (isNotesMode) {
      const notes = new Set(newBoard[row][col].notes);
      if (notes.has(digit)) notes.delete(digit); else notes.add(digit);
      newBoard[row][col] = { ...newBoard[row][col], notes };
      playSound('digit_place');
    } else {
      // KEY FIX: Only clear error flags on the cell being edited and cells whose
      // conflict was caused specifically by the value in this cell.
      // We do NOT blanket-clear all error states across the board.
      const prevValue = newBoard[row][col].value;

      // Step 1: place the new digit in the target cell
      newBoard[row][col] = { ...newBoard[row][col], value: digit, notes: new Set(), isError: false, isWrongEntry: false };

      if (autoRemoveNotes) newBoard = SudokuEngine.applyAutoRemoveNotes(newBoard, row, col, digit) as ExtendedBoard;

      // Step 2: recompute all conflicts on the entire board from scratch
      const conflicts = SudokuEngine.getBoardConflicts(newBoard);
      const cs = new Set(conflicts.map(([r, c]) => `${r},${c}`));

      // Step 3: re-apply error/wrongEntry state based on fresh conflict set
      // - The newly placed cell: isWrongEntry if it's still in a conflict
      // - All other conflicting cells: isError = true (victim)
      // - Cells NOT in conflict set: clear their error state ONLY IF their
      //   previous error was caused by the cell we just edited (same row/col/box)
      const sameGroup = (r: number, c: number) =>
        r === row || c === col ||
        (Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3));

      newBoard = newBoard.map((r, ri) => r.map((cell, ci) => {
        if (ri === row && ci === col) {
          return { ...cell, isWrongEntry: cs.has(`${ri},${ci}`), isError: false };
        }
        if (cs.has(`${ri},${ci}`)) {
          // Currently in conflict → mark as error victim
          return { ...cell, isError: true, isWrongEntry: false };
        }
        if (cell.isError && sameGroup(ri, ci)) {
          // Was an error victim caused by this cell's previous value → clear it
          return { ...cell, isError: false };
        }
        // Leave all other cells' error state unchanged
        return cell;
      }));

      const newlyConflicting = cs.has(`${row},${col}`);
      playSound(newlyConflicting ? 'error' : 'digit_place');
    }

    updateState({ ...gameState, board: newBoard });

    if (!isNotesMode) {
      const sol = await loadSolution();
      if (sol) await triggerWin(newBoard, sol?.grid);
    }
  }, [gameState, selectedCell, session, isNotesMode, isPaused, autoRemoveNotes, lightImpact, updateState, loadSolution]);

  const handleHintPress = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = SudokuEngine.getHint(gameState, sol?.grid); if (!hint) return;
    lightImpact(); playSound('hint');

    // Apply hinted board and clear ALL error flags — the hint places a correct
    // value so no conflicts remain for that cell, and stale error highlights
    // on other cells must also be recomputed from scratch.
    const hintedBoard = (hint.revealedState as { board: ExtendedBoard }).board;
    const { row, col } = hint.position!;

    showHint({ row, col, description: hint.description });

    const freshConflicts = SudokuEngine.getBoardConflicts(hintedBoard);
    const conflictSet = new Set(freshConflicts.map(([r, c]) => `${r},${c}`));

    const cleanBoard: ExtendedBoard = hintedBoard.map((r, ri) => r.map((cell, ci) => {
      if (ri === row && ci === col) return { ...cell, isError: false, isWrongEntry: false };
      if (!conflictSet.has(`${ri},${ci}`)) return { ...cell, isError: false, isWrongEntry: false };
      return cell;
    }));


    updateState({ ...hint.revealedState, board: cleanBoard } as SudokuEngine.SudokuGameState & { board: ExtendedBoard });
    await triggerWin(cleanBoard, sol?.grid);
  }, [gameState, isPaused, useHint, showRewardedAd, loadSolution, lightImpact, updateState, showHint]);

  const handleErase = useCallback(() => {
    if (!gameState || !selectedCell || session?.isSolved || isPaused) return;
    const { row, col } = selectedCell;
    if (gameState.board[row][col].isGiven) return;
    lightImpact();
    // When erasing, recompute conflicts without this cell's value
    const newBoard: ExtendedBoard = gameState.board.map((r, ri) =>
      r.map((c, ci) => {
        if (ri === row && ci === col) return { ...c, value: 0 as const, notes: new Set<SudokuDigit>(), isError: false, isWrongEntry: false };
        return c;
      })
    );
    // Clear victims in same group since the conflicting value is now gone
    const sameGroup = (r: number, c: number) =>
      r === row || c === col ||
      (Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3));
    const cleared = newBoard.map((r, ri) => r.map((cell, ci) =>
      cell.isError && sameGroup(ri, ci) ? { ...cell, isError: false } : cell
    ));
    updateState({ ...gameState, board: cleared });
  }, [gameState, selectedCell, session?.isSolved, isPaused, lightImpact, updateState]);

  const toggleNotesMode = useCallback(() => {
    if (!gameState || isPaused) return;
    lightImpact();
    updateState({ ...gameState, isNotesMode: !isNotesMode }, false);
  }, [gameState, isNotesMode, isPaused, lightImpact, updateState]);

  const handlePauseToggle = useCallback(() => {
    if (isPaused) resumeTimer(); else { pauseTimer(); doSaveProgress(); }
  }, [isPaused, pauseTimer, resumeTimer, doSaveProgress]);

  const handleConfirmReset = useCallback(() => {
    if (!gameState) return;
    setShowResetConfirm(false);
    const pd = puzzleData as SudokuEngine.SudokuPuzzleData;
    useGameSessionStore.setState(s => ({
      session: s.session ? { ...s.session, currentState: { board: buildInitialBoard(pd.grid), selectedCell: null, isNotesMode: false }, undoStack: [] } : null,
    }));
  }, [gameState, puzzleData]);

  if (!initialized) {
    return <ResumeModal visible={showResumeModal} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResumeModal(false); continueFromSave(); }} onRestart={() => { setShowResumeModal(false); clearProgress(puzzleId); startFresh(); }} />;
  }

  if (!board || !session) {
    return <View style={[styles.loading, { backgroundColor: t.background }]}><Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular' }}>Loading…</Text></View>;
  }

  const getHighlighted = (r: number, c: number) => {
    if (!selectedCell) return false;
    const { row, col } = selectedCell;
    if (r === row || c === col) return true;
    if (Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3)) return true;
    const sv = board[row][col].value;
    return sv !== 0 && board[r][c].value === sv;
  };

  const actionBg = isDark ? '#1f2937' : '#f3f4f6';
  const iconColor = isDark ? '#e5e7eb' : '#374151';

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Go back">
          <Text style={[styles.backText, { color: t.textSecondary }]}>←</Text>
        </TouchableOpacity>
        <GameTimer />
        <TouchableOpacity onPress={handlePauseToggle} style={[styles.pauseBtn, { backgroundColor: t.surface2 }]} accessibilityLabel={isPaused ? 'Resume' : 'Pause'}>
          <Text style={styles.pauseIcon}>{isPaused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, isTablet && styles.scrollTablet]} showsVerticalScrollIndicator={false}>
        <Animated.View style={[completionStyle, { marginTop: 8 }]}>
          <View style={{ width: boardSize, height: boardSize, borderTopWidth: 2, borderBottomWidth: 2, borderRightWidth: 2, borderLeftWidth: 2, borderColor: isDark ? '#374151' : '#6b7280' }}>
            {board.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {row.map((cell, ci) => (
                  <View key={ci} style={{ position: 'relative' }}>
                    <CellView cell={cell} row={ri} col={ci}
                      isSelected={selectedCell?.row === ri && selectedCell?.col === ci}
                      isHighlighted={getHighlighted(ri, ci)}
                      cellSize={cellSize} onPress={() => handleCellPress(ri, ci)} isDark={isDark}
                    />
                    {isHinted(ri, ci) && (
                      <Animated.View pointerEvents="none" style={[
                          { position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.5)' },
                          hintOverlayStyle,
                        ]}
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={[styles.controls, isTablet && styles.controlsTablet]}>
          {/* Action row: Undo, Notes, Erase, Reset, Hint */}
          <View style={styles.actionRow}>
            {[
              { icon: '↩', label: 'Undo', onPress: () => { undo(); playSound('undo'); } },
              { icon: '✏️', label: 'Notes', onPress: toggleNotesMode, active: isNotesMode },
              { icon: '⌫', label: 'Erase', onPress: handleErase },
              { icon: '🔄', label: 'Reset', onPress: () => setShowResetConfirm(true) },
            ].map(({ icon, label, onPress, active }) => (
              <TouchableOpacity key={label} onPress={onPress}
                style={[styles.actionBtn, { backgroundColor: active ? '#3730a3' : actionBg, borderColor: t.border }]}
                accessibilityLabel={label}>
                <Text style={[styles.actionIcon, { color: iconColor }]}>{icon}</Text>
                <Text style={[styles.actionLabel, { color: active ? '#a5b4fc' : t.textMuted }]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <HintButton hintsRemaining={session.hintsRemaining} onPress={handleHintPress} />
          </View>

          {/* Number pad */}
          <View style={styles.numPad}>
            {([1,2,3,4,5,6,7,8,9] as SudokuDigit[]).map(d => (
              <TouchableOpacity key={d} onPress={() => handleDigitPress(d)} activeOpacity={0.6}
                style={[styles.numKey, {
                  backgroundColor: pressedDigit === d ? '#6366f1' : t.surface,
                  borderColor: pressedDigit === d ? '#6366f1' : t.border,
                  transform: [{ scale: pressedDigit === d ? 0.92 : 1 }],
                }]}
                accessibilityLabel={`Enter ${d}`}>
                <Text style={[styles.numKeyText, { color: pressedDigit === d ? '#fff' : t.textPrimary }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

       {hint && (
        <HintBox
          description={hint.description}
          subText="Select the highlighted cell, then type the correct digit"
          onDismiss={dismissHint}
        />
      )}
      </ScrollView>

      <PauseModal visible={isPaused && !session.isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} gameName="Sudoku" onResume={resumeTimer} />
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All your progress on this puzzle will be cleared." confirmLabel="Reset" confirmDanger onConfirm={handleConfirmReset} onCancel={() => setShowResetConfirm(false)} />
      {session.isSolved && (
        <CompletionModal gameType={GameType.SUDOKU} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} isDaily={isDaily}
          shareableResult={generateShareableResult({ gameType: GameType.SUDOKU, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily })}
          streak={streak} onClose={() => router.back()} onNextPuzzle={onNextPuzzle} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, paddingTop: 16 },
  headerBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22 },
  pauseBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  pauseIcon: { fontSize: 18 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  scrollTablet: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 32 },
  controls: { width: '100%', marginTop: 20 },
  controlsTablet: { flex: 1, paddingLeft: 16, maxWidth: 280 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 52, minHeight: 52, borderWidth: 1 },
  actionIcon: { fontSize: 16, marginBottom: 2 },
  actionLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 9 },
  numPad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  numKey: { width: '30%', aspectRatio: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, minHeight: 52 },
  numKeyText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24 },
});