import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, PanResponder, Animated } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
import { usePuzzleSolution } from '../../hooks/usePuzzleSolution';
import { usePuzzleProgressStore, SavedPuzzleProgress } from '../../stores/puzzle-progress.store';
import { useOfflineQueueStore } from '../../stores/offline-queue.store';
import { useAppTheme } from '../../hooks/useAppTheme';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query-client';
import { puzzleCache } from '../../services/puzzle-cache.service';
import { generateShareableResult } from '../../lib/shareable-result';
import { playSound } from '../../services/sound.service';
import GenericGameScreen from './GenericGameScreen';
import ResumeModal from './ResumeModal';
import ConfirmModal from '../ui/ConfirmModal';
import { useSettingsStore } from '../../stores/settings.store';

// Rich, saturated region colours — works on both light and dark
const REGION_COLORS = [
  '#818cf8', // indigo
  '#f472b6', // pink
  '#fb923c', // orange
  '#34d399', // emerald
  '#60a5fa', // blue
  '#f87171', // red
  '#a78bfa', // violet
  '#2dd4bf', // teal
  '#fbbf24', // amber
  '#86efac', // green
  '#67e8f9', // cyan
  '#e879f9', // fuchsia
];

interface QueensPuzzleData { size: number; regions: number[][] }
type Mark = 'empty' | 'x' | 'queen';
interface QueensState { board: Mark[][] }
interface HintState { row: number; col: number; description: string }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void; puzzleNumber?: number; difficulty?: string }

// SVG queen crown icon
function QueenIcon({ size }: { size: number }) {
  const s = size * 0.62;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path
        d="M2 19h20l-2-9-4 4-4-7-4 7-4-4-2 9z"
        fill="rgba(0,0,0,0.75)"
        stroke="rgba(0,0,0,0.4)"
        strokeWidth={0.5}
      />
      <Path
        d="M5 19h14v1.5H5z"
        fill="rgba(0,0,0,0.6)"
      />
    </Svg>
  );
}

