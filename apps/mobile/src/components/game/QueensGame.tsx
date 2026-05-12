import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, PanResponder } from 'react-native';
import { TouchableOpacity } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
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
import HintBox from '../ui/HintBox';
import { useHintHighlight } from '../../hooks/useHintHighlight';
import { useSettingsStore } from '../../stores/settings.store';

const REGION_COLORS = [
  '#818cf8','#f472b6','#fb923c','#34d399','#60a5fa',
  '#f87171','#a78bfa','#2dd4bf','#fbbf24','#86efac',
  '#67e8f9','#e879f9',
];

interface QueensPuzzleData { size: number; regions: number[][] }
type Mark = 'empty' | 'x' | 'queen';
interface QueensState { board: Mark[][] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void; puzzleNumber?: number; difficulty?: string }

function QueenIcon({ size }: { size: number }) {
  const s = size * 0.62;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path d="M2 19h20l-2-9-4 4-4-7-4 7-4-4-2 9z" fill="rgba(0,0,0,0.75)" stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />
      <Path d="M5 19h14v1.5H5z" fill="rgba(0,0,0,0.6)" />
    </Svg>
  );
}

export default function QueensGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, undo, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted, saveDailyResult } = usePuzzleProgressStore();
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
  const [dragTick, setDragTick] = useState(0);
  // hint type stored separately so HintBox subtext can reflect it
  const [hintType, setHintType] = useState<'queen' | 'eliminate'>('queen');

  const { hint, blinkAnim, showHint, dismissHint, isHinted } = useHintHighlight();
  const hintOverlayStyle = useAnimatedStyle(() => ({ opacity: blinkAnim.value }));

  if (!puzzleData) return null;
  const pd = puzzleData as QueensPuzzleData;
  const { size, regions } = pd;
  const CELL = Math.min(Math.floor((width * 0.94) / size), 54);

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
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); if (isDaily) { continueFromSave(); } else { setShowResume(true); } } else startFresh(); }
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

  function applyAutoMark(b: Mark[][], qr: number, qc: number): Mark[][] {
    if (!queensAutoMark) return b;
    const nb = b.map(row => [...row]) as Mark[][];
    const sz = sizeRef.current, regs = regionsRef.current;
    for (let r = 0; r < sz; r++) {
      for (let c = 0; c < sz; c++) {
        if (nb[r][c] === 'empty') {
          if (r === qr || c === qc || (Math.abs(r - qr) <= 1 && Math.abs(c - qc) <= 1) || regs[r][c] === regs[qr][qc]) {
            nb[r][c] = 'x';
          }
        }
      }
    }
    return nb;
  }

  async function afterMove(nb: Mark[][]) {
    dismissHint();
    updateState({ board: nb });
    if (checkSolved(nb)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.QUEENS, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      if (isDaily && dailyPuzzleId) saveDailyResult(dailyPuzzleId, shareable);
      await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.QUEENS); await showInterstitialIfDue();
    }
  }

  const handleCellTap = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    lightImpact(); playSound('cell_tap');

    if (hint) dismissHint();

    const nb = gameState.board.map(row => [...row]) as Mark[][];
    const cur = nb[r][c];

    // If this is a hinted elimination cell, place × directly
    if (hint?.row === r && hint?.col === c && hintType === 'eliminate') {
      nb[r][c] = 'x';
      await afterMove(nb);
      return;
    }

    if (cur === 'empty') nb[r][c] = 'x';
    else if (cur === 'x') { nb[r][c] = 'queen'; await afterMove(applyAutoMark(nb, r, c)); return; }
    else nb[r][c] = 'empty';
    await afterMove(nb);
  }, [gameState, isPaused, isSolved, lightImpact, hint, hintType, dismissHint, queensAutoMark]);

  const handleUndo = useCallback(() => {
    if (isSolved || isPaused) return;
    dismissHint();
    undo();
    dragBoardRef.current = null;
  }, [isSolved, isPaused, undo, dismissHint]);

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
      const last = lastDragPosRef.current;
      const cellsToMark: Array<{ r: number; c: number }> = [];
      if (last) {
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
    // Yield to UI thread before computing
    await new Promise(resolve => setTimeout(resolve, 0));
    const currentGameState = gameState;
    const canUse = useHint();
    if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution();
    if (!sol) return;

    const placedQueens: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (currentGameState.board[r][c] === 'queen') placedQueens.push({ r, c });

    // If board is fully placed but invalid, explain the conflict
    if (placedQueens.length === size && !checkSolved(currentGameState.board)) {
      for (let i = 0; i < placedQueens.length; i++) {
        for (let j = i + 1; j < placedQueens.length; j++) {
          const a = placedQueens[i], b = placedQueens[j];
          if (Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1) {
            lightImpact(); playSound('hint');
            setHintType('queen');
            showHint({ row: b.r, col: b.c, description: `The queens at row ${a.r + 1} col ${a.c + 1} and row ${b.r + 1} col ${b.c + 1} are diagonally or directly adjacent — queens cannot touch. Remove one of them.` });
            return;
          }
          if (a.r === b.r) {
            lightImpact(); playSound('hint');
            setHintType('queen');
            showHint({ row: b.r, col: b.c, description: `Two queens share row ${a.r + 1}. Each row can only have one queen.` });
            return;
          }
          if (a.c === b.c) {
            lightImpact(); playSound('hint');
            setHintType('queen');
            showHint({ row: b.r, col: b.c, description: `Two queens share column ${a.c + 1}. Each column can only have one queen.` });
            return;
          }
          if (regions[a.r][a.c] === regions[b.r][b.c]) {
            lightImpact(); playSound('hint');
            setHintType('queen');
            showHint({ row: b.r, col: b.c, description: `Two queens are in the same region. Each region can only have one queen.` });
            return;
          }
        }
      }
    }

    const placedRows = new Set(placedQueens.map(q => q.r));
    const placedCols = new Set(placedQueens.map(q => q.c));
    const placedRegs = new Set(placedQueens.map(q => regions[q.r][q.c]));

    function validCellsInRegion(regionId: number): Array<{ r: number; c: number }> {
      if (placedRegs.has(regionId)) return [];
      const cells: Array<{ r: number; c: number }> = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (regions[r][c] !== regionId) continue;
          if (currentGameState.board[r][c] === 'queen') continue;
          if (placedRows.has(r) || placedCols.has(c)) continue;
          if (placedQueens.some(q => Math.abs(q.r - r) === 1 && Math.abs(q.c - c) === 1)) continue;
          cells.push({ r, c });
        }
      }
      return cells;
    }

    function validCellsInRow(targetRow: number): number {
      if (placedRows.has(targetRow)) return 0;
      let count = 0;
      for (let c = 0; c < size; c++) {
        if (currentGameState.board[targetRow][c] === 'queen') continue;
        if (placedCols.has(c)) continue;
        if (placedRegs.has(regions[targetRow][c])) continue;
        if (placedQueens.some(q => Math.abs(q.r - targetRow) === 1 && Math.abs(q.c - c) === 1)) continue;
        count++;
      }
      return count;
    }

    function validCellsInCol(targetCol: number): number {
      if (placedCols.has(targetCol)) return 0;
      let count = 0;
      for (let r = 0; r < size; r++) {
        if (currentGameState.board[r][targetCol] === 'queen') continue;
        if (placedRows.has(r)) continue;
        if (placedRegs.has(regions[r][targetCol])) continue;
        if (placedQueens.some(q => Math.abs(q.r - r) === 1 && Math.abs(q.c - targetCol) === 1)) continue;
        count++;
      }
      return count;
    }

    function wouldDeadlock(qr: number, qc: number): boolean {
      const qReg = regions[qr][qc];
      const simQueens = [...placedQueens, { r: qr, c: qc }];
      const simRows = new Set([...placedRows, qr]);
      const simCols = new Set([...placedCols, qc]);
      const simRegs = new Set([...placedRegs, qReg]);

      function simValidInRegion(regionId: number): number {
        if (simRegs.has(regionId)) return Infinity;
        let count = 0;
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (regions[r][c] !== regionId) continue;
            if (r === qr && c === qc) continue;
            if (currentGameState.board[r][c] === 'queen') continue;
            if (simRows.has(r) || simCols.has(c)) continue;
            if (simQueens.some(q => Math.abs(q.r - r) === 1 && Math.abs(q.c - c) === 1)) continue;
            count++;
          }
        }
        return count;
      }

      function simValidInRow(targetRow: number): number {
        if (simRows.has(targetRow)) return Infinity;
        let count = 0;
        for (let c = 0; c < size; c++) {
          if (currentGameState.board[targetRow][c] === 'queen') continue;
          if (simCols.has(c)) continue;
          if (simRegs.has(regions[targetRow][c])) continue;
          if (simQueens.some(q => Math.abs(q.r - targetRow) === 1 && Math.abs(q.c - c) === 1)) continue;
          count++;
        }
        return count;
      }

      function simValidInCol(targetCol: number): number {
        if (simCols.has(targetCol)) return Infinity;
        let count = 0;
        for (let r = 0; r < size; r++) {
          if (currentGameState.board[r][targetCol] === 'queen') continue;
          if (simRows.has(r)) continue;
          if (simRegs.has(regions[r][targetCol])) continue;
          if (simQueens.some(q => Math.abs(q.r - r) === 1 && Math.abs(q.c - targetCol) === 1)) continue;
          count++;
        }
        return count;
      }

      for (let regionId = 0; regionId < size; regionId++) {
        if (simRegs.has(regionId)) continue;
        if (simValidInRegion(regionId) === 0) return true;
      }
      for (let r = 0; r < size; r++) {
        if (simRows.has(r)) continue;
        if (simValidInRow(r) === 0) return true;
      }
      for (let c = 0; c < size; c++) {
        if (simCols.has(c)) continue;
        if (simValidInCol(c) === 0) return true;
      }
      return false;
    }

    // Step 1: score all solution queen candidates by tightest constraint
    const candidates: Array<{
      row: number; col: number; regionId: number;
      regionCount: number; rowCount: number; colCount: number; minCount: number;
    }> = [];

    for (const { row, col } of sol.queenPositions) {
      if (currentGameState.board[row][col] === 'queen') continue;
      if (wouldDeadlock(row, col)) continue;
      const regionId = regions[row][col];
      const regionCount = validCellsInRegion(regionId).length;
      const rowCount = validCellsInRow(row);
      const colCount = validCellsInCol(col);
      const minCount = Math.min(regionCount, rowCount, colCount);
      candidates.push({ row, col, regionId, regionCount, rowCount, colCount, minCount });
    }

    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.minCount - b.minCount);
    const best = candidates[0];

    // Step 2: only suggest deadlock elimination if the best candidate has
    // minCount > 2 — i.e. there's no obviously constrained move, so it's
    // worth telling the player to eliminate a cell first.
    if (best.minCount > 2) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (currentGameState.board[r][c] !== 'empty') continue;
          if (placedRows.has(r) || placedCols.has(c) || placedRegs.has(regions[r][c])) continue;
          const isSolutionCell = sol.queenPositions.some(q => q.row === r && q.col === c);
          if (isSolutionCell) continue;
          if (wouldDeadlock(r, c)) {
            lightImpact(); playSound('hint');
            setHintType('eliminate');
            showHint({
              row: r, col: c,
              description: `Placing a queen at row ${r + 1}, column ${c + 1} would leave another region, row, or column with no valid cells. Mark it × to eliminate it.`,
            });
            return;
          }
        }
      }
    }

    // Step 3: suggest the most constrained queen placement
    const { row, col, regionId, regionCount, rowCount, colCount, minCount } = best;
    let desc: string;
    if (minCount === 1) {
      if (rowCount === 1) {
        desc = `Row ${row + 1} has only one valid cell left for a queen — column ${col + 1}.`;
      } else if (colCount === 1) {
        desc = `Column ${col + 1} has only one valid cell left for a queen — row ${row + 1}.`;
      } else {
        desc = `Region ${regionId + 1} has only one valid cell remaining — row ${row + 1}, column ${col + 1}.`;
      }
    } else if (placedQueens.length === 0) {
      desc = `Start with region ${regionId + 1}. Row ${row + 1}, column ${col + 1} is a valid opening position.`;
    } else if (minCount <= 2) {
      const constraintName = rowCount === minCount ? `row ${row + 1}` : colCount === minCount ? `column ${col + 1}` : `region ${regionId + 1}`;
      desc = `${constraintName.charAt(0).toUpperCase() + constraintName.slice(1)} is highly constrained — only ${minCount} valid cells remain. Try row ${row + 1}, column ${col + 1}.`;
    } else {
      const isOnlyNonDeadlock = candidates.length === 1;
      desc = isOnlyNonDeadlock
        ? `Placing a queen elsewhere in region ${regionId + 1} would leave another region, row, or column with no valid cells. Row ${row + 1}, column ${col + 1} is the only safe choice.`
        : `Region ${regionId + 1} has ${regionCount} possible cells. Row ${row + 1}, column ${col + 1} works without blocking any other region, row, or column.`;
    }

    lightImpact(); playSound('hint');
    setHintType('queen');
    showHint({ row, col, description: desc });
  }, [gameState, isPaused, loadSolution, useHint, showRewardedAd, lightImpact, size, regions, showHint]);

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
                        {isHinted(r, c) && (
                          <Animated.View pointerEvents="none" style={[
                            { position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.5)' },
                            hintOverlayStyle,
                          ]} />
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

          {hint && (
            <HintBox
              description={hint.description}
              subText={hintType === 'eliminate' ? 'Tap the highlighted cell to mark it ×' : 'Tap the highlighted cell to place the queen'}
              onDismiss={dismissHint}
            />
          )}
        </View>
      </GenericGameScreen>

      <ConfirmModal
        visible={showResetConfirm}
        title="Reset board?"
        message="All your marks will be cleared."
        confirmLabel="Reset"
        confirmDanger
        onConfirm={() => { setShowResetConfirm(false); dismissHint(); dragBoardRef.current = null; updateState(buildInitial()); }}
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