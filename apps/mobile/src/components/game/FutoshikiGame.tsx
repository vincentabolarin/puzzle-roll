import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, ScrollView } from 'react-native';
import { useMutation } from '@tanstack/react-query';
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

type FutoshikiPuzzleData = FutoshikiEngine.FutoshikiPuzzleData;
type FutoshikiGameState = FutoshikiEngine.FutoshikiGameState;
type FutoshikiSolution = FutoshikiEngine.FutoshikiSolution;
type FutoshikiConstraint = FutoshikiEngine.FutoshikiConstraint;

interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null }

export default function FutoshikiGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: Props) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const [isSolved, setIsSolved] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [solution, setSolution] = useState<FutoshikiSolution | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());

  const pd = puzzleData as FutoshikiPuzzleData;
  const { size, given, constraints } = pd;

  // Cell + gap layout
  const CON_GAP = Math.max(14, Math.floor(width * 0.04));
  const CELL = Math.max(32, Math.floor((width * 0.92 - CON_GAP * (size - 1)) / size));

  function buildInitial(): FutoshikiGameState {
    return { board: given.map(row => [...row]), selectedCell: null };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as FutoshikiGameState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: FutoshikiSolution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as FutoshikiGameState | undefined;
  const board = gameState?.board;
  const selectedCell = gameState?.selectedCell;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.FUTOSHIKI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onError: (_, v) => enqueue({ puzzleId, gameType: GameType.FUTOSHIKI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  function revalidate(nb: number[][]) {
    const result = FutoshikiEngine.validateFutoshikiBoard(nb, size, constraints);
    setConflicts(new Set(result.conflicts.map(c => `${c.row},${c.col}`)));
    return result;
  }

  const handleCellPress = useCallback((r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (given[r][c] !== 0) return; // given cell — select only
    lightImpact();
    updateState({ ...gameState, selectedCell: { row: r, col: c } }, false);
  }, [gameState, isPaused, isSolved, given, lightImpact, updateState]);

  const handleDigit = useCallback(async (digit: number) => {
    if (!gameState || !selectedCell || isPaused || isSolved) return;
    const { row, col } = selectedCell;
    if (given[row][col] !== 0) return;
    lightImpact(); playSound('digit_place');

    const nb = gameState.board.map(r => [...r]);
    nb[row][col] = nb[row][col] === digit ? 0 : digit;
    updateState({ ...gameState, board: nb });
    revalidate(nb);

    if (nb[row][col] !== 0) {
      const result = FutoshikiEngine.validateFutoshikiBoard(nb, size, constraints);
      if (result.conflicts.length === 0 && FutoshikiEngine.isFutoshikiSolved(nb, solution ?? { grid: nb })) {
        // Lazy-load solution for proper win verification
        const sol = await loadSolution();
        if (sol && FutoshikiEngine.isFutoshikiSolved(nb, sol)) {
          markSolved(); setIsSolved(true); successNotification(); playSound('complete');
          const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
          const shareable = generateShareableResult({ gameType: GameType.FUTOSHIKI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
          submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
          await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.FUTOSHIKI); await showInterstitialIfDue();
        }
      }
    }
  }, [gameState, selectedCell, isPaused, isSolved, given, size, constraints, solution, lightImpact, updateState, loadSolution, session, markSolved, successNotification, submit, markCompleted, puzzleId, showInterstitialIfDue]);

  const handleErase = useCallback(() => {
    if (!gameState || !selectedCell || isPaused || isSolved) return;
    const { row, col } = selectedCell;
    if (given[row][col] !== 0) return;
    lightImpact();
    const nb = gameState.board.map(r => [...r]);
    nb[row][col] = 0;
    updateState({ ...gameState, board: nb });
    revalidate(nb);
  }, [gameState, selectedCell, isPaused, isSolved, given, lightImpact, updateState, size, constraints]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = FutoshikiEngine.getHint(gameState, sol, given);
    if (!hint) return;
    lightImpact(); playSound('hint');
    const newState = { ...gameState, ...(hint.revealedState as Partial<FutoshikiGameState>) };
    updateState(newState);
    revalidate(newState.board);
  }, [gameState, isPaused, given, useHint, showRewardedAd, loadSolution, lightImpact, updateState, size, constraints]);

  // Constraint lookup helpers
  function getHCon(r: number, c: number): FutoshikiConstraint | undefined {
    return constraints.find(con => con.row1 === r && con.col1 === c && con.row2 === r && con.col2 === c + 1);
  }
  function getVCon(r: number, c: number): FutoshikiConstraint | undefined {
    return constraints.find(con => con.row1 === r && con.col1 === c && con.row2 === r + 1 && con.col2 === c);
  }

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.FUTOSHIKI, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.FUTOSHIKI} gameName="Futoshiki" accentColor="#6366f1" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} scrollable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
            Fill every row &amp; column 1–{size}. Respect the &lt; &gt; inequalities.
          </Text>

          {/* Grid with inline constraints */}
          {board.map((row, r) => (
            <View key={r}>
              {/* Cell row */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {row.map((val, c) => {
                  const isGiven = given[r][c] !== 0;
                  const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                  const hasConflict = conflicts.has(`${r},${c}`);
                  const hCon = c < size - 1 ? getHCon(r, c) : undefined;

                  return (
                    <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => handleCellPress(r, c)}
                        disabled={isPaused || isGiven}
                        style={{
                          width: CELL, height: CELL, borderRadius: 8, borderWidth: 1.5,
                          borderColor: hasConflict ? '#ef4444' : isSelected ? '#6366f1' : (isDark ? '#374151' : '#d1d5db'),
                          backgroundColor: isSelected
                            ? (isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)')
                            : (isDark ? '#111827' : '#ffffff'),
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {val !== 0 && (
                          <Text style={{
                            fontFamily: isGiven ? 'SpaceGrotesk-Bold' : 'JetBrainsMono-Regular',
                            fontSize: CELL * 0.52,
                            color: hasConflict ? '#ef4444' : isGiven ? t.textPrimary : '#6366f1',
                          }}>
                            {val}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {/* Horizontal constraint badge */}
                      {c < size - 1 && (
                        <View style={{ width: CON_GAP, alignItems: 'center', justifyContent: 'center' }}>
                          {hCon ? (
                            <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 13, color: t.accent }}>
                              {hCon.direction}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Vertical constraint row */}
              {r < size - 1 && (
                <View style={{ flexDirection: 'row', height: CON_GAP }}>
                  {row.map((_, c) => {
                    const vCon = getVCon(r, c);
                    return (
                      <View key={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: CELL, alignItems: 'center', justifyContent: 'center' }}>
                          {vCon ? (
                            <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 13, color: t.accent }}>
                              {/* Convert < > to down-pointing glyphs for vertical direction */}
                              {/* {vCon.direction === '<' ? '∧' : '∨'} */}
                              {vCon.direction}
                            </Text>
                          ) : null}
                        </View>
                        {c < size - 1 && <View style={{ width: CON_GAP }} />}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))}

          {/* Digit pad */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 48 }}>
            {Array.from({ length: size }, (_, i) => i + 1).map(d => (
              <TouchableOpacity
                key={d}
                onPress={() => handleDigit(d)}
                style={[styles.numKey, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <Text style={[styles.numKeyText, { color: t.textPrimary }]}>{d}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={handleErase} style={[styles.numKey, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.numKeyText, { color: t.textPrimary }]}>⌫</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All your entries will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); setConflicts(new Set()); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  numKey: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  numKeyText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22 },
});