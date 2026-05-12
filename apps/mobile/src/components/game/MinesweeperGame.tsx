import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GameType, Difficulty, MinesweeperEngine } from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
import { usePuzzleProgressStore, SavedPuzzleProgress } from '../../stores/puzzle-progress.store';
import { useOfflineQueueStore } from '../../stores/offline-queue.store';
import { useAppTheme } from '../../hooks/useAppTheme';

import { puzzleCache } from '../../services/puzzle-cache.service';

import { playSound } from '../../services/sound.service';
import GenericGameScreen from './GenericGameScreen';
import ResumeModal from './ResumeModal';
import ConfirmModal from '../ui/ConfirmModal';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { generateShareableResult } from '@/lib/shareable-result';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useHintHighlight } from '@/hooks/useHintHighlight';
import HintBox from '../ui/HintBox';

type MSCell = MinesweeperEngine.MinesweeperCell;
type MSGameState = MinesweeperEngine.MinesweeperGameState;
type MSPuzzleData = MinesweeperEngine.MinesweeperPuzzleData;

interface Props {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
  puzzleNumber?: number;
  difficulty?: Difficulty;
}

const NUM_COLORS = ['', '#3b82f6', '#22c55e', '#ef4444', '#7c3aed', '#dc2626', '#0891b2', '#111827', '#6b7280'];

export default function MinesweeperGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, mediumImpact, successNotification, errorNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted, saveDailyResult } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const queryClient = useQueryClient();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const isDark = t.background !== '#f9fafb';
  const [isSolved, setIsSolved] = useState(false);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { hint, blinkAnim, showHint, dismissHint, isHinted } = useHintHighlight();
  const hintOverlayStyle = useAnimatedStyle(() => ({ opacity: blinkAnim.value }));

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2500);
  }

  // Guard: puzzleData might not be loaded yet
  if (!puzzleData) return null;
  const pd = puzzleData as MSPuzzleData;
  const { config } = pd;
  if (!config || typeof config.rows !== 'number') return null;

  const { rows, cols, mines } = config;
  const CELL = Math.min(Math.floor((width * 0.97) / cols), 36);

  function buildInitial(): MSGameState {
    return {
      board: MinesweeperEngine.buildInitialBoard(config),
      minesPlaced: false,
      isGameOver: false,
      isWon: false,
      flagCount: 0,
    };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); if (isDaily) { continueFromSave(); } else { setShowResume(true); } } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() {
    startSession({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 });
    setInitialized(true);
  }
  function continueFromSave() {
    startSession({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as MSGameState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 });
    setInitialized(true);
  }


  // Save progress on unmount (covers back-navigation)
  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      usePuzzleProgressStore.getState().saveProgress({
        puzzleId, gameType: GameType.MINESWEEPER, difficulty: s.difficulty, isDaily, dailyPuzzleId,
        elapsedSeconds: useGameSessionStore.getState().getElapsed(),
        hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining,
        currentState: s.currentState, savedAt: Date.now(),
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);
  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as MSGameState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.MINESWEEPER, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.MINESWEEPER) });
      try {
        const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats');
        const s = stats.find(x => x.gameType === GameType.MINESWEEPER);
        if (s) setStreak(s.currentStreak);
      } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.MINESWEEPER, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  async function handleWin(newBoard: MSCell[][]) {
    markSolved(); setIsSolved(true); successNotification(); playSound('complete');
    const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
    const shareable = generateShareableResult({ gameType: GameType.MINESWEEPER, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
    submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
    if (isDaily && dailyPuzzleId) saveDailyResult(dailyPuzzleId, shareable);
    await markCompleted(puzzleId, isDaily);
    await puzzleCache.markCompleted(puzzleId, GameType.MINESWEEPER);
    await showInterstitialIfDue();
  }

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved || gameState.isGameOver) return;
    const cell = gameState.board[r][c];
    if (cell.state === 'revealed') return;
    if (cell.state === 'flagged') {
      // Unflag
      const nb = gameState.board.map(row => row.map(c => ({ ...c })));
      nb[r][c] = { ...nb[r][c], state: 'hidden' };
      updateState({ ...gameState, board: nb, flagCount: gameState.flagCount - 1 });
      return;
    }

    lightImpact(); playSound('cell_tap');

    let currentBoard = gameState.board;
    let minesPlaced = gameState.minesPlaced;

    // Place mines on first tap, guaranteeing safety
    if (!minesPlaced) {
      const mineGrid = MinesweeperEngine.placeMines(config, r, c, Date.now());
      currentBoard = MinesweeperEngine.applyMinesToBoard(currentBoard, mineGrid);
      minesPlaced = true;
    }

    if (currentBoard[r][c].isMine) {
      // Hit a mine
      playSound('error'); errorNotification();
      const nb = currentBoard.map(row => row.map(c => ({ ...c })));
      nb[r][c] = { ...nb[r][c], state: 'revealed' };
      updateState({ ...gameState, board: nb, minesPlaced, isGameOver: true });
      return;
    }

    const nb = MinesweeperEngine.floodReveal(currentBoard, r, c);
    const won = MinesweeperEngine.checkWin(nb);
    updateState({ ...gameState, board: nb, minesPlaced, isGameOver: false, isWon: won });
    dismissHint();
    if (won) await handleWin(nb);
  }, [gameState, isPaused, isSolved, config, lightImpact, errorNotification, updateState, session]);

  const handleLongPress = useCallback((r: number, c: number) => {
    if (!gameState || isPaused || isSolved || gameState.isGameOver) return;
    const cell = gameState.board[r][c];
    if (cell.state === 'revealed') return;
    mediumImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => row.map(c => ({ ...c })));
    const isFlagged = nb[r][c].state === 'flagged';
    nb[r][c] = { ...nb[r][c], state: isFlagged ? 'hidden' : 'flagged' };
    updateState({ ...gameState, board: nb, flagCount: gameState.flagCount + (isFlagged ? -1 : 1) });
  }, [gameState, isPaused, isSolved, mediumImpact, updateState]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused || isSolved || gameState.isGameOver) return;
    if (!gameState.minesPlaced) {
      showToast('Reveal a cell first, then use a hint 💡');
      return;
    }
    const h = MinesweeperEngine.getHint(gameState);
    if (!h) { showToast('No hint available right now'); return; }
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    lightImpact(); playSound('hint');

    const { row, col } = h.position!;
    const revealedNeighbours = ([-1,0,1]).flatMap(dr =>
      ([-1,0,1]).map(dc => {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nc < 0 || nr >= gameState.board.length || nc >= gameState.board[0].length) return null;
        const cell = gameState.board[nr][nc];
        return cell.state === 'revealed' && !cell.isMine ? cell : null;
      })
    ).filter(Boolean);

    const desc = `Row ${row + 1}, column ${col + 1} is safe to reveal. ` +
      (revealedNeighbours.length > 0
        ? `The numbered cells around it account for all mines in that area, so this cell cannot contain a mine.`
        : `Process of elimination rules out a mine here.`);

    showHint({ row, col, description: desc });
    updateState(h.revealedState as MSGameState);
    if ((h.revealedState as any).isWon) await handleWin(h.revealedState.board as MSCell[][]);
  }, [gameState, isPaused, useHint, showRewardedAd, lightImpact, updateState, showHint, session]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.MINESWEEPER, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const minesLeft = mines - (gameState?.flagCount ?? 0);

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.MINESWEEPER} gameName="Minesweeper" accentColor="#ef4444" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty} onNextPuzzle={onNextPuzzle} scrollable>
        <View>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 4, textAlign: 'center' }}>
            Tap: reveal · Long-press: flag 🚩 · Mines left: {minesLeft}
          </Text>
          {gameState?.isGameOver && (
            <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Bold', fontSize: 13, textAlign: 'center', marginBottom: 6 }}>
              💥 Mine hit! Reset to try again.
            </Text>
          )}
          <View style={{ borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280' }}>
            {board.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((cell, c) => {
                  const isHitMine = gameState?.isGameOver && cell.state === 'revealed' && cell.isMine;
                  let bg = isDark ? '#111827' : '#e5e7eb';
                  if (cell.state === 'revealed') bg = isDark ? '#1f2937' : '#f9fafb';
                  if (isHitMine) bg = '#ef4444';
                  return (
                    <View key={c} style={{ position: 'relative' }}>
                      <TouchableOpacity
                        onPress={() => handleCellPress(r, c)}
                        onLongPress={() => handleLongPress(r, c)}
                        delayLongPress={300}
                        disabled={isPaused || cell.state === 'revealed'}
                        activeOpacity={0.7}
                        style={{ width: CELL, height: CELL, borderWidth: 0.5, borderColor: isDark ? '#374151' : '#9ca3af', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
                      >
                        {cell.state === 'flagged' ? (
                          <Text style={{ fontSize: CELL * 0.55 }}>🚩</Text>
                        ) : cell.state === 'revealed' && cell.isMine ? (
                          <Text style={{ fontSize: CELL * 0.55 }}>💣</Text>
                        ) : cell.state === 'revealed' && cell.adjacentMines > 0 ? (
                          <Text style={{ fontSize: Math.max(9, CELL * 0.48), fontFamily: 'SpaceGrotesk-Bold', color: NUM_COLORS[cell.adjacentMines] }}>
                            {cell.adjacentMines}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                      {isHinted(r, c) && (
                        <Animated.View pointerEvents="none" style={[
                          { position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.5)' },
                          hintOverlayStyle,
                        ]} />
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {toastMsg && (
            <View style={{ backgroundColor: '#1e3a5f', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8, alignSelf: 'center' }}>
              <Text style={{ color: '#93c5fd', fontFamily: 'SpaceGrotesk-Medium', fontSize: 12, textAlign: 'center' }}>{toastMsg}</Text>
            </View>
          )}

          {hint && (
              <HintBox
                description={hint.description}
                subText="The highlighted cell has been revealed"
                onDismiss={dismissHint}
              />
            )}
          </View>
        </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="Start this Minesweeper board fresh." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); setIsSolved(false); dismissHint(); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}