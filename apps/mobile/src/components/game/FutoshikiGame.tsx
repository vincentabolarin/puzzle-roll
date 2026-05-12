import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import { GameType, Difficulty, FutoshikiEngine } from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
import { usePuzzleProgressStore, SavedPuzzleProgress } from '../../stores/puzzle-progress.store';
import { useOfflineQueueStore } from '../../stores/offline-queue.store';
import { useAppTheme } from '../../hooks/useAppTheme';
import { apiClient } from '../../lib/api-client';
import { puzzleCache } from '../../services/puzzle-cache.service';
import { generateShareableResult } from '../../lib/shareable-result';
import { playSound } from '../../services/sound.service';
import GenericGameScreen from './GenericGameScreen';
import ResumeModal from './ResumeModal';
import ConfirmModal from '../ui/ConfirmModal';
import { usePuzzleSolution } from '@/hooks/usePuzzleSolution';
import { useHintToast } from '@/hooks/useHintToast';
import HintToastView from '../ui/HintToastView';
import { useHintHighlight } from '@/hooks/useHintHighlight';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import HintBox from '../ui/HintBox';

type FutoshikiPuzzleData = FutoshikiEngine.FutoshikiPuzzleData;
type FutoshikiGameState = FutoshikiEngine.FutoshikiGameState;
type FutoshikiSolution = FutoshikiEngine.FutoshikiSolution;
type FutoshikiConstraint = FutoshikiEngine.FutoshikiConstraint;

interface FutoshikiState extends FutoshikiGameState {
  notes: Record<string, number[]>;
  isNotesMode: boolean;
}

interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void; puzzleNumber?: number; difficulty?: string }

