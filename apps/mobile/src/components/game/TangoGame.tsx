import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
import { TangoEngine } from '@puzzle-roll/shared';
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

type TangoSymbol = TangoEngine.TangoSymbol;
interface TangoState { board: TangoSymbol[][] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null }

export default function TangoGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: Props) {
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
  const [solution, setSolution] = useState<TangoEngine.TangoSolution | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const pd = puzzleData as TangoEngine.TangoPuzzleData;
  const { size, given, constraints } = pd;

  // Cell fills 90% of screen width, minimum 36px
  const CELL = Math.max(36, Math.min(Math.floor((width * 0.9) / size), 72));
  // Constraint badge is 30% of cell size, min 16px
  const CON_SIZE = Math.max(16, Math.floor(CELL * 0.30));

  function buildInitial(): TangoState { return { board: given.map(r => [...r]) }; }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as TangoState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }

  const loadSolution = useCallback(async (): Promise<TangoEngine.TangoSolution | null> => {
    if (solution) return solution;
    try { const r = await apiClient.get<{ id: string; solution: TangoEngine.TangoSolution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; }
  }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.TANGO, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as TangoState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onError: (_, v) => enqueue({ puzzleId, gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  async function checkAndFinish(nb: TangoSymbol[][]) {
    const sol = await loadSolution(); if (!sol) return;
    if (TangoEngine.isTangoSolved(nb, size, sol)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.TANGO); await showInterstitialIfDue();
    }
  }

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (given[r][c] !== 'empty') return;
    lightImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => [...row]);
    nb[r][c] = TangoEngine.cycleTangoSymbol(nb[r][c]);
    updateState({ board: nb });
    await checkAndFinish(nb);
  }, [gameState, isPaused, isSolved, given, lightImpact, updateState]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = TangoEngine.getHint(gameState, sol, given); if (!hint) return;
    lightImpact(); playSound('hint'); updateState(hint.revealedState as TangoState);
  }, [gameState, isPaused, useHint, showRewardedAd, loadSolution, given, lightImpact, updateState]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const conflicts = TangoEngine.validateTangoBoard(board, size, constraints);
  const conflictSet = new Set(conflicts.conflicts.map(({ row, col }) => `${row},${col}`));
  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.TANGO, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  // Constraint badge colors use theme accent and text colors
  const conBg = isDark ? '#1f2937' : '#e5e7eb';
  const conText = '#f97316';

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.TANGO} gameName="Tango" accentColor="#f97316" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} scrollable>
        {/* Extra top padding to push board away from header */}
        <View style={{ paddingTop: 16, alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, marginBottom: 14 }}>
            Tap to cycle ☀️ → 🌙 → empty
          </Text>
          {board.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {row.map((sym, c) => {
                const isGiven = given[r][c] !== 'empty';
                const isConflict = conflictSet.has(`${r},${c}`);
                const hCon = constraints.horizontal[`${r},${c}`];
                const vCon = constraints.vertical[`${r},${c}`];
                return (
                  <View key={c} style={{ position: 'relative' }}>
                    <TouchableOpacity
                      onPress={() => handleCellPress(r, c)}
                      disabled={isGiven || isPaused}
                      style={[styles.cell, {
                        width: CELL, height: CELL,
                        backgroundColor: isConflict
                          ? (isDark ? '#7f1d1d' : '#fee2e2')
                          : isGiven ? (isDark ? '#1a1f35' : '#dde4f5')
                          : (isDark ? '#111827' : '#ffffff'),
                        borderColor: isDark ? '#374151' : '#d1d5db',
                      }]}
                      accessibilityLabel={`Row ${r+1} col ${c+1}: ${sym}`}
                    >
                      <Text style={{ fontSize: CELL * 0.48 }}>
                        {sym === 'sun' ? '☀️' : sym === 'moon' ? '🌙' : ''}
                      </Text>
                    </TouchableOpacity>

                    {/* Horizontal constraint — positioned at right edge of cell, centred vertically */}
                    {hCon && c < size - 1 && (
                      <View style={[styles.conBadge, {
                        right: -(CON_SIZE / 2 + 1),
                        top: (CELL - CON_SIZE) / 2,
                        width: CON_SIZE, height: CON_SIZE, borderRadius: CON_SIZE / 2,
                        backgroundColor: conBg,
                      }]}>
                        <Text style={[styles.conText, { color: conText, fontSize: CON_SIZE * 0.55 }]}>
                          {hCon === '=' ? '=' : '✕'}
                        </Text>
                      </View>
                    )}
                    {/* Vertical constraint — positioned at bottom edge of cell, centred horizontally */}
                    {vCon && r < size - 1 && (
                      <View style={[styles.conBadge, {
                        bottom: -(CON_SIZE / 2 + 1),
                        left: (CELL - CON_SIZE) / 2,
                        width: CON_SIZE, height: CON_SIZE, borderRadius: CON_SIZE / 2,
                        backgroundColor: conBg,
                        zIndex: 10,
                      }]}>
                        <Text style={[styles.conText, { color: conText, fontSize: CON_SIZE * 0.55 }]}>
                          {vCon === '=' ? '=' : '✕'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All your symbols will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  cell: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  conBadge: { position: 'absolute', zIndex: 10, alignItems: 'center', justifyContent: 'center' },
  conText: { fontFamily: 'SpaceGrotesk-Bold' },
});