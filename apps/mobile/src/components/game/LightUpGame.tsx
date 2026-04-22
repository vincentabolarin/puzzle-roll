import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { GameType, Difficulty, LightUpEngine } from '@puzzle-roll/shared';
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

type LightUpPuzzleData = LightUpEngine.LightUpPuzzleData;
type LightUpCell = LightUpEngine.LightUpCell;
type LightUpGameState = LightUpEngine.LightUpGameState;
type LightUpSolution = LightUpEngine.LightUpSolution;

interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null }

export default function LightUpGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: Props) {
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
  const [solution, setSolution] = useState<LightUpSolution | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const pd = puzzleData as LightUpPuzzleData;
  const { rows, cols, grid: puzzleGrid } = pd;
  const CELL = Math.min(Math.floor((width * 0.95) / cols), 44);

  function buildInitial(): LightUpGameState {
    const board: LightUpCell[][] = puzzleGrid.map(row =>
      row.map(cell => ({
        type: cell.type,
        adjacentBulbClue: cell.adjacentBulbClue,
        state: 'empty' as const,
        isLit: false,
      }))
    );
    return { board };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as LightUpGameState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: LightUpSolution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as LightUpGameState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.LIGHT_UP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onError: (_, v) => enqueue({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (gameState.board[r][c].type === 'black') return;
    lightImpact(); playSound('cell_tap');

    // Toggle bulb
    const nb: LightUpCell[][] = gameState.board.map(row => row.map(cell => ({ ...cell })));
    const cur = nb[r][c].state;
    nb[r][c] = { ...nb[r][c], state: (cur === 'bulb' || cur === 'conflict') ? 'empty' : 'bulb' };

    // Recompute illumination
    const recomputed = LightUpEngine.computeBoardState(nb, rows, cols);
    updateState({ board: recomputed });

    if (LightUpEngine.isLightUpSolved(recomputed, rows, cols, pd)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.LIGHT_UP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.LIGHT_UP); await showInterstitialIfDue();
    }
  }, [gameState, isPaused, isSolved, rows, cols, pd, lightImpact, updateState, session, markSolved, successNotification, submit, markCompleted, puzzleId, showInterstitialIfDue]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = LightUpEngine.getHint(gameState, sol);
    if (!hint) return;
    lightImpact(); playSound('hint');
    const recomputed = LightUpEngine.computeBoardState(hint.revealedState.board as LightUpCell[][], rows, cols);
    updateState({ board: recomputed });
  }, [gameState, isPaused, rows, cols, useHint, showRewardedAd, loadSolution, lightImpact, updateState]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.LIGHT_UP, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.LIGHT_UP} gameName="Light Up" accentColor="#f59e0b" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} scrollable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
            Tap white cells to place 💡. Light every cell without conflicts.
          </Text>
          <View style={{ borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280' }}>
            {board.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((cell, c) => {
                  const isBlack = cell.type === 'black';
                  const isBulb = cell.state === 'bulb';
                  const isConflict = cell.state === 'conflict';
                  const isLit = cell.isLit;
                  const clue = puzzleGrid[r][c].adjacentBulbClue;

                  // Check if black cell's clue is violated
                  let clueViolated = false;
                  if (isBlack && clue !== null) {
                    let adj = 0;
                    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
                      const nr = r+dr, nc = c+dc;
                      if (nr>=0&&nr<rows&&nc>=0&&nc<cols) {
                        const s = board[nr][nc].state;
                        if (s==='bulb'||s==='conflict') adj++;
                      }
                    }
                    clueViolated = adj !== clue;
                  }

                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => handleCellPress(r, c)}
                      disabled={isPaused || isBlack}
                      activeOpacity={isBlack ? 1 : 0.7}
                      style={{
                        width: CELL, height: CELL,
                        borderWidth: 0.5,
                        borderColor: isDark ? '#374151' : '#9ca3af',
                        backgroundColor: isBlack
                          ? (isDark ? '#1f2937' : '#374151')
                          : isConflict
                          ? (isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.18)')
                          : isLit
                          ? (isDark ? 'rgba(251,191,36,0.22)' : 'rgba(251,191,36,0.18)')
                          : (isDark ? '#060818' : '#ffffff'),
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isBlack && clue !== null ? (
                        <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: Math.max(10, CELL * 0.46), color: clueViolated ? '#ef4444' : '#f9fafb' }}>
                          {clue}
                        </Text>
                      ) : isBulb || isConflict ? (
                        <Text style={{ fontSize: CELL * 0.58 }}>💡</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All bulbs will be removed." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}