export default function FutoshikiGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, undo, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const queryClient = useQueryClient();
  const { saveProgress, loadProgress, clearProgress, markCompleted, saveDailyResult } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const isDark = t.background !== '#f9fafb';
  const [isSolved, setIsSolved] = useState(false);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [pressedDigit, setPressedDigit] = useState<number | null>(null);

  const { loadSolution } = usePuzzleSolution<FutoshikiSolution>(puzzleId);
  const { hint, blinkAnim, showHint, dismissHint, isHinted } = useHintHighlight();

  const hintOverlayStyle = useAnimatedStyle(() => ({
    opacity: blinkAnim.value,
  }));

  if (!puzzleData || typeof (puzzleData as FutoshikiPuzzleData).size !== 'number') return null;
  const pd = puzzleData as FutoshikiPuzzleData;
  const { size, given, constraints } = pd;

  const CON_GAP = Math.max(12, Math.floor(width * 0.035));
  const CELL = Math.max(30, Math.floor((Math.min(width, 420) * 0.9 - CON_GAP * (size - 1)) / size));

  function buildInitial(): FutoshikiState {
    return { board: given.map(row => [...row]), selectedCell: null, notes: {}, isNotesMode: false };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); if (isDaily) { continueFromSave(); } else { setShowResume(true); } } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() {
    const raw = (savedData?.currentState ?? buildInitial()) as FutoshikiState;
    if (!raw.notes) raw.notes = {};
    if (raw.isNotesMode === undefined) raw.isNotesMode = false;
    startSession({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: raw, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 });
    setInitialized(true);
  }

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);


  // Save progress on unmount (covers back-navigation)
  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: useGameSessionStore.getState().getElapsed(), hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);
  const gameState = session?.currentState as FutoshikiState | undefined;
  const board = gameState?.board;
  const selectedCell = gameState?.selectedCell;
  const notes = gameState?.notes ?? {};
  const isNotesMode = gameState?.isNotesMode ?? false;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.FUTOSHIKI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.FUTOSHIKI) });
      try { const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats'); const s = stats.find(x => x.gameType === GameType.FUTOSHIKI); if (s) setStreak(s.currentStreak); } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  function revalidate(nb: number[][]) {
    const result = FutoshikiEngine.validateFutoshikiBoard(nb, size, constraints);
    setConflicts(new Set(result.conflicts.map(c => `${c.row},${c.col}`)));
    return result;
  }

  async function resolveWin(nb: number[][]) {
    const result = FutoshikiEngine.validateFutoshikiBoard(nb, size, constraints);
    if (result.conflicts.length > 0) return;
    const sol = await loadSolution();
    if (sol && FutoshikiEngine.isFutoshikiSolved(nb, sol)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.FUTOSHIKI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      if (isDaily && dailyPuzzleId) saveDailyResult(dailyPuzzleId, shareable);
      await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.FUTOSHIKI); await showInterstitialIfDue();
    }
  }

  const handleCellPress = useCallback((r: number, c: number) => {
    if (!gameState || isPaused || isSolved || given[r][c] !== 0) return;
    lightImpact();
    updateState({ ...gameState, selectedCell: { row: r, col: c } }, false);
    dismissHint();
  }, [gameState, isPaused, isSolved, given, lightImpact, updateState]);

  const handleDigit = useCallback(async (digit: number) => {
    if (!gameState || !selectedCell || isPaused || isSolved) return;
    const { row, col } = selectedCell;
    if (given[row][col] !== 0) return;
    lightImpact(); playSound('digit_place');
    setPressedDigit(digit); setTimeout(() => setPressedDigit(null), 120);

    if (isNotesMode) {
      const key = `${row},${col}`;
      const cellNotes = new Set(notes[key] ?? []);
      if (cellNotes.has(digit)) cellNotes.delete(digit); else cellNotes.add(digit);
      updateState({ ...gameState, notes: { ...notes, [key]: Array.from(cellNotes) } }, true);
    } else {
      const nb = gameState.board.map(r => [...r]);
      nb[row][col] = nb[row][col] === digit ? 0 : digit;
      const newNotes = { ...notes }; delete newNotes[`${row},${col}`];
      updateState({ ...gameState, board: nb, notes: newNotes }, true);
      revalidate(nb);
      dismissHint();
      if (nb[row][col] !== 0) await resolveWin(nb);
    }
  }, [gameState, selectedCell, isPaused, isSolved, given, isNotesMode, notes, lightImpact, updateState, session]);

  const handleErase = useCallback(() => {
    if (!gameState || !selectedCell || isPaused || isSolved) return;
    const { row, col } = selectedCell;
    if (given[row][col] !== 0) return;
    lightImpact();
    const nb = gameState.board.map(r => [...r]);
    nb[row][col] = 0;
    const newNotes = { ...notes }; delete newNotes[`${row},${col}`];
    updateState({ ...gameState, board: nb, notes: newNotes }, true);
    revalidate(nb);
  }, [gameState, selectedCell, isPaused, isSolved, given, notes, lightImpact, updateState, size, constraints]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = FutoshikiEngine.getHint(gameState, sol, given); if (!hint) return;
    lightImpact(); playSound('hint');
    
    const { row, col } = hint.position!;
    const value = (hint.revealedState as any).board[row][col];
    // Check for inequality constraints involving this cell
    const pd = puzzleData as any;
    const constraints = pd.constraints ?? [];
    const relevant = constraints.filter((con: any) =>
      (con.row1 === row && con.col1 === col) || (con.row2 === row && con.col2 === col)
    );
    const desc = relevant.length > 0
      ? `Place ${value} at row ${row + 1}, column ${col + 1}. It satisfies the inequality constraint${relevant.length > 1 ? 's' : ''} on that cell and doesn't repeat in the row or column.`
      : `Place ${value} at row ${row + 1}, column ${col + 1}. It's the only digit that fits without repeating in the row or column.`;
    showHint({ row, col, description: desc });
    updateState({ ...(hint.revealedState as FutoshikiState), selectedCell: { row, col } }, true);
    revalidate((hint.revealedState as FutoshikiState).board);
    await resolveWin((hint.revealedState as FutoshikiState).board);
  }, [gameState, isPaused, given, useHint, showRewardedAd, loadSolution, lightImpact, updateState, session]);

  function getHConSymbol(r: number, c: number): string | null {
    const con = constraints.find(con =>
      (con.row1 === r && con.col1 === c && con.row2 === r && con.col2 === c + 1) ||
      (con.row1 === r && con.col1 === c + 1 && con.row2 === r && con.col2 === c)
    );
    if (!con) return null;
    if (con.row1 === r && con.col1 === c) return con.direction;
    return con.direction === '<' ? '>' : '<';
  }

  function getVConSymbol(r: number, c: number): string | null {
    const con = constraints.find(con =>
      (con.row1 === r && con.col1 === c && con.row2 === r + 1 && con.col2 === c) ||
      (con.row1 === r + 1 && con.col1 === c && con.row2 === r && con.col2 === c)
    );
    if (!con) return null;
    const dir = con.row1 === r && con.col1 === c ? con.direction : (con.direction === '<' ? '>' : '<');
    // return dir === '<' ? '∨' : '∧';
    return dir;
  }

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.FUTOSHIKI, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const actionBg = isDark ? '#1f2937' : '#f3f4f6';

  const notesToggle = (
    <TouchableOpacity
      onPress={() => updateState({ ...gameState, isNotesMode: !isNotesMode }, false)}
      style={[styles.actionBtn, { backgroundColor: isNotesMode ? '#4f46e5' : actionBg, borderColor: isNotesMode ? '#6366f1' : t.border }]}
      accessibilityLabel="Toggle notes"
    >
      <Text style={{ fontSize: 16, marginBottom: 2 }}>✏️</Text>
      <Text style={{ fontFamily: 'SpaceGrotesk-Medium', fontSize: 9, color: isNotesMode ? '#a5b4fc' : t.textMuted }}>Notes</Text>
    </TouchableOpacity>
  );

  const numpad = (
    <View style={styles.numPad}>
      {Array.from({ length: size }, (_, i) => i + 1).map(d => (
        <TouchableOpacity key={d} onPress={() => handleDigit(d)} activeOpacity={0.6}
          style={[styles.numKey, { backgroundColor: pressedDigit === d ? '#6366f1' : t.surface, borderColor: pressedDigit === d ? '#6366f1' : t.border, transform: [{ scale: pressedDigit === d ? 0.92 : 1 }] }]}>
          <Text style={{ color: pressedDigit === d ? '#fff' : t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 22 }}>{d}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={handleErase} activeOpacity={0.6}
        style={[styles.numKey, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20 }}>⌫</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <GenericGameScreen
        puzzleId={puzzleId} gameType={GameType.FUTOSHIKI} gameName="Futoshiki" accentColor="#6366f1"
        isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed}
        hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable}
        onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)}
        onGetHint={handleHint} streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty} onNextPuzzle={onNextPuzzle} scrollable
        showUndo onUndo={() => { lightImpact(); undo(); }}
        extraControls={notesToggle} numpad={numpad}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
            Fill every row & column 1–{size}. Respect {'<'} {'>'} inequalities.
          </Text>

          {board.map((row, r) => (
            <View key={r}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {row.map((val, c) => {
                  const isGiven = given[r][c] !== 0;
                  const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                  const hasConflict = conflicts.has(`${r},${c}`);
                  const cellNotes = notes[`${r},${c}`] ?? [];
                  const hSym = c < size - 1 ? getHConSymbol(r, c) : null;

                  return (
                    <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => handleCellPress(r, c)} disabled={isPaused || isGiven}
                        style={{
                          width: CELL, height: CELL, borderRadius: 8, borderWidth: 1.5,
                          borderColor: hasConflict ? '#ef4444' : isSelected ? '#6366f1' : (isDark ? '#374151' : '#d1d5db'),
                          backgroundColor: isSelected ? (isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)') : (isDark ? '#111827' : '#ffffff'),
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                        {val !== 0 ? (
                          <Text style={{ fontFamily: isGiven ? 'SpaceGrotesk-Bold' : 'JetBrainsMono-Regular', fontSize: CELL * 0.52, color: hasConflict ? '#ef4444' : isGiven ? t.textPrimary : '#6366f1' }}>{val}</Text>
                        ) : cellNotes.length > 0 ? (
                          <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: CELL - 4 }}>
                            {Array.from({ length: size }, (_, i) => i + 1).map(n => (
                              <Text key={n} style={{ width: (CELL - 4) / Math.ceil(Math.sqrt(size)), fontSize: Math.max(7, CELL * 0.22), textAlign: 'center', color: cellNotes.includes(n) ? '#818cf8' : 'transparent', fontFamily: 'SpaceGrotesk-Medium' }}>{n}</Text>
                            ))}
                          </View>
                        ) : null}

                        {isHinted(r, c) && (
                          <Animated.View pointerEvents="none" style={[
                              { position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.5)' },
                              hintOverlayStyle,
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                      {c < size - 1 && (
                        <View style={{ width: CON_GAP, alignItems: 'center', justifyContent: 'center' }}>
                          {hSym && <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: Math.max(12, CON_GAP * 0.7), color: t.accent }}>{hSym}</Text>}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              {r < size - 1 && (
                <View style={{ flexDirection: 'row', height: CON_GAP }}>
                  {row.map((_, c) => {
                    const vSym = getVConSymbol(r, c);
                    return (
                      <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: CELL, alignItems: 'center', justifyContent: 'center' }}>
                          {vSym && <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: Math.max(11, CON_GAP * 0.65), color: t.accent }}>{vSym}</Text>}
                        </View>
                        {c < size - 1 && <View style={{ width: CON_GAP }} />}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))}

          {hint && (
            <HintBox
              description={hint.description}
              subText="Tap the highlighted cell to apply"
              onDismiss={dismissHint}
            />
          )}
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All your entries will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); setConflicts(new Set()); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  actionBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 56, minHeight: 52, borderWidth: 1 },
  numPad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  numKey: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});