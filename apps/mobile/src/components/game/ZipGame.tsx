import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, PanResponder } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
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

const WAYPOINT_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];
const PATH_COLOR = '#f59e0b';

interface ZipCell { number: number | null }
interface ZipPuzzleData { size: number; grid: ZipCell[][] }
type PathPt = { row: number; col: number };
interface ZipState { path: PathPt[] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null; onNextPuzzle?: () => void; puzzleNumber?: number; difficulty?: string }

export default function ZipGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const queryClient = useQueryClient();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const [isSolved, setIsSolved] = useState(false);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [solution, setSolution] = useState<{ path: PathPt[] } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pd = puzzleData as ZipPuzzleData;
  const { size, grid } = pd;
  const CELL = Math.min(Math.floor((width * 0.92) / size), 60);

  const maxWaypoint = useMemo(
    () => grid.flat().reduce((m, c) => Math.max(m, c.number ?? 0), 0),
    [grid]
  );

  // ── Refs for PanResponder ────────────────────────────────────────────────────
  const boardOriginRef = useRef({ x: 0, y: 0 });
  const boardRef = useRef<View>(null);
  const pathRef = useRef<PathPt[]>([]);          // live path during gesture
  const isPausedRef = useRef(false);
  const isSolvedRef = useRef(false);
  const cellSizeRef = useRef(CELL);

  useEffect(() => { cellSizeRef.current = CELL; }, [CELL]);
  useEffect(() => { isPausedRef.current = session?.isPaused ?? false; }, [session?.isPaused]);
  useEffect(() => { isSolvedRef.current = isSolved; }, [isSolved]);
  // Keep pathRef in sync with store (for hint integration)
  const gameState = session?.currentState as ZipState | undefined;
  const path = gameState?.path ?? [];
  useEffect(() => { pathRef.current = path; }, [path]);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
  }

  function buildInitial(): ZipState { return { path: [] }; }

  useEffect(() => {
    async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); }
    init();
  }, [puzzleId]);

  function startFresh() { startSession({ puzzleId, gameType: GameType.ZIP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.ZIP, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as ZipState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: typeof solution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);


  // Save progress on unmount (covers back-navigation)
  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      usePuzzleProgressStore.getState().saveProgress({
        puzzleId, gameType: GameType.ZIP, difficulty: s.difficulty, isDaily, dailyPuzzleId,
        elapsedSeconds: useGameSessionStore.getState().getElapsed(),
        hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining,
        currentState: s.currentState, savedAt: Date.now(),
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);
  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.ZIP, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const isPaused = session?.isPaused ?? false;
  const pathSet = new Set(path.map(p => `${p.row},${p.col}`));

  const { mutate: submit } = useMutation({ mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) => apiClient.post('/progress/complete', { puzzleId, gameType: GameType.ZIP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }), onSuccess: async () => { queryClient.invalidateQueries({ queryKey: queryKeys.user.stats }); queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.ZIP) }); try { const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats'); const s = stats.find(x => x.gameType === GameType.ZIP); if (s) setStreak(s.currentStreak); } catch {} }, onError: (_, v) => enqueue({ puzzleId, gameType: GameType.ZIP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }) });

  function isAdjacent(a: PathPt, b: PathPt) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1; }

  /**
   * Pure synchronous path extension. Returns { newPath, blocked }.
   * Called directly inside PanResponder — must NOT be async.
   */
  function tryExtendSync(r: number, c: number, current: PathPt[]): { newPath: PathPt[]; blocked: boolean } {
    if (r < 0 || r >= size || c < 0 || c >= size) return { newPath: current, blocked: false };

    const nextCellNum = grid[r][c].number;

    // Trying to reach final waypoint without filling all cells
    if (nextCellNum === maxWaypoint && current.length < size * size - 1) {
      return { newPath: current, blocked: true };
    }

    const alreadyIdx = current.findIndex(p => p.row === r && p.col === c);
    if (alreadyIdx !== -1) {
      // Backtrack: trim to this point
      return { newPath: current.slice(0, alreadyIdx + 1), blocked: false };
    }

    if (current.length > 0 && !isAdjacent(current[current.length - 1], { row: r, col: c })) {
      return { newPath: current, blocked: false };
    }

    // Enforce waypoint ordering
    if (nextCellNum !== null) {
      const lastNum = current.reduce((m, p) => Math.max(m, grid[p.row][p.col].number ?? 0), 0);
      if (nextCellNum !== lastNum + 1) return { newPath: current, blocked: false };
    }

    return { newPath: [...current, { row: r, col: c }], blocked: false };
  }

  /** Commit path to store and check win. Async OK here — called from event handlers outside PanResponder. */
  async function commitPath(newPath: PathPt[]) {
    updateState({ path: newPath }, false);
    if (newPath.length === size * size) {
      let ok = true; let last = 0;
      for (const p of newPath) { const n = grid[p.row][p.col].number; if (n !== null) { if (n !== last + 1) { ok = false; break; } last = n; } }
      if (ok) {
        markSolved(); setIsSolved(true); successNotification(); playSound('complete');
        const elapsed = useGameSessionStore.getState().getElapsed(), hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
        const shareable = generateShareableResult({ gameType: GameType.ZIP, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
        submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
        await markCompleted(puzzleId, isDaily); await puzzleCache.markCompleted(puzzleId, GameType.ZIP); await showInterstitialIfDue();
      }
    }
  }

  // PanResponder: fully synchronous handlers, all state via refs
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (e) => {
      if (isPausedRef.current || isSolvedRef.current) return;
      boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; });
      const CELL = cellSizeRef.current;
      const { pageX, pageY } = e.nativeEvent;
      const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
      const c = Math.floor((pageX - boardOriginRef.current.x) / CELL);
      const { newPath, blocked } = tryExtendSync(r, c, pathRef.current);
      if (blocked) return;
      if (newPath !== pathRef.current) {
        pathRef.current = newPath;
        useGameSessionStore.getState().updateState({ path: newPath }, false);
        lightImpact();
      }
    },

    onPanResponderMove: (e) => {
      if (isPausedRef.current || isSolvedRef.current) return;
      const CELL = cellSizeRef.current;
      const { pageX, pageY } = e.nativeEvent;
      const r = Math.floor((pageY - boardOriginRef.current.y) / CELL);
      const c = Math.floor((pageX - boardOriginRef.current.x) / CELL);
      const prev = pathRef.current;
      const { newPath, blocked } = tryExtendSync(r, c, prev);
      if (blocked) {
        // Can't call setState here (sync), schedule toast via ref
        setToastMsg('Fill all cells before reaching the final number!');
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
        return;
      }
      if (newPath.length !== prev.length) {
        pathRef.current = newPath;
        useGameSessionStore.getState().updateState({ path: newPath }, false);
      }
    },

    onPanResponderRelease: () => {
      const finalPath = pathRef.current;
      // commitPath is async (win check) — safe to call outside PanResponder after release
      commitPath(finalPath);
    },
  }), []); // created once — all live state via refs

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const sol = await loadSolution();
    if (!sol || sol.path.length === 0) return;

    // Find the longest prefix of the current path matching the solution.
    // This handles off-track paths: trim to the common prefix, then step forward.
    let commonLen = 0;
    for (let i = 0; i < Math.min(path.length, sol.path.length); i++) {
      if (path[i].row === sol.path[i].row && path[i].col === sol.path[i].col) {
        commonLen = i + 1;
      } else {
        break;
      }
    }

    if (commonLen >= sol.path.length) return; // already on complete correct path

    // Consume hint AFTER confirming there is something to do
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }

    lightImpact(); playSound('hint');

    // Trim to common prefix then add next correct cell
    const stepped = [...sol.path.slice(0, commonLen), sol.path[commonLen]];
    pathRef.current = stepped;
    await commitPath(stepped);
  }, [gameState, isPaused, path, useHint, showRewardedAd, loadSolution, lightImpact]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!gameState || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.ZIP, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const boardPx = size * CELL;

  // Build SVG polyline points from path
  const svgPoints = path
    .map(p => `${p.col * CELL + CELL / 2},${p.row * CELL + CELL / 2}`)
    .join(' ');

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.ZIP} gameName="Zip" accentColor="#f59e0b" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty} onNextPuzzle={onNextPuzzle}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 6, textAlign: 'center' }}>
            Drag your finger to draw the path through 1 → 2 → 3…
          </Text>

          {/* Inline toast — non-blocking */}
          {toastMsg ? (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toastMsg}</Text>
            </View>
          ) : (
            <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 6 }}>
              {path.length}/{size * size} cells
            </Text>
          )}

          {/* panHandlers on outer wrapper, NOT on the grid View */}
          <View {...panResponder.panHandlers}>
            <View
              ref={boardRef}
              onLayout={() => boardRef.current?.measure((_x, _y, _w, _h, px, py) => { boardOriginRef.current = { x: px, y: py }; })}
              style={{ width: boardPx, height: boardPx }}
            >
              {/* SVG polyline drawn over cells */}
              {path.length >= 2 && (
                <Svg
                  style={StyleSheet.absoluteFill}
                  width={boardPx}
                  height={boardPx}
                  pointerEvents="none"
                >
                  <Polyline
                    points={svgPoints}
                    fill="none"
                    stroke={PATH_COLOR}
                    strokeWidth={16}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              )}
              
              {/* Cell grid */}
              {grid.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((cell, c) => {
                    const inPath = pathSet.has(`${r},${c}`);
                    const waypointColor = cell.number !== null ? WAYPOINT_COLORS[(cell.number - 1) % WAYPOINT_COLORS.length] : null;
                    return (
                      <View
                        key={c}
                        style={[styles.cell, {
                          width: CELL, height: CELL,
                          borderColor: isDark ? '#1f2937' : '#d1d5db',
                          backgroundColor: inPath
                            ? (isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)')
                            : (isDark ? '#111827' : '#f9fafb'),
                        }]}
                      >
                        {cell.number !== null && (
                          <View style={[styles.waypointCircle, { backgroundColor: waypointColor! }]}>
                            <Text style={styles.waypointNum}>{cell.number}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </GenericGameScreen>

      <ConfirmModal visible={showResetConfirm} title="Reset path?" message="Your drawn path will be cleared." confirmLabel="Reset" confirmDanger onConfirm={() => { setShowResetConfirm(false); pathRef.current = []; updateState(buildInitial()); }} onCancel={() => setShowResetConfirm(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  cell: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waypointCircle: { width: '70%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  waypointNum: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 14, color: '#ffffff' },
  toast: {
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5, marginBottom: 6,
  },
  toastText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, color: '#fff', textAlign: 'center' },
});