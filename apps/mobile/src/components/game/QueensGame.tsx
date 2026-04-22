import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, PanResponder } from 'react-native';
import { TouchableOpacity } from 'react-native';
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
import ConfirmModal from '../ui/ConfirmModal';

// Fully opaque solid region colours — no transparency
// const REGION_COLORS = [
//   '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
//   '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16',
//   '#06b6d4', '#a855f7',
// ];

const REGION_COLORS = [
  '#a5b4fc', // indigo (was #6366f1)
  '#f9a8d4', // pink (was #ec4899)
  '#fcd34d', // amber (was #f59e0b)
  '#6ee7b7', // green (was #10b981)
  '#93c5fd', // blue (was #3b82f6)
  '#fca5a5', // red (was #ef4444)
  '#c4b5fd', // purple (was #8b5cf6)
  '#5eead4', // teal (was #14b8a6)
  '#fdba74', // orange (was #f97316)
  '#bef264', // lime (was #84cc16)
  '#67e8f9', // cyan (was #06b6d4)
  '#d8b4fe', // violet (was #a855f7)
];

// const REGION_COLORS = [
//   '#e0e7ff',
//   '#fce7f3',
//   '#fef3c7',
//   '#d1fae5',
//   '#dbeafe',
//   '#fee2e2',
//   '#ede9fe',
//   '#ccfbf1',
//   '#ffedd5',
//   '#ecfccb',
//   '#cffafe',
//   '#f3e8ff',
// ];

interface QueensPuzzleData { size: number; regions: number[][] }
type Mark = 'empty' | 'x' | 'queen';
interface QueensState { board: Mark[][] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null }