export default function QueensGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, undo, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const queryClient = useQueryClient();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const isDark = t.background !== '#f9fafb';
  const { loadSolution } = usePuzzleSolution<{ queenPositions: { row: number; col: number }[] }>(puzzleId);
  const { queensAutoMark } = useSettingsStore();
  const [isSolved, setIsSolved] = useState(false);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [hintState, setHintState] = useState<HintState | null>(null);
  const [dragTick, setDragTick] = useState(0);

  const blinkAnim = useRef(new Animated.Value(1)).current;
  const blinkLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (hintState) {
      blinkAnim.setValue(1);
      blinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      blinkLoop.current.start();
    } else {
      blinkLoop.current?.stop();
    }
    return () => { blinkLoop.current?.stop(); };
  }, [hintState]);

  if (!puzzleData) return null;
  const pd = puzzleData as QueensPuzzleData;
  const { size, regions } = pd;
  const CELL = Math.min(Math.floor((width * 0.94) / size), 54);

  // Refs for PanResponder
  const boardRef = useRef<View>(null);
  const boardOriginRef = useRef({ x: 0, y: 0 });
  const gameStateRef = useRef<QueensState | null>(null);
  const isPausedRef = useRef(false);
  const isSolvedRef = useRef(false);
  const cellSizeRef = useRef(CELL);
  const sizeRef = useRef(size);
  const regionsRef = useRef(regions);
  const dragBoardRef = useRef<Mark[][] | null>(null);
  const draggedCellsRef = useRef<Set<string>>(new Set());
  const lastDragPosRef = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => { const gs = session?.currentState as QueensState | undefined; gameStateRef.current = gs ?? null; }, [session?.currentState]);
  useEffect(() => { isPausedRef.current = session?.isPaused ?? false; }, [session?.isPaused]);
  useEffect(() => { isSolvedRef.current = isSolved; }, [isSolved]);
  useEffect(() => { cellSizeRef.current = CELL; }, [CELL]);
  useEffect(() => { sizeRef.current = size; regionsRef.current = regions; }, [size, regions]);

  function buildInitial(): QueensState {
    return { board: Array.from({ length: size }, () => Array(size).fill('empty')) };
  }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.QUEENS, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: useGameSessionStore.getState().getElapsed(), hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.QUEENS, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.QUEENS, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as QueensState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.QUEENS, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as QueensState | undefined;
  const displayBoard = dragBoardRef.current ?? gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.QUEENS) });
      try {
        const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats');
        const s = stats.find(x => x.gameType === GameType.QUEENS);
        if (s) setStreak(s.currentStreak);
      } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  function checkSolved(b: Mark[][]): boolean {
    const queens: [number, number][] = [];
    const sz = sizeRef.current, regs = regionsRef.current;
    for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) if (b[r][c] === 'queen') queens.push([r, c]);
    if (queens.length !== sz) return false;
    const rows = new Set<number>(), cols = new Set<number>(), regSet = new Set<number>();
    for (const [r, c] of queens) {
      if (rows.has(r) || cols.has(c) || regSet.has(regs[r][c])) return false;
      rows.add(r); cols.add(c); regSet.add(regs[r][c]);
      for (const [r2, c2] of queens) if (r !== r2 && Math.abs(r - r2) <= 1 && Math.abs(c - c2) <= 1) return false;
    }
    return true;
  }

  // Auto-mark: after placing a queen, mark all conflicting cells with × if setting is on
  function applyAutoMark(b: Mark[][], qr: number, qc: number): Mark[][] {
    if (!queensAutoMark) return b;
    const nb = b.map(row => [...row]) as Mark[][];
    const sz = sizeRef.current, regs = regionsRef.current;
    for (let r = 0; r < sz; r++) {
      for (let c = 0; c < sz; c++) {
        if (nb[r][c] === 'empty') {
          // Same row, col, adjacent diagonal, or same region
          if (r === qr || c === qc || (Math.abs(r - qr) <= 1 && Math.abs(c - qc) <= 1) || regs[r][c] === regs[qr][qc]) {
            nb[r][c] = 'x';
          }
        }
      }
    }
    return nb;
  }

  async function afterMove(nb: Mark[][]) {
    setHintState(null);
    updateState({ board: nb });
    if (checkSolved(nb)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.QUEENS); await showInterstitialIfDue();
    }
  }

  const handleCellTap = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    // Tapping the hinted cell places the queen
    if (hintState && hintState.row === r && hintState.col === c) {
      const nb = gameState.board.map(row => [...row]) as Mark[][];
      nb[r][c] = 'queen';
      lightImpact(); playSound('cell_tap');
      await afterMove(applyAutoMark(nb, r, c));
      return;
    }
    lightImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => [...row]) as Mark[][];
    const cur = nb[r][c];
    if (cur === 'empty') nb[r][c] = 'x';
    else if (cur === 'x') { nb[r][c] = 'queen'; await afterMove(applyAutoMark(nb, r, c)); return; }
    else nb[r][c] = 'empty';
    await afterMove(nb);
  }, [gameState, isPaused, isSolved, lightImpact, hintState, queensAutoMark]);

  const handleUndo = useCallback(() => {
    if (isSolved || isPaused) return;
    setHintState(null);
    undo();
    dragBoardRef.current = null;
  }, [isSolved, isPaused, undo]);

  // PanResponder: fill skipped cells along drag path for smooth continuous marking
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      const dist = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
      return dist > 6 && !isPausedRef.current && !isSolvedRef.current;
    },
    onPanResponderGrant: () => {
      if (isPausedRef.current || isSolvedRef.current) return;
      const currentState = gameStateRef.current;
      if (!currentState) return;
      dragBoardRef.current = currentState.board.map(row => [...row]) as Mark[][];
      draggedCellsRef.current = new Set();
      lastDragPosRef.current = null;
      boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; });
    },
    onPanResponderMove: (e) => {
      if (!dragBoardRef.current || isPausedRef.current || isSolvedRef.current) return;
      const { pageX, pageY } = e.nativeEvent;
      const CELL = cellSizeRef.current;
      const sz = sizeRef.current;
      const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
      const c = Math.floor((pageX - boardOriginRef.current.x) / CELL);
      if (r < 0 || r >= sz || c < 0 || c >= sz) return;

      // Fill all cells between last position and current to avoid gaps
      const last = lastDragPosRef.current;
      const cellsToMark: Array<{ r: number; c: number }> = [];
      if (last) {
        // Bresenham line fill between last and current cell
        let lr = last.r, lc = last.c;
        const dr = Math.sign(r - lr), dc = Math.sign(c - lc);
        while (lr !== r || lc !== c) {
          if (lr !== r) lr += dr;
          if (lc !== c) lc += dc;
          cellsToMark.push({ r: lr, c: lc });
        }
      } else {
        cellsToMark.push({ r, c });
      }
      lastDragPosRef.current = { r, c };

      let changed = false;
      for (const cell of cellsToMark) {
        const key = `${cell.r},${cell.c}`;
        if (!draggedCellsRef.current.has(key)) {
          draggedCellsRef.current.add(key);
          if (dragBoardRef.current[cell.r][cell.c] === 'empty') {
            dragBoardRef.current[cell.r][cell.c] = 'x';
            changed = true;
          }
        }
      }
      if (changed) setDragTick(n => n + 1);
    },
    onPanResponderRelease: () => {
      if (dragBoardRef.current) {
        const finalBoard = dragBoardRef.current.map(row => [...row]) as Mark[][];
        dragBoardRef.current = null;
        draggedCellsRef.current = new Set();
        lastDragPosRef.current = null;
        setDragTick(n => n + 1);
        useGameSessionStore.getState().updateState({ board: finalBoard }, true);
      }
    },
    onPanResponderTerminate: () => { dragBoardRef.current = null; draggedCellsRef.current = new Set(); lastDragPosRef.current = null; setDragTick(n => n + 1); },
  }), []);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint();
    if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution();
    if (!sol) return;

    // Find first unplaced queen — generate a reasoning description
    for (const { row, col } of sol.queenPositions) {
      if (gameState.board[row][col] !== 'queen') {
        const regionId = regions[row][col];
        // Count queens already placed
        const queensPlaced = gameState.board.flat().filter(c => c === 'queen').length;
        // Describe why this cell
        let desc = '';
        if (queensPlaced === 0) {
          desc = `Start by placing a queen in region ${regionId + 1}. Row ${row + 1}, column ${col + 1} is a safe position.`;
        } else {
          // Check what's forcing this cell
          const rowOccupied = new Set<number>();
          const colOccupied = new Set<number>();
          const regOccupied = new Set<number>();
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            if (gameState.board[r][c] === 'queen') { rowOccupied.add(r); colOccupied.add(c); regOccupied.add(regions[r][c]); }
          }
          // Find all empty cells in this region
          const regionCells: Array<{ r: number; c: number }> = [];
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            if (regions[r][c] === regionId && gameState.board[r][c] !== 'queen') {
              const blocked = rowOccupied.has(r) || colOccupied.has(c) ||
                [...rowOccupied].some(qr => [...colOccupied].some(qc => Math.abs(qr - r) <= 1 && Math.abs(qc - c) <= 1));
              if (!blocked) regionCells.push({ r, c });
            }
          }
          if (regionCells.length === 1) {
            desc = `Region ${regionId + 1} has only one valid cell left — row ${row + 1}, column ${col + 1}.`;
          } else {
            desc = `Place a queen at row ${row + 1}, column ${col + 1} in region ${regionId + 1}. It's the only position that doesn't conflict with existing queens.`;
          }
        }
        lightImpact(); playSound('hint');
        setHintState({ row, col, description: desc });
        return;
      }
    }
  }, [gameState, isPaused, loadSolution, useHint, showRewardedAd, lightImpact, size, regions]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!displayBoard || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.QUEENS, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen
        puzzleId={puzzleId} gameType={GameType.QUEENS} gameName="Queens" accentColor="#ec4899"
        isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed}
        hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily}
        shareableResult={shareable}
        onPauseToggle={isPaused ? resumeTimer : pauseTimer}
        onReset={() => setShowResetConfirm(true)}
        onGetHint={handleHint}
        streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty} onNextPuzzle={onNextPuzzle}
        showUndo onUndo={handleUndo}
        scrollable
      >
        <View style={{ alignItems: 'center', paddingTop: 12 }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10 }}>
            Tap: mark × → place queen · Drag to mark ×
          </Text>

          {/* Hint popup */}
          {hintState && (
            <View style={[styles.hintPopup, { backgroundColor: isDark ? '#1f2937' : '#f0f9ff', borderColor: isDark ? '#818cf8' : '#a5b4fc' }]}>
              <Text style={[styles.hintText, { color: t.textPrimary }]}>{hintState.description}</Text>
              <Text style={[styles.hintSub, { color: t.textMuted }]}>Tap the highlighted cell to place the queen</Text>
            </View>
          )}

          <View {...panResponder.panHandlers}>
            <View
              ref={boardRef}
              onLayout={() => boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; })}
            >
              {displayBoard.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((cell, c) => {
                    const regionIdx = regions[r][c] % REGION_COLORS.length;
                    const baseColor = REGION_COLORS[regionIdx];
                    const isHinted = hintState?.row === r && hintState?.col === c;

                    // Region borders — thicker at boundaries, thin within
                    const bTop    = r === 0 || regions[r][c] !== regions[r-1][c] ? 2 : 0.5;
                    const bBottom = r === size-1 || regions[r][c] !== regions[r+1][c] ? 2 : 0.5;
                    const bLeft   = c === 0 || regions[r][c] !== regions[r][c-1] ? 2 : 0.5;
                    const bRight  = c === size-1 || regions[r][c] !== regions[r][c+1] ? 2 : 0.5;
                    const bColor  = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)';

                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => handleCellTap(r, c)}
                        disabled={isPaused}
                        activeOpacity={0.8}
                        style={{
                          width: CELL, height: CELL,
                          backgroundColor: baseColor,
                          alignItems: 'center', justifyContent: 'center',
                          borderTopWidth: bTop, borderBottomWidth: bBottom,
                          borderLeftWidth: bLeft, borderRightWidth: bRight,
                          borderColor: bColor,
                        }}
                      >
                        {isHinted && (
                          <Animated.View style={{
                            position: 'absolute', inset: 0,
                            backgroundColor: 'rgba(99,102,241,0.35)',
                            opacity: blinkAnim,
                          }} />
                        )}
                        {cell === 'queen' && <QueenIcon size={CELL} />}
                        {cell === 'x' && (
                          <Text style={{ fontSize: CELL * 0.46, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)', fontFamily: 'SpaceGrotesk-Bold' }}>×</Text>
                        )}
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
        onConfirm={() => { setShowResetConfirm(false); setHintState(null); dragBoardRef.current = null; updateState(buildInitial()); }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hintPopup: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    marginHorizontal: 16,
    alignSelf: 'stretch',
    gap: 4,
  },
  hintText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 13, lineHeight: 19 },
  hintSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11 },
});