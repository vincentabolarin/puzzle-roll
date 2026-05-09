import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query-client';
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
import { usePuzzleSolution } from '@/hooks/usePuzzleSolution';

type LightUpPuzzleData = LightUpEngine.LightUpPuzzleData;
type LightUpCell = LightUpEngine.LightUpCell;
type LightUpGameState = LightUpEngine.LightUpGameState;
type LightUpSolution = LightUpEngine.LightUpSolution;

// Per-cell user mark: 'empty' | 'x' (no bulb here marker) | handled via state.state
// We extend the engine state to carry user 'x' marks on non-bulb white cells
interface ExtLightUpCell extends LightUpCell {
  isMarkedX?: boolean;
}
interface ExtLightUpState { board: ExtLightUpCell[][] }

interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void; puzzleNumber?: number; difficulty?: string }

const DOUBLE_TAP_MS = 280;

export default function LightUpGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, undo, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const queryClient = useQueryClient();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
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
  const lastTapRef = useRef<{ r: number; c: number; time: number } | null>(null);

  const { loadSolution } = usePuzzleSolution<LightUpSolution>(puzzleId);

  if (!puzzleData) return null;
  const pd = puzzleData as LightUpPuzzleData;
  const { rows, cols, grid: puzzleGrid } = pd;
  if (!rows || !cols) return null;
  const CELL = Math.min(Math.floor((width * 0.95) / cols), 44);

  function buildInitial(): ExtLightUpState {
    const board: ExtLightUpCell[][] = puzzleGrid.map(row =>
      row.map(cell => ({ type: cell.type, adjacentBulbClue: cell.adjacentBulbClue, state: 'empty' as const, isLit: false, isMarkedX: false }))
    );
    return { board };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as ExtLightUpState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);


  // Save progress on unmount (covers back-navigation)
  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: useGameSessionStore.getState().getElapsed(), hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);
  const gameState = session?.currentState as ExtLightUpState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.LIGHT_UP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.LIGHT_UP) });
      try { const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats'); const s = stats.find(x => x.gameType === GameType.LIGHT_UP); if (s) setStreak(s.currentStreak); } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.LIGHT_UP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  async function resolveWin(newBoard: ExtLightUpCell[]) {
    // Cast to satisfy engine — isMarkedX not relevant to win check
    if (LightUpEngine.isLightUpSolved(newBoard as unknown as LightUpCell[][], rows, cols, pd)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.LIGHT_UP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.LIGHT_UP); await showInterstitialIfDue();
    }
  }

  /**
   * Single-tap: toggle X mark (candidate elimination)
   * Double-tap: toggle bulb
   */
  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (gameState.board[r][c].type === 'black') return;
    lightImpact(); playSound('cell_tap');

    const now = Date.now();
    const last = lastTapRef.current;
    const isDoubleTap = last && last.r === r && last.c === c && (now - last.time) < DOUBLE_TAP_MS;
    lastTapRef.current = { r, c, time: now };

    const nb: ExtLightUpCell[][] = gameState.board.map(row => row.map(cell => ({ ...cell })));

    if (isDoubleTap) {
      // Double-tap: toggle bulb (clear X if present)
      const cur = nb[r][c].state;
      nb[r][c] = { ...nb[r][c], state: (cur === 'bulb' || cur === 'conflict') ? 'empty' : 'bulb', isMarkedX: false };
    } else {
      // Single tap: toggle X mark (only on empty cells; clear bulb first if needed)
      if (nb[r][c].state === 'bulb' || nb[r][c].state === 'conflict') {
        // Already a bulb — single tap removes it (treat as clearing)
        nb[r][c] = { ...nb[r][c], state: 'empty', isMarkedX: false };
      } else {
        nb[r][c] = { ...nb[r][c], isMarkedX: !nb[r][c].isMarkedX, state: 'empty' };
      }
    }

    const recomputed = LightUpEngine.computeBoardState(nb as LightUpCell[][], rows, cols) as ExtLightUpCell[][];
    // Re-apply isMarkedX (engine doesn't know about it)
    for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) {
      recomputed[ri][ci].isMarkedX = nb[ri][ci].isMarkedX;
    }

    updateState({ board: recomputed }, true);
    await resolveWin(recomputed as unknown as ExtLightUpCell[]);
  }, [gameState, isPaused, isSolved, rows, cols, pd, lightImpact, updateState, session]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const hint = LightUpEngine.getHint(gameState as unknown as LightUpGameState, sol); if (!hint) return;
    lightImpact(); playSound('hint');
    const hintedBoard = hint.revealedState.board as ExtLightUpCell[][];
    const recomputed = LightUpEngine.computeBoardState(hintedBoard as LightUpCell[][], rows, cols) as ExtLightUpCell[][];
    updateState({ board: recomputed }, true);
    await resolveWin(recomputed as unknown as ExtLightUpCell[]);
  }, [gameState, isPaused, rows, cols, useHint, showRewardedAd, loadSolution, lightImpact, updateState, session]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.LIGHT_UP, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.LIGHT_UP} gameName="Light Up" accentColor="#f59e0b" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty} onNextPuzzle={onNextPuzzle} scrollable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 4, textAlign: 'center' }}>
            Tap: × mark · Double-tap: 💡 bulb · Light every white cell
          </Text>
          {/* Undo button */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
            <TouchableOpacity onPress={() => { lightImpact(); undo(); }} style={[styles.undoBtn, { backgroundColor: t.surface2, borderColor: t.border }]}>
              <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Medium', fontSize: 13 }}>↩ Undo</Text>
            </TouchableOpacity>
          </View>
          <View style={{ borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280' }}>
            {board.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((cell, c) => {
                  const isBlack = cell.type === 'black';
                  const isBulb = cell.state === 'bulb';
                  const isConflict = cell.state === 'conflict';
                  const clue = puzzleGrid[r][c].adjacentBulbClue;
                  let clueViolated = false;
                  if (isBlack && clue !== null) {
                    let adj = 0;
                    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
                      const nr = r+dr, nc = c+dc;
                      if (nr>=0&&nr<rows&&nc>=0&&nc<cols) { const s = board[nr][nc].state; if (s==='bulb'||s==='conflict') adj++; }
                    }
                    clueViolated = adj !== clue;
                  }
                  return (
                    <TouchableOpacity key={c} onPress={() => handleCellPress(r, c)} disabled={isPaused || isBlack} activeOpacity={isBlack ? 1 : 0.7}
                      style={{
                        width: CELL, height: CELL, borderWidth: 0.5, borderColor: isDark ? '#374151' : '#9ca3af',
                        backgroundColor: isBlack ? (isDark ? '#1f2937' : '#374151') : isConflict ? (isDark ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.18)') : cell.isLit ? (isDark ? 'rgba(251,191,36,0.22)' : 'rgba(251,191,36,0.18)') : (isDark ? '#060818' : '#ffffff'),
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                      {isBlack && clue !== null ? (
                        <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: Math.max(10, CELL * 0.46), color: clueViolated ? '#ef4444' : '#f9fafb' }}>{clue}</Text>
                      ) : (isBulb || isConflict) ? (
                        <Text style={{ fontSize: CELL * 0.58 }}>💡</Text>
                      ) : (cell as ExtLightUpCell).isMarkedX ? (
                        <Text style={{ fontSize: CELL * 0.5, color: isDark ? '#6b7280' : '#9ca3af', fontFamily: 'SpaceGrotesk-Bold' }}>×</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All bulbs and marks will be removed." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  undoBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});