import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
import { GameType, Difficulty, KakuroEngine } from '@puzzle-roll/shared';
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
import { useHintHighlight } from '@/hooks/useHintHighlight';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import HintBox from '../ui/HintBox';

interface KBlackCell { type: 'black'; acrossClue: number | null; downClue: number | null }
interface KWhiteCell { type: 'white'; value: number }
type KCell = KBlackCell | KWhiteCell;
interface KakuroPuzzleData { size: number; grid: KCell[][] }
interface KakuroState { values: Record<string, number>; notes: Record<string, number[]>; isNotesMode: boolean }
interface KakuroProps { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void; puzzleNumber?: number; difficulty?: string; }

export default function KakuroGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: KakuroProps) {
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
  const [selected, setSelected] = useState<string | null>(null);
  const [pressedDigit, setPressedDigit] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { loadSolution } = usePuzzleSolution<{ values: Array<{ row: number; col: number; value: number }> }>(puzzleId);

  const { hint, blinkAnim, showHint, dismissHint, isHinted } = useHintHighlight();

  const hintOverlayStyle = useAnimatedStyle(() => ({
    opacity: blinkAnim.value,
  }));

  if (!puzzleData || typeof (puzzleData as KakuroPuzzleData).size !== 'number') return null;
  const pd = puzzleData as KakuroPuzzleData;
  const { size, grid } = pd;
  const CELL = Math.min(Math.floor((width * 0.96) / size), 48);
  const CLR = '#fff';

  function buildInitial(): KakuroState { return { values: {}, notes: {}, isNotesMode: false }; }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); if (isDaily) { continueFromSave(); } else { setShowResume(true); } } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.KAKURO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() {
    const raw = (savedData?.currentState ?? buildInitial()) as KakuroState;
    if (!raw.notes) raw.notes = {};
    if (raw.isNotesMode === undefined) raw.isNotesMode = false;
    startSession({ puzzleId, gameType: GameType.KAKURO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: raw, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 });
    setInitialized(true);
  }

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.KAKURO, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);


  // Save progress on unmount (covers back-navigation)
  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.KAKURO, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: useGameSessionStore.getState().getElapsed(), hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);
  const gameState = session?.currentState as KakuroState | undefined;
  const values = gameState?.values ?? {};
  const notes = gameState?.notes ?? {};
  const isNotesMode = gameState?.isNotesMode ?? false;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.KAKURO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.KAKURO) });
      try { const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats'); const s = stats.find(x => x.gameType === GameType.KAKURO); if (s) setStreak(s.currentStreak); } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.KAKURO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  function checkKakuroSolved(vals: Record<string, number>): boolean {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r][c].type !== 'black') continue;
      const blk = grid[r][c] as KBlackCell;
      if (blk.acrossClue !== null) {
        let sum = 0; const used = new Set<number>(); let ok = true;
        for (let cc = c + 1; cc < size && grid[r][cc].type === 'white'; cc++) { const v = vals[`${r},${cc}`] ?? 0; if (!v || used.has(v)) { ok = false; break; } used.add(v); sum += v; }
        if (!ok || sum !== blk.acrossClue) return false;
      }
      if (blk.downClue !== null) {
        let sum = 0; const used = new Set<number>(); let ok = true;
        for (let rr = r + 1; rr < size && grid[rr][c].type === 'white'; rr++) { const v = vals[`${rr},${c}`] ?? 0; if (!v || used.has(v)) { ok = false; break; } used.add(v); sum += v; }
        if (!ok || sum !== blk.downClue) return false;
      }
    }
    return true;
  }

  async function resolveWin(newVals: Record<string, number>) {
    if (checkKakuroSolved(newVals)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.KAKURO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      if (isDaily && dailyPuzzleId) saveDailyResult(dailyPuzzleId, shareable);
      await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.KAKURO); await showInterstitialIfDue();
    }
  }

  const handleDigit = useCallback(async (digit: number) => {
    if (!gameState || !selected || isPaused || isSolved) return;
    lightImpact(); playSound('digit_place');
    setPressedDigit(digit); setTimeout(() => setPressedDigit(null), 120);

    if (isNotesMode) {
      const cellNotes = new Set(notes[selected] ?? []);
      if (cellNotes.has(digit)) cellNotes.delete(digit); else cellNotes.add(digit);
      updateState({ ...gameState, notes: { ...notes, [selected]: Array.from(cellNotes) } }, true);
    } else {
      const newVals = { ...values }; const newNotes = { ...notes };
      if (digit === 0) { delete newVals[selected]; } else { newVals[selected] = digit; delete newNotes[selected]; }
      updateState({ ...gameState, values: newVals, notes: newNotes }, true);
      dismissHint();
      await resolveWin(newVals);
    }
  }, [gameState, selected, isPaused, isSolved, values, notes, isNotesMode, lightImpact, updateState, session]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;

    const currentBoard: KakuroEngine.KakuroCell[][] = pd.grid.map((row, r) =>
      row.map((cell, c): KakuroEngine.KakuroCell => {
        if ((cell as KakuroEngine.KakuroBlackCell).type === 'black') return { ...cell } as KakuroEngine.KakuroBlackCell;
        const v = (values[`${r},${c}`] ?? 0) as KakuroEngine.KakuroDigit | 0;
        return { ...(cell as KakuroEngine.KakuroWhiteCell), value: v };
      })
    );

    const hint = KakuroEngine.getHint({ board: currentBoard, selectedCell: null }, sol as KakuroEngine.KakuroSolution);
    if (!hint || !hint.position) return;

    const { row, col } = hint.position;
    const targetValue = (sol as KakuroEngine.KakuroSolution).values.find(v => v.row === row && v.col === col)?.value ?? 0;
    const isWrong = (values[`${row},${col}`] ?? 0) !== 0;

    let acrossClue: number | null = null;
    for (let c = col - 1; c >= 0; c--) {
      const cell = pd.grid[row][c] as KakuroEngine.KakuroBlackCell;
      if (cell.type === 'black') { acrossClue = cell.acrossClue; break; }
    }
    let downClue: number | null = null;
    for (let r = row - 1; r >= 0; r--) {
      const cell = pd.grid[r][col] as KakuroEngine.KakuroBlackCell;
      if (cell.type === 'black') { downClue = cell.downClue; break; }
    }

    const clueText = [
      acrossClue != null ? `across sum ${acrossClue}` : null,
      downClue != null ? `down sum ${downClue}` : null,
    ].filter(Boolean).join(' and ');

    const desc = isWrong
      ? `Row ${row + 1}, column ${col + 1} is incorrect. ${clueText ? `The ${clueText} constraint means` : 'The run constraint means'} this cell must be ${targetValue}.`
      : `Place ${targetValue} at row ${row + 1}, column ${col + 1}. ${clueText ? `It satisfies the ${clueText} without repeating in that run.` : "It's the only digit that fits without repeating."}`;

    lightImpact(); playSound('hint');
    showHint({ row, col, description: desc });
    setSelected(`${row},${col}`);

    const newNotes = { ...notes };
    delete newNotes[`${row},${col}`];
    updateState({ ...gameState, values: { ...values, [`${row},${col}`]: targetValue }, notes: newNotes }, true);
    await resolveWin({ ...values, [`${row},${col}`]: targetValue });
  }, [gameState, isPaused, values, notes, pd, useHint, showRewardedAd, loadSolution, lightImpact, updateState, showHint, session]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!gameState || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.KAKURO, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const actionBg = isDark ? '#1f2937' : '#f3f4f6';

  const notesToggle = (
    <TouchableOpacity
      onPress={() => updateState({ ...gameState, isNotesMode: !isNotesMode }, false)}
      style={[styles.actionBtn, { backgroundColor: isNotesMode ? '#4f46e5' : actionBg, borderColor: isNotesMode ? '#a855f7' : t.border }]}
      accessibilityLabel="Toggle notes">
      <Text style={{ fontSize: 16, marginBottom: 2 }}>✏️</Text>
      <Text style={{ fontFamily: 'SpaceGrotesk-Medium', fontSize: 9, color: isNotesMode ? '#a5b4fc' : t.textMuted }}>Notes</Text>
    </TouchableOpacity>
  );

  const numpad = (
    <View style={styles.numPad}>
      {[1,2,3,4,5,6,7,8,9].map(d => (
        <TouchableOpacity key={d} onPress={() => handleDigit(d)} activeOpacity={0.6}
          style={[styles.numKey, { backgroundColor: pressedDigit === d ? '#a855f7' : t.surface, borderColor: pressedDigit === d ? '#a855f7' : t.border, transform: [{ scale: pressedDigit === d ? 0.92 : 1 }] }]}>
          <Text style={{ color: pressedDigit === d ? '#fff' : t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20 }}>{d}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => handleDigit(0)} activeOpacity={0.6} style={[styles.numKey, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Bold', fontSize: 18 }}>⌫</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <GenericGameScreen
        puzzleId={puzzleId} gameType={GameType.KAKURO} gameName="Kakuro" accentColor="#a855f7"
        isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed}
        hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable}
        onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)}
        onGetHint={handleHint} streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty} onNextPuzzle={onNextPuzzle} scrollable
        showUndo onUndo={() => { lightImpact(); undo(); }}
        extraControls={notesToggle} numpad={numpad}
      >
        <View>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
            Down clue (top-left) ╲ Across clue (bottom-right)
          </Text>
          <View style={{ borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280', alignSelf: 'center' }}>
            {grid.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((cell, c) => {
                  if (cell.type === 'black') {
                    const blk = cell as KBlackCell;
                    const hasBoth = blk.downClue !== null && blk.acrossClue !== null;
                    const clueFs = Math.max(7, CELL * 0.26);
                    return (
                      <View key={c} style={{ width: CELL, height: CELL, backgroundColor: isDark ? '#1f2937' : '#374151', borderWidth: 0.5, borderColor: isDark ? '#374151' : '#1f2937', overflow: 'hidden' }}>
                        {hasBoth && (
                          <Svg width={CELL} height={CELL} style={StyleSheet.absoluteFill} pointerEvents="none">
                            <Line x1={1} y1={1} x2={CELL - 1} y2={CELL - 1} stroke={isDark ? '#6b7280' : '#9ca3af'} strokeWidth={1} />
                          </Svg>
                        )}
                        {blk.downClue !== null && <Text style={{ position: 'absolute', top: 2, left: 3, color: CLR, fontSize: clueFs, fontFamily: 'SpaceGrotesk-Bold', lineHeight: clueFs + 2 }}>{blk.downClue}</Text>}
                        {blk.acrossClue !== null && <Text style={{ position: 'absolute', bottom: 2, right: 3, color: CLR, fontSize: clueFs, fontFamily: 'SpaceGrotesk-Bold', lineHeight: clueFs + 2 }}>{blk.acrossClue}</Text>}
                      </View>
                    );
                  }
                  const key = `${r},${c}`;
                  const val = values[key];
                  const cellNotes = notes[key] ?? [];
                  const isSelected = selected === key;
                  return (
                    <TouchableOpacity key={c} onPress={() => { if (!isPaused) setSelected(isSelected ? null : key); }} disabled={isPaused}
                      style={{ width: CELL, height: CELL, borderWidth: 0.5, borderColor: isSelected ? '#a855f7' : (isDark ? '#374151' : '#d1d5db'), backgroundColor: isSelected ? (isDark ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.1)') : (isDark ? '#111827' : '#ffffff'), alignItems: 'center', justifyContent: 'center' }}>
                      {val ? (
                        <Text style={{ fontSize: CELL * 0.5, fontFamily: 'SpaceGrotesk-Bold', color: isSelected ? '#a855f7' : t.textPrimary }}>{val}</Text>
                      ) : cellNotes.length > 0 ? (
                        <View style={{ flexWrap: 'wrap', flexDirection: 'row', width: CELL - 4 }}>
                          {[1,2,3,4,5,6,7,8,9].map(n => (
                            <Text key={n} style={{ width: (CELL - 4) / 3, fontSize: Math.max(6, CELL * 0.2), textAlign: 'center', color: cellNotes.includes(n) ? '#a855f7' : 'transparent', fontFamily: 'SpaceGrotesk-Medium', lineHeight: Math.max(7, CELL * 0.22) }}>{n}</Text>
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
                  );
                })}
              </View>
            ))}
          </View>

          {hint && (
            <HintBox
              description={hint.description}
              subText="Tap the highlighted cell to apply"
              onDismiss={dismissHint}
            />
          )}
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All your entries and notes will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); setSelected(null); dismissHint(); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  actionBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 56, minHeight: 52, borderWidth: 1 },
  numPad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  numKey: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});