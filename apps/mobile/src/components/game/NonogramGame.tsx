import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Modal, PanResponder } from 'react-native';
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

interface NonogramData { size: number; rowClues: number[][]; colClues: number[][] }
type Cell = 'empty' | 'filled' | 'marked';
interface NGState { board: Cell[][] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void }

export default function NonogramGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle }: Props) {
  const { session, startSession, updateState, undo, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
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
  const [solution, setSolution] = useState<{ grid: boolean[][] } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!puzzleData) return null;
  const pd = puzzleData as NonogramData;
  const { size, rowClues, colClues } = pd;
  const CLUE_W = Math.max(28, Math.floor(width * 0.10));
  const CELL = Math.max(24, Math.floor((width * 0.95 - CLUE_W) / size));

  const boardRef = useRef<View>(null);
  const boardOriginRef = useRef({ x: 0, y: 0 });
  const dragBoardRef = useRef<Cell[][] | null>(null);
  const dragModeRef = useRef<'fill' | 'mark' | null>(null);
  const isPausedRef = useRef(false); const isSolvedRef = useRef(false);
  const cellSizeRef = useRef(CELL); const clueWRef = useRef(CLUE_W);
  const lastDragCellRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ r: number; c: number; time: number } | null>(null);
  const DOUBLE_TAP_MS = 280;

  useEffect(() => { cellSizeRef.current = CELL; }, [CELL]);
  useEffect(() => { clueWRef.current = CLUE_W; }, [CLUE_W]);
  useEffect(() => { isPausedRef.current = session?.isPaused ?? false; }, [session?.isPaused]);
  useEffect(() => { isSolvedRef.current = isSolved; }, [isSolved]);

  function buildInitial(): NGState { return { board: Array.from({ length: size }, () => Array(size).fill('empty')) }; }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.NONOGRAM, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.NONOGRAM, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as NGState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: typeof solution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.NONOGRAM, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as NGState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.NONOGRAM, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onError: (_, v) => enqueue({ puzzleId, gameType: GameType.NONOGRAM, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  function computeClues(line: boolean[]): number[] {
    const clues: number[] = []; let count = 0;
    for (const c of line) { if (c) count++; else if (count > 0) { clues.push(count); count = 0; } }
    if (count > 0) clues.push(count);
    return clues.length > 0 ? clues : [0];
  }
  function checkSolved(b: Cell[][]): boolean {
    for (let r = 0; r < size; r++) { if (JSON.stringify(computeClues(b[r].map(x => x === 'filled'))) !== JSON.stringify(rowClues[r])) return false; }
    for (let c = 0; c < size; c++) { if (JSON.stringify(computeClues(b.map(row => row[c] === 'filled'))) !== JSON.stringify(colClues[c])) return false; }
    return true;
  }

  async function triggerWin(b: Cell[][], currentSession: typeof session) {
    if (!currentSession || currentSession.isSolved) return;
    markSolved(); setIsSolved(true); successNotification(); playSound('complete');
    const sol = await loadSolution(); setSolution(sol);
    setTimeout(() => setShowSolution(true), 800);
    const elapsed = currentSession.elapsedSeconds, hints = currentSession.hintsUsed;
    const shareable = generateShareableResult({ gameType: GameType.NONOGRAM, difficulty: currentSession.difficulty, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
    submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
    await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.NONOGRAM); await showInterstitialIfDue();
  }

  const handleCellTap = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    lightImpact(); playSound('cell_tap');
    const now = Date.now(); const last = lastTapRef.current;
    const isDoubleTap = last && last.r === r && last.c === c && (now - last.time) < DOUBLE_TAP_MS;
    lastTapRef.current = { r, c, time: now };
    const nb = gameState.board.map(row => [...row]) as Cell[][];
    if (isDoubleTap) { nb[r][c] = nb[r][c] === 'marked' ? 'empty' : 'marked'; }
    else { nb[r][c] = nb[r][c] === 'filled' ? 'empty' : 'filled'; }
    updateState({ board: nb }, true);
    if (checkSolved(nb)) await triggerWin(nb, session);
  }, [gameState, isPaused, isSolved, lightImpact, session]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.sqrt(g.dx * g.dx + g.dy * g.dy) > 6 && !isPausedRef.current && !isSolvedRef.current,
    onPanResponderGrant: (e) => {
      if (isPausedRef.current || isSolvedRef.current) return;
      const currentBoard = (useGameSessionStore.getState().session?.currentState as NGState | undefined)?.board;
      if (!currentBoard) return;
      dragBoardRef.current = currentBoard.map(row => [...row]) as Cell[][];
      lastDragCellRef.current = null;
      const { pageX, pageY } = e.nativeEvent; const CELL = cellSizeRef.current; const CLUE = clueWRef.current;
      const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
      const c = Math.floor((pageX - boardOriginRef.current.x - CLUE) / CELL);
      const now = Date.now(); const last = lastTapRef.current;
      dragModeRef.current = (last && last.r === r && last.c === c && (now - last.time) < DOUBLE_TAP_MS + 150) ? 'mark' : 'fill';
      boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; });
    },
    onPanResponderMove: (e) => {
      if (!dragBoardRef.current || isPausedRef.current || isSolvedRef.current) return;
      const { pageX, pageY } = e.nativeEvent; const CELL = cellSizeRef.current; const CLUE = clueWRef.current;
      const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
      const c = Math.floor((pageX - boardOriginRef.current.x - CLUE) / CELL);
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      const key = `${r},${c}`; if (lastDragCellRef.current === key) return;
      lastDragCellRef.current = key;
      const mode = dragModeRef.current; if (!mode) return;
      const cur = dragBoardRef.current[r][c];
      if ((mode === 'fill' && cur === 'empty') || (mode === 'mark' && cur === 'empty')) {
        dragBoardRef.current[r][c] = mode === 'fill' ? 'filled' : 'marked';
        useGameSessionStore.getState().updateState({ board: dragBoardRef.current.map(row => [...row]) }, false);
      }
    },
    onPanResponderRelease: () => {
      const finalBoard = dragBoardRef.current;
      dragBoardRef.current = null; dragModeRef.current = null; lastDragCellRef.current = null;
      if (!finalBoard) return;
      useGameSessionStore.getState().updateState({ board: finalBoard }, true);
      if (checkSolved(finalBoard)) {
        const s = useGameSessionStore.getState().session;
        if (s && !s.isSolved) triggerWin(finalBoard, s);
      }
    },
    onPanResponderTerminate: () => { dragBoardRef.current = null; dragModeRef.current = null; lastDragCellRef.current = null; },
  }), [size]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    for (let r = 0; r < size; r++) {
      const rowOk = gameState.board[r].every((c, ci) => (c === 'filled') === sol.grid[r][ci]);
      if (!rowOk) {
        lightImpact(); playSound('hint');
        const nb = gameState.board.map((row, ri) => ri === r ? row.map((_, ci): Cell => sol.grid[r][ci] ? 'filled' : 'marked') : [...row]);
        updateState({ board: nb }, true);
        if (checkSolved(nb)) await triggerWin(nb, session);
        return;
      }
    }
  }, [gameState, isPaused, size, useHint, showRewardedAd, loadSolution, lightImpact, updateState, session]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const shareable = generateShareableResult({ gameType: GameType.NONOGRAM, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const maxClueRows = Math.max(...colClues.map(c => c.length));

  return (
    <>
      <GenericGameScreen
        puzzleId={puzzleId} gameType={GameType.NONOGRAM} gameName="Nonogram" accentColor="#14b8a6"
        isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed}
        hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable}
        onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)}
        onGetHint={handleHint} onNextPuzzle={onNextPuzzle} scrollable
        showUndo onUndo={() => { lightImpact(); undo(); }}
      >
        <View {...panResponder.panHandlers}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
            Tap: fill · Double-tap: × · Drag: fill · Double-tap+drag: ×
          </Text>
          <View style={{ flexDirection: 'row', paddingLeft: CLUE_W }}>
            {colClues.map((clue, c) => (
              <View key={c} style={{ width: CELL, height: maxClueRows * 14, justifyContent: 'flex-end', alignItems: 'center' }}>
                {clue.map((n, i) => <Text key={i} style={{ fontSize: Math.max(8, CELL * 0.28), color: t.textSecondary, fontFamily: 'JetBrainsMono-Regular', lineHeight: 14 }}>{n}</Text>)}
              </View>
            ))}
          </View>
          <View ref={boardRef} onLayout={() => boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; })}>
            {board.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: CLUE_W, alignItems: 'flex-end', paddingRight: 4 }}>
                  <Text style={{ fontSize: Math.max(8, CELL * 0.28), color: t.textSecondary, fontFamily: 'JetBrainsMono-Regular' }}>{rowClues[r].join(' ')}</Text>
                </View>
                {row.map((cell, c) => (
                  <TouchableOpacity key={c} onPress={() => handleCellTap(r, c)} disabled={isPaused}
                    style={{ width: CELL, height: CELL, borderWidth: 0.5, borderColor: isDark ? '#374151' : '#9ca3af', backgroundColor: cell === 'filled' ? (isDark ? '#e5e7eb' : '#111827') : cell === 'marked' ? (isDark ? '#1f2937' : '#f3f4f6') : (isDark ? '#060818' : '#ffffff'), alignItems: 'center', justifyContent: 'center' }}>
                    {cell === 'marked' && <Text style={{ fontSize: CELL * 0.55, color: isDark ? '#6b7280' : '#9ca3af', lineHeight: CELL }}>×</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
      </GenericGameScreen>

      <Modal visible={showSolution} transparent animationType="fade" onRequestClose={() => setShowSolution(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: t.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: t.borderSubtle }}>
            <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, color: t.textPrimary, marginBottom: 4 }}>Puzzle complete! 🎉</Text>
            <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: t.textSecondary, marginBottom: 16 }}>Here's the picture you revealed:</Text>
            <View style={{ borderWidth: 1, borderColor: t.border }}>
              {(solution?.grid ?? []).map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((filled, c) => <View key={c} style={{ width: Math.min(8, Math.floor(160 / size)), height: Math.min(8, Math.floor(160 / size)), backgroundColor: filled ? '#111827' : '#f9fafb' }} />)}
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setShowSolution(false)} style={{ marginTop: 20, backgroundColor: '#14b8a6', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32 }}>
              <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, color: '#fff' }}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ConfirmModal visible={showResetConfirm} title="Reset board?" message="All your filled cells will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}