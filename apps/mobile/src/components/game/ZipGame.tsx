import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, PanResponder } from 'react-native';
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

// Waypoint circle colors (one per waypoint number)
const WAYPOINT_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];

interface ZipCell { number: number | null }
interface ZipPuzzleData { size: number; grid: ZipCell[][] }
interface ZipState { path: { row: number; col: number }[] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null }

export default function ZipGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: Props) {
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
  const [solution, setSolution] = useState<{ path: { row: number; col: number }[] } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const pd = puzzleData as ZipPuzzleData;
  const { size, grid } = pd;
  const CELL = Math.min(Math.floor((width * 0.92) / size), 60);
  const boardOriginRef = useRef({ x: 0, y: 0 });
  const boardRef = useRef<View>(null);

  // Find the maximum waypoint number on the board
  const maxWaypoint = grid.flat().reduce((max, cell) => Math.max(max, cell.number ?? 0), 0);

  function buildInitial(): ZipState { return { path: [] }; }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.ZIP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.ZIP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as ZipState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: typeof solution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.ZIP, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as ZipState | undefined;
  const path = gameState?.path ?? [];
  const isPaused = session?.isPaused ?? false;
  const pathSet = new Set(path.map(p => `${p.row},${p.col}`));

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.ZIP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onError: (_, v) => enqueue({ puzzleId, gameType: GameType.ZIP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  function isAdjacent(a: { row: number; col: number }, b: { row: number; col: number }) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1; }

  async function tryExtendPath(r: number, c: number, currentPath: { row: number; col: number }[]) {
    if (r < 0 || r >= size || c < 0 || c >= size) return currentPath;
    if (!gameState || isPaused || isSolved) return currentPath;

    // Check if we've reached the max waypoint — must have filled all cells first
    const lastCell = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
    const nextCellNum = grid[r][c].number;
    if (nextCellNum === maxWaypoint && currentPath.length < size * size - 1) return currentPath;

    const alreadyIdx = currentPath.findIndex(p => p.row === r && p.col === c);
    if (alreadyIdx !== -1) {
      // Trim back to this point
      return currentPath.slice(0, alreadyIdx + 1);
    }

    if (currentPath.length > 0 && !isAdjacent(currentPath[currentPath.length - 1], { row: r, col: c })) return currentPath;

    // Check waypoint ordering
    if (nextCellNum !== null) {
      const lastNum = currentPath.reduce((m, p) => Math.max(m, grid[p.row][p.col].number ?? 0), 0);
      if (nextCellNum !== lastNum + 1) return currentPath;
    }

    return [...currentPath, { row: r, col: c }];
  }

  async function commitPath(newPath: { row: number; col: number }[]) {
    updateState({ path: newPath }, false);
    if (newPath.length === size * size) {
      let ok = true; let last = 0;
      for (const p of newPath) { const n = grid[p.row][p.col].number; if (n !== null) { if (n !== last + 1) { ok = false; break; } last = n; } }
      if (ok) {
        markSolved(); setIsSolved(true); successNotification(); playSound('complete');
        const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
        const shareable = generateShareableResult({ gameType: GameType.ZIP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
        submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
        await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.ZIP); await showInterstitialIfDue();
      }
    }
  }

  const pathRef = useRef(path);
  pathRef.current = path;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: async (e) => {
        if (isPaused || isSolved) return;
        const { pageX, pageY } = e.nativeEvent;
        const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
        const c = Math.floor((pageX - boardOriginRef.current.x) / CELL);
        const newPath = await tryExtendPath(r, c, pathRef.current);
        if (newPath !== pathRef.current) { pathRef.current = newPath; await commitPath(newPath); lightImpact(); }
      },
      onPanResponderMove: async (e) => {
        if (isPaused || isSolved) return;
        const { pageX, pageY } = e.nativeEvent;
        const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
        const c = Math.floor((pageX - boardOriginRef.current.x) / CELL);
        const newPath = await tryExtendPath(r, c, pathRef.current);
        if (newPath.length !== pathRef.current.length) { pathRef.current = newPath; await commitPath(newPath); playSound('cell_tap'); }
      },
    })
  ).current;

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    const nextIdx = path.length; if (nextIdx >= sol.path.length) return;
    const next = sol.path[nextIdx]; lightImpact(); playSound('hint');
    const newPath = await tryExtendPath(next.row, next.col, path);
    await commitPath(newPath);
  }, [gameState, isPaused, path, useHint, showRewardedAd, loadSolution, lightImpact]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!gameState || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.ZIP, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.ZIP} gameName="Zip" accentColor="#f59e0b" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
            Drag your finger to draw the path through 1 → 2 → 3…
          </Text>
          <View
            ref={boardRef}
            onLayout={() => boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; })}
            {...panResponder.panHandlers}
          >
            {grid.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((cell, c) => {
                  const key = `${r},${c}`;
                  const inPath = pathSet.has(key);
                  const pathIdx = path.findIndex(p => p.row === r && p.col === c);
                  const isHead = pathIdx === path.length - 1 && path.length > 0;
                  const waypointColor = cell.number !== null ? WAYPOINT_COLORS[(cell.number - 1) % WAYPOINT_COLORS.length] : null;
                  return (
                    <View
                      key={c}
                      style={[styles.cell, {
                        width: CELL, height: CELL,
                        borderColor: isDark ? '#1f2937' : '#d1d5db',
                        backgroundColor: isHead ? '#f59e0b' : inPath ? '#f59e0b44' : (isDark ? '#111827' : '#f9fafb'),
                      }]}
                    >
                      {cell.number !== null ? (
                        // Waypoint: coloured circle with number
                        <View style={[styles.waypointCircle, { backgroundColor: waypointColor! }]}>
                          <Text style={styles.waypointNum}>{cell.number}</Text>
                        </View>
                      ) : inPath ? (
                        <View style={[styles.pathDot, { backgroundColor: isHead ? '#fff' : '#f59e0b' }]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
            {path.length}/{size * size} cells
          </Text>
        </View>
      </GenericGameScreen>
      <ConfirmModal visible={showResetConfirm} title="Reset path?" message="Your drawn path will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  cell: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waypointCircle: { width: '72%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  waypointNum: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 14, color: '#ffffff' },
  pathDot: { width: 10, height: 10, borderRadius: 5 },
});