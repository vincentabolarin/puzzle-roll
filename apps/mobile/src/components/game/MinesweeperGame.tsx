import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
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

interface MSCell { isMine: boolean; adjacentMines: number }
interface MSPuzzleData { rows: number; cols: number; grid: MSCell[][]; mineCount: number }
type CellState = 'hidden' | 'revealed' | 'flagged'
interface MSState { cellStates: CellState[][]; gameOver: boolean; hitMineAt: { r: number; c: number } | null }
interface MSProps {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
}

const NUM_COLORS = ['', '#3b82f6', '#22c55e', '#ef4444', '#7c3aed', '#dc2626', '#0891b2', '#111827', '#6b7280'];

export default function MinesweeperGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle }: MSProps) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification, errorNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const [isSolved, setIsSolved] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Guard: puzzleData may be undefined/null while loading
  if (!puzzleData || typeof (puzzleData as MSPuzzleData).rows !== 'number') {
    return null;
  }

  const pd = puzzleData as MSPuzzleData;
  const { rows, cols, grid, mineCount } = pd;
  const CELL = Math.min(Math.floor((width * 0.96) / cols), 40);

  function buildInitial(): MSState {
    return { cellStates: Array.from({ length: rows }, () => Array(cols).fill('hidden')), gameOver: false, hitMineAt: null };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as MSState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as MSState | undefined;
  const cellStates = gameState?.cellStates;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.MINESWEEPER, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  function floodReveal(states: CellState[][], r: number, c: number): CellState[][] {
    const ns = states.map(row => [...row]);
    const queue = [[r, c]];
    while (queue.length) {
      const [cr, cc] = queue.shift()!;
      if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
      if (ns[cr][cc] !== 'hidden') continue;
      ns[cr][cc] = 'revealed';
      if (grid[cr][cc].adjacentMines === 0 && !grid[cr][cc].isMine) {
        for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
          queue.push([cr + dr, cc + dc]);
        }
      }
    }
    return ns;
  }

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved || gameState.gameOver) return;
    const cur = cellStates![r][c];
    if (cur === 'revealed') return;
    if (cur === 'flagged') {
      const ns = cellStates!.map(row => [...row]);
      ns[r][c] = 'hidden';
      updateState({ ...gameState, cellStates: ns });
      return;
    }
    lightImpact();
    if (grid[r][c].isMine) {
      playSound('error'); (errorNotification as (() => void) | undefined)?.();
      const ns = cellStates!.map(row => [...row]);
      ns[r][c] = 'revealed';
      updateState({ ...gameState, cellStates: ns, gameOver: true, hitMineAt: { r, c } });
      return;
    }
    playSound('cell_tap');
    const ns = floodReveal(cellStates!, r, c);
    updateState({ ...gameState, cellStates: ns });
    const totalSafe = rows * cols - mineCount;
    const revealed = ns.flat().filter(s => s === 'revealed').length;
    if (revealed === totalSafe) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.MINESWEEPER, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.MINESWEEPER); await showInterstitialIfDue();
    }
  }, [gameState, isPaused, isSolved, cellStates, grid, rows, cols, mineCount, lightImpact, updateState, session, markSolved, successNotification, showInterstitialIfDue]);

  const handleLongPress = useCallback((r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    const cur = cellStates![r][c];
    if (cur === 'revealed') return;
    lightImpact();
    const ns = cellStates!.map(row => [...row]);
    ns[r][c] = cur === 'hidden' ? 'flagged' : 'hidden';
    updateState({ ...gameState, cellStates: ns });
  }, [gameState, isPaused, isSolved, cellStates, lightImpact, updateState]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const ns = cellStates!.map(row => [...row]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (ns[r][c] === 'hidden' && !grid[r][c].isMine) {
        const res = floodReveal(ns, r, c);
        lightImpact(); playSound('hint'); updateState({ ...gameState, cellStates: res }); return;
      }
    }
  }, [gameState, isPaused, cellStates, grid, rows, cols, useHint, showRewardedAd, lightImpact, updateState]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!cellStates || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.MINESWEEPER, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const flagCount = cellStates.flat().filter(s => s === 'flagged').length;
  const minesLeft = mineCount - flagCount;

  return (
    <GenericGameScreen puzzleId={puzzleId} gameType={GameType.MINESWEEPER} gameName="Minesweeper" accentColor="#ef4444" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => updateState(buildInitial())} onGetHint={handleHint} onNextPuzzle={onNextPuzzle} scrollable>
      <View>
        <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
          Tap: reveal · Long-press: flag 🚩 · Mines left: {minesLeft}
        </Text>
        {gameState.gameOver && (
          <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Bold', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
            💥 Mine hit! Tap Reset to try again.
          </Text>
        )}
        {cellStates.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((state, c) => {
              const cell = grid[r][c];
              const isHitMine = gameState.hitMineAt?.r === r && gameState.hitMineAt?.c === c;
              let bg = isDark ? '#111827' : '#e5e7eb';
              if (state === 'revealed') bg = isDark ? '#1f2937' : '#f9fafb';
              if (isHitMine) bg = '#ef4444';
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => handleCellPress(r, c)}
                  onLongPress={() => handleLongPress(r, c)}
                  disabled={isPaused || state === 'revealed'}
                  style={{ width: CELL, height: CELL, borderWidth: 0.5, borderColor: isDark ? '#374151' : '#9ca3af', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  {state === 'hidden' ? null
                    : state === 'flagged' ? <Text style={{ fontSize: CELL * 0.55 }}>🚩</Text>
                    : cell.isMine ? <Text style={{ fontSize: CELL * 0.55 }}>💣</Text>
                    : cell.adjacentMines > 0 ? <Text style={{ fontSize: CELL * 0.48, fontFamily: 'SpaceGrotesk-Bold', color: NUM_COLORS[cell.adjacentMines] }}>{cell.adjacentMines}</Text>
                    : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </GenericGameScreen>
  );
}