export default function QueensGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: Props) {
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
  const [solution, setSolution] = useState<{ queenPositions: { row: number; col: number }[] } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const pd = puzzleData as QueensPuzzleData;
  const { size, regions } = pd;
  const CELL = Math.min(Math.floor((width * 0.92) / size), 52);

  // ── Refs for PanResponder — NEVER read state/props inside handlers ──────────
  // All mutable game state accessed inside PanResponder must live in refs,
  // updated by useEffect, to avoid stale closures.
  const boardRef = useRef<View>(null);
  const boardOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const gameStateRef = useRef<QueensState | null>(null);
  const isPausedRef = useRef(false);
  const isSolvedRef = useRef(false);
  const cellSizeRef = useRef(CELL);
  const sizeRef = useRef(size);
  const dragBoardRef = useRef<Mark[][] | null>(null);
  const draggedCellsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync
  useEffect(() => {
    const gs = session?.currentState as QueensState | undefined;
    gameStateRef.current = gs ?? null;
  }, [session?.currentState]);
  useEffect(() => { isPausedRef.current = session?.isPaused ?? false; }, [session?.isPaused]);
  useEffect(() => { isSolvedRef.current = isSolved; }, [isSolved]);
  useEffect(() => { cellSizeRef.current = CELL; }, [CELL]);
  useEffect(() => { sizeRef.current = size; }, [size]);

  function buildInitial(): QueensState {
    return { board: Array.from({ length: size }, () => Array(size).fill('empty')) };
  }

  useEffect(() => {
    async function init() {
      const s = await loadProgress(puzzleId);
      if (s) { setSavedData(s); setShowResume(true); } else startFresh();
    }
    init();
  }, [puzzleId]);

  function startFresh() {
    startSession({ puzzleId, gameType: GameType.QUEENS, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 });
    setInitialized(true);
  }
  function continueFromSave() {
    startSession({ puzzleId, gameType: GameType.QUEENS, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as QueensState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 });
    setInitialized(true);
  }

  const loadSolution = useCallback(async () => {
    if (solution) return solution;
    try {
      const r = await apiClient.get<{ id: string; solution: typeof solution }>(`/puzzles/id/${puzzleId}/solution`);
      setSolution(r.solution); return r.solution;
    } catch { return null; }
  }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.QUEENS, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as QueensState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  function checkSolved(b: Mark[][]): boolean {
    const queens: [number, number][] = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (b[r][c] === 'queen') queens.push([r, c]);
    if (queens.length !== size) return false;
    const rows = new Set<number>(), cols = new Set<number>(), regs = new Set<number>();
    for (const [r, c] of queens) {
      if (rows.has(r) || cols.has(c) || regs.has(regions[r][c])) return false;
      rows.add(r); cols.add(c); regs.add(regions[r][c]);
      for (const [r2, c2] of queens) {
        if (r !== r2 && Math.abs(r - r2) <= 1 && Math.abs(c - c2) <= 1) return false;
      }
    }
    return true;
  }

  async function afterMove(nb: Mark[][]) {
    updateState({ board: nb });
    if (checkSolved(nb)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.QUEENS); await showInterstitialIfDue();
    }
  }

  // Single-tap cycle: empty → x → queen → empty
  // TouchableOpacity onPress fires cleanly without PanResponder interference
  // because PanResponder only activates after 8px movement.
  const handleCellTap = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    lightImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => [...row]) as Mark[][];
    const cur = nb[r][c];
    nb[r][c] = cur === 'empty' ? 'x' : cur === 'x' ? 'queen' : 'empty';
    await afterMove(nb);
  }, [gameState, isPaused, isSolved, lightImpact]);

  // PanResponder: ONLY activates for drag (>8px movement).
  // All state is read through refs — no stale closure issues.
  const panResponder = useMemo(() => PanResponder.create({
    // Don't steal single-tap from TouchableOpacity
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      const dist = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
      return dist > 8 && !isPausedRef.current && !isSolvedRef.current;
    },

    onPanResponderGrant: (e) => {
      if (isPausedRef.current || isSolvedRef.current) return;
      const currentState = gameStateRef.current;
      if (!currentState) return;
      dragBoardRef.current = currentState.board.map(row => [...row]) as Mark[][];
      draggedCellsRef.current = new Set();
      // Measure board origin now
      boardRef.current?.measure((_x, _y, _w, _h, px, py) => {
        boardOriginRef.current = { x: px, y: py };
      });
    },

    onPanResponderMove: (e) => {
      if (!dragBoardRef.current || isPausedRef.current || isSolvedRef.current) return;
      const { pageX, pageY } = e.nativeEvent;
      const CELL = cellSizeRef.current;
      const sz = sizeRef.current;
      const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
      const c = Math.floor((pageX - boardOriginRef.current.x) / CELL);
      if (r < 0 || r >= sz || c < 0 || c >= sz) return;
      const key = `${r},${c}`;
      if (draggedCellsRef.current.has(key)) return;
      draggedCellsRef.current.add(key);
      // Only mark empty cells as X during drag — never overwrite queens
      if (dragBoardRef.current[r][c] === 'empty') {
        dragBoardRef.current[r][c] = 'x';
        // Use getState() to avoid stale updateState closure
        useGameSessionStore.getState().updateState({ board: dragBoardRef.current.map(row => [...row]) }, false);
      }
    },

    onPanResponderRelease: () => {
      if (dragBoardRef.current) {
        useGameSessionStore.getState().updateState({ board: dragBoardRef.current.map(row => [...row]) }, true);
      }
      dragBoardRef.current = null;
      draggedCellsRef.current = new Set();
    },
    onPanResponderTerminate: () => {
      dragBoardRef.current = null;
      draggedCellsRef.current = new Set();
    },
  }), []); // created once — all state via refs

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const sol = await loadSolution(); if (!sol) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    for (const { row, col } of sol.queenPositions) {
      if (gameState.board[row][col] !== 'queen') {
        const nb = gameState.board.map(r => [...r]) as Mark[][]; nb[row][col] = 'queen';
        lightImpact(); playSound('hint'); updateState({ board: nb }); return;
      }
    }
  }, [gameState, isPaused, loadSolution, useHint, showRewardedAd, lightImpact, updateState]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.QUEENS, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.QUEENS} gameName="Queens" accentColor="#ec4899" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
            Tap: × then 👑. Drag to mark multiple cells ×.
          </Text>
          {/* panHandlers on outer wrapper — NOT on the grid View itself to avoid layout conflicts */}
          <View {...panResponder.panHandlers}>
            <View
              ref={boardRef}
              onLayout={() => {
                boardRef.current?.measure((_x, _y, _w, _h, px, py) => {
                  boardOriginRef.current = { x: px, y: py };
                });
              }}
            >
              {board.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((cell, c) => {
                    const regionColor = REGION_COLORS[regions[r][c] % REGION_COLORS.length];
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => handleCellTap(r, c)}
                        disabled={isPaused}
                        style={[styles.cell, { width: CELL, height: CELL, backgroundColor: regionColor }]}
                        activeOpacity={0.75}
                      >
                        {cell === 'queen' && <Text style={{ fontSize: CELL * 0.52 }}>👑</Text>}
                        {cell === 'x' && <Text style={{ fontSize: CELL * 0.52, color: 'rgba(0,0,0,0.65)', fontFamily: 'SpaceGrotesk-Bold' }}>×</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </GenericGameScreen>

      <ConfirmModal
        visible={showResetConfirm}
        title="Reset board?"
        message="All your marks will be cleared."
        confirmLabel="Reset"
        confirmDanger
        onConfirm={() => { setShowResetConfirm(false); updateState(buildInitial()); }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cell: { borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
});