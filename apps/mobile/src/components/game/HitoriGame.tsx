import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { GameType, Difficulty, HitoriEngine } from '@puzzle-roll/shared';
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

type HitoriPuzzleData = HitoriEngine.HitoriPuzzleData;
type HitoriCell = HitoriEngine.HitoriCell;
type HitoriGameState = HitoriEngine.HitoriGameState;
type HitoriSolution = HitoriEngine.HitoriSolution;

interface Props {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
}

export default function HitoriGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle }: Props) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, mediumImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const isDark = t.background !== '#f9fafb';
  const [isSolved, setIsSolved] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [solution, setSolution] = useState<HitoriSolution | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());

  if (!puzzleData || typeof (puzzleData as HitoriPuzzleData).size !== 'number') return null;

  const pd = puzzleData as HitoriPuzzleData;
  const { size, grid: puzzleGrid } = pd;
  const CELL = Math.min(Math.floor((width * 0.92) / size), 52);

  function buildInitial(): HitoriGameState {
    return {
      board: puzzleGrid.map(row =>
        row.map(val => ({ value: val, state: 'unshaded' as const }))
      ),
    };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.HITORI, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.HITORI, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as HitoriGameState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: HitoriSolution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.HITORI, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as HitoriGameState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.HITORI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onError: (_, v) => enqueue({ puzzleId, gameType: GameType.HITORI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  function revalidate(nb: HitoriCell[][]) {
    const result = HitoriEngine.validateHitoriBoard(nb, size);
    setConflicts(new Set(result.conflicts.map(c => `${c.row},${c.col}`)));
    return result;
  }

  async function resolveWin(nb: HitoriCell[][]) {
    const sol = await loadSolution();
    if (sol && HitoriEngine.isHitoriSolved(nb, sol)) {
      const result = revalidate(nb);
      if (result.conflicts.length === 0) {
        markSolved(); setIsSolved(true); successNotification(); playSound('complete');
        const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
        const shareable = generateShareableResult({ gameType: GameType.HITORI, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
        submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
        await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.HITORI); await showInterstitialIfDue();
      }
    }
  }

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    // Haptic on tap: light for shade, medium feedback
    lightImpact(); playSound('cell_tap');
    const nb: HitoriCell[][] = gameState.board.map(row => row.map(cell => ({ ...cell })));
    const cur = nb[r][c].state;
    nb[r][c] = { ...nb[r][c], state: cur === 'shaded' ? 'unshaded' : 'shaded' };
    updateState({ board: nb });
    revalidate(nb);
    await resolveWin(nb);
  }, [gameState, isPaused, isSolved, size, lightImpact, updateState, session, markSolved, successNotification, submit, markCompleted, puzzleId, showInterstitialIfDue, loadSolution]);

  const handleCellLongPress = useCallback((r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    // Distinct haptic for long-press (circle = confirm unshaded)
    mediumImpact(); playSound('cell_tap');
    const nb: HitoriCell[][] = gameState.board.map(row => row.map(cell => ({ ...cell })));
    const cur = nb[r][c].state;
    nb[r][c] = { ...nb[r][c], state: cur === 'circled' ? 'unshaded' : 'circled' };
    updateState({ board: nb });
    revalidate(nb);
  }, [gameState, isPaused, isSolved, size, mediumImpact, updateState]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = HitoriEngine.getHint(gameState, sol);
    if (!hint) return;
    lightImpact(); playSound('hint');
    const newBoard = hint.revealedState.board as HitoriCell[][];
    updateState({ board: newBoard });
    revalidate(newBoard);
    await resolveWin(newBoard);
  }, [gameState, isPaused, size, useHint, showRewardedAd, loadSolution, lightImpact, updateState, session]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.HITORI, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.HITORI} gameName="Hitori" accentColor="#6366f1" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} onNextPuzzle={onNextPuzzle}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
            Tap to shade · Long-press to circle (confirm unshaded)
          </Text>
          <View style={{ borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280' }}>
            {board.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((cell, c) => {
                  const isShaded = cell.state === 'shaded';
                  const isCircled = cell.state === 'circled';
                  const hasConflict = conflicts.has(`${r},${c}`);

                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => handleCellPress(r, c)}
                      onLongPress={() => handleCellLongPress(r, c)}
                      delayLongPress={300}
                      disabled={isPaused}
                      activeOpacity={0.7}
                      style={{
                        width: CELL, height: CELL,
                        borderWidth: 0.5,
                        borderColor: hasConflict ? '#ef4444' : (isDark ? '#374151' : '#9ca3af'),
                        backgroundColor: isShaded
                          ? (hasConflict ? '#ef4444' : (isDark ? '#1f2937' : '#374151'))
                          : (isDark ? '#060818' : '#ffffff'),
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isCircled ? (
                        <View style={{
                          width: CELL * 0.78, height: CELL * 0.78, borderRadius: CELL * 0.39,
                          borderWidth: 2, borderColor: '#6366f1',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontFamily: 'JetBrainsMono-Regular', fontSize: CELL * 0.4, color: '#6366f1' }}>
                            {cell.value}
                          </Text>
                        </View>
                      ) : (
                        <Text style={{
                          fontFamily: 'JetBrainsMono-Regular',
                          fontSize: CELL * 0.44,
                          color: isShaded
                            ? (hasConflict ? '#fff' : '#6b7280')
                            : hasConflict ? '#ef4444' : t.textPrimary,
                        }}>
                          {cell.value}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All shading will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); setConflicts(new Set()); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}