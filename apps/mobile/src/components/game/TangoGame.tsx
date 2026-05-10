import { useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
import { TangoEngine } from '@puzzle-roll/shared';
import { useState } from 'react';
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

type TangoSymbol = TangoEngine.TangoSymbol;
interface TangoState { board: TangoSymbol[][] }
interface Props {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
  puzzleNumber?: number;
  difficulty?: string;
}

const BLUE_COLOR = '#3b82f6';
const YELLOW_COLOR = '#f59e0b';

function symbolColor(sym: TangoSymbol): string {
  if (sym === 'blue') return BLUE_COLOR;
  if (sym === 'yellow') return YELLOW_COLOR;
  return 'transparent';
}

function symbolName(sym: TangoSymbol): string {
  return sym === 'blue' ? 'Blue' : sym === 'yellow' ? 'Yellow' : '';
}

function normalise(sym: string): TangoSymbol {
  if (sym === 'blue' || sym === 'yellow') return sym;
  if (sym === 'sun') return 'blue';
  if (sym === 'moon') return 'yellow';
  return 'empty';
}

const opp = (sym: TangoSymbol): TangoSymbol => sym === 'blue' ? 'yellow' : 'blue';

export default function TangoGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle, puzzleNumber, difficulty }: Props) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();
  const queryClient = useQueryClient();
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const { loadSolution } = usePuzzleSolution<TangoEngine.TangoSolution>(puzzleId);
  const [isSolved, setIsSolved] = useState(false);
  const [streak, setStreak] = useState<number | undefined>(undefined);
  const [showResume, setShowResume] = useState(false);
  const [savedData, setSavedData] = useState<SavedPuzzleProgress | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { hint, blinkAnim, showHint, dismissHint, isHinted } = useHintHighlight();
  const hintOverlayStyle = useAnimatedStyle(() => ({ opacity: blinkAnim.value }));

  const pd = puzzleData as TangoEngine.TangoPuzzleData;
  const { size, given, constraints } = pd;

  const CELL = Math.max(36, Math.min(Math.floor((width * 0.9) / size), 72));
  const CON_SIZE = Math.max(18, Math.floor(CELL * 0.38));

  const normalisedGiven: TangoSymbol[][] = given.map(row => row.map(normalise));

  function buildInitial(): TangoState {
    return { board: normalisedGiven.map(r => [...r]) };
  }

  useEffect(() => {
    async function init() {
      const s = await loadProgress(puzzleId);
      if (s) {
        const savedBoard = (s.currentState as TangoState | undefined)?.board;
        let compatible = false;
        if (savedBoard) {
          outer: for (let r = 0; r < normalisedGiven.length; r++) {
            for (let c = 0; c < normalisedGiven[r].length; c++) {
              if (normalisedGiven[r][c] !== 'empty') {
                if (savedBoard[r]?.[c] === normalisedGiven[r][c]) { compatible = true; break outer; }
              }
            }
          }
        }
        if (compatible) { setSavedData(s); setShowResume(true); }
        else { await clearProgress(puzzleId); startFresh(); }
      } else { startFresh(); }
    }
    init();
  }, [puzzleId]);

  function startFresh() {
    startSession({ puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 });
    setInitialized(true);
  }

  function continueFromSave() {
    const savedState = savedData?.currentState as TangoState | undefined;
    const board: TangoSymbol[][] = normalisedGiven.map((row, r) =>
      row.map((givenSym, c) => {
        if (givenSym !== 'empty') return givenSym;
        const saved = savedState?.board?.[r]?.[c];
        return saved ? normalise(saved as string) : 'empty';
      })
    );
    startSession({ puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: { board }, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 });
    setInitialized(true);
  }

  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      usePuzzleProgressStore.getState().saveProgress({ puzzleId, gameType: GameType.TANGO, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: useGameSessionStore.getState().getElapsed(), hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);

  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const iv = setInterval(() => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      saveProgress({ puzzleId, gameType: GameType.TANGO, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() });
    }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as TangoState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.TANGO) });
      try {
        const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats');
        const s = stats.find(x => x.gameType === GameType.TANGO);
        if (s) setStreak(s.currentStreak);
      } catch {}
    },
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  async function checkAndFinish(nb: TangoSymbol[][]) {
    const sol = await loadSolution();
    if (!sol) return;
    const normSolGrid = sol.grid.map(row => row.map(s => normalise(s as string)));
    if (TangoEngine.isTangoSolved(nb, size, { grid: normSolGrid })) {
      markSolved(); setIsSolved(true); dismissHint();
      successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed();
      const hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId, isDaily);
      await puzzleCache.markCompleted(puzzleId, GameType.TANGO);
      await showInterstitialIfDue();
    }
  }

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (normalisedGiven[r][c] !== 'empty') return;
    if (hint) dismissHint();
    lightImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => [...row]);
    nb[r][c] = TangoEngine.cycleTangoSymbol(normalise(nb[r][c] as string));
    updateState({ board: nb });
    await checkAndFinish(nb);
  }, [gameState, isPaused, isSolved, normalisedGiven, hint, dismissHint, lightImpact, updateState]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint();
    if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution();
    if (!sol) return;
    // Normalise solution grid in case it was cached with old symbol names
    const solGrid: TangoSymbol[][] = sol.grid.map(row => row.map(s => normalise(s as string)));

    const normBoard = gameState.board.map(row => row.map(c => normalise(c as string)));
    const half = size / 2;

    // Score each empty non-given cell by how many valid symbols it can take.
    // A cell forced to exactly one colour scores 1 — highest priority.
    interface Candidate { row: number; col: number; symbol: TangoSymbol; score: number; desc: string }
    const candidates: Candidate[] = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (normalisedGiven[r][c] !== 'empty') continue;
        if (normBoard[r][c] !== 'empty') continue;

        const target = solGrid[r][c];
        let score = 10; // lower = higher priority
        let desc = '';

        // Reason: constraint forces this cell
        const checks: Array<{ con: TangoEngine.TangoConstraint; nb: TangoSymbol; dir: string }> = [
          { con: constraints.horizontal[`${r},${c-1}`] ?? null, nb: c > 0 ? normBoard[r][c-1] : 'empty', dir: 'to the left' },
          { con: constraints.horizontal[`${r},${c}`] ?? null,   nb: c < size-1 ? normBoard[r][c+1] : 'empty', dir: 'to the right' },
          { con: constraints.vertical[`${r-1},${c}`] ?? null,   nb: r > 0 ? normBoard[r-1][c] : 'empty', dir: 'above' },
          { con: constraints.vertical[`${r},${c}`] ?? null,     nb: r < size-1 ? normBoard[r+1][c] : 'empty', dir: 'below' },
        ];
        for (const { con, nb, dir } of checks) {
          if (!con || nb === 'empty') continue;
          if (con === 'x' && opp(nb) === target) {
            score = 1;
            desc = `This cell is next to a ${symbolName(nb)} ${dir} with a × constraint — it must be ${symbolName(target)}.`;
            break;
          }
          if (con === '=' && nb === target) {
            score = 1;
            desc = `This cell is next to a ${symbolName(nb)} ${dir} with an = constraint — it must also be ${symbolName(target)}.`;
            break;
          }
        }

        if (score > 1) {
          // Reason: 3-in-a-row prevention horizontal
          if (c >= 2 && normBoard[r][c-1] !== 'empty' && normBoard[r][c-1] === normBoard[r][c-2] && opp(normBoard[r][c-1]) === target) {
            score = 2; desc = `Two ${symbolName(normBoard[r][c-1])}s to the left — this cell must be ${symbolName(target)} to avoid 3 in a row.`;
          } else if (c < size-2 && normBoard[r][c+1] !== 'empty' && normBoard[r][c+1] === normBoard[r][c+2] && opp(normBoard[r][c+1]) === target) {
            score = 2; desc = `Two ${symbolName(normBoard[r][c+1])}s to the right — this cell must be ${symbolName(target)} to avoid 3 in a row.`;
          } else if (c >= 1 && c < size-1 && normBoard[r][c-1] !== 'empty' && normBoard[r][c-1] === normBoard[r][c+1] && opp(normBoard[r][c-1]) === target) {
            score = 2; desc = `${symbolName(normBoard[r][c-1])}s on both sides — this cell must be ${symbolName(target)} to avoid 3 in a row.`;
          }
          // Reason: 3-in-a-row prevention vertical
          else if (r >= 2 && normBoard[r-1][c] !== 'empty' && normBoard[r-1][c] === normBoard[r-2][c] && opp(normBoard[r-1][c]) === target) {
            score = 2; desc = `Two ${symbolName(normBoard[r-1][c])}s above — this cell must be ${symbolName(target)} to avoid 3 in a row.`;
          } else if (r < size-2 && normBoard[r+1][c] !== 'empty' && normBoard[r+1][c] === normBoard[r+2][c] && opp(normBoard[r+1][c]) === target) {
            score = 2; desc = `Two ${symbolName(normBoard[r+1][c])}s below — this cell must be ${symbolName(target)} to avoid 3 in a row.`;
          } else if (r >= 1 && r < size-1 && normBoard[r-1][c] !== 'empty' && normBoard[r-1][c] === normBoard[r+1][c] && opp(normBoard[r-1][c]) === target) {
            score = 2; desc = `${symbolName(normBoard[r-1][c])}s above and below — this cell must be ${symbolName(target)} to avoid 3 in a row.`;
          }
        }

        if (score > 2) {
          // Reason: row saturation
          const rowBlues = normBoard[r].filter(v => v === 'blue').length;
          const rowYellows = normBoard[r].filter(v => v === 'yellow').length;
          if (rowBlues >= half && target === 'yellow') {
            score = 3; desc = `Row ${r+1} already has ${half} Blues — all remaining cells must be Yellow.`;
          } else if (rowYellows >= half && target === 'blue') {
            score = 3; desc = `Row ${r+1} already has ${half} Yellows — all remaining cells must be Blue.`;
          }
          // Reason: column saturation
          const colBlues = normBoard.filter(row => row[c] === 'blue').length;
          const colYellows = normBoard.filter(row => row[c] === 'yellow').length;
          if (colBlues >= half && target === 'yellow') {
            score = 3; desc = `Column ${c+1} already has ${half} Blues — all remaining cells must be Yellow.`;
          } else if (colYellows >= half && target === 'blue') {
            score = 3; desc = `Column ${c+1} already has ${half} Yellows — all remaining cells must be Blue.`;
          }
        }

        if (!desc) {
          score = 10;
          desc = `Try placing ${symbolName(target)} here — it's the only colour that satisfies all rules for this cell.`;
        }

        candidates.push({ row: r, col: c, symbol: target, score, desc });
      }
    }

    // Also consider incorrect cells (wrong value placed) — score them at 4
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (normalisedGiven[r][c] !== 'empty') continue;
        if (normBoard[r][c] === 'empty') continue;
        if (normBoard[r][c] !== solGrid[r][c]) {
          candidates.push({
            row: r, col: c, symbol: solGrid[r][c], score: 4,
            desc: `Row ${r+1}, column ${c+1} has the wrong colour. Change it to ${symbolName(solGrid[r][c])}.`,
          });
        }
      }
    }

    if (candidates.length === 0) return;

    // Pick the most constrained (lowest score) candidate
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];

    lightImpact(); playSound('hint');
    showHint({ row: best.row, col: best.col, description: best.desc });
  }, [gameState, isPaused, useHint, showRewardedAd, loadSolution, normalisedGiven, constraints, size, lightImpact, showHint]);

  if (!initialized) return (
    <ResumeModal
      visible={showResume}
      elapsedSeconds={savedData?.elapsedSeconds ?? 0}
      onContinue={() => { setShowResume(false); continueFromSave(); }}
      onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }}
    />
  );
  if (!board || !session) return null;

  const normalisedBoard = board.map(row => row.map(c => normalise(c as string)));
  const conflicts = TangoEngine.validateTangoBoard(normalisedBoard, size, constraints);
  const conflictSet = new Set(conflicts.conflicts.map(({ row, col }) => `${row},${col}`));
  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.TANGO, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  // The hinted cell's target symbol — needed to show the right colour in the blink
  const hintedSymbol: TangoSymbol = hint
    ? (normalisedBoard[hint.row]?.[hint.col] === 'empty'
        ? (conflicts.conflicts.length > 0 ? 'blue' : 'blue') // will be overridden by candidate
        : normalisedBoard[hint.row]?.[hint.col])
    : 'empty';
  // Simpler: store symbol in hint.extra
  const hintSymbol = (hint?.extra as TangoSymbol | undefined) ?? 'blue';

  return (
    <>
      <GenericGameScreen
        puzzleId={puzzleId} gameType={GameType.TANGO} gameName="Tango" accentColor="#f59e0b"
        isSolved={isSolved} elapsedSeconds={session.elapsedSeconds}
        hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining}
        isPaused={isPaused} isDaily={isDaily} shareableResult={shareable}
        onPauseToggle={isPaused ? resumeTimer : pauseTimer}
        onReset={() => setShowResetConfirm(true)}
        onGetHint={handleHint}
        streak={streak} puzzleNumber={puzzleNumber} difficulty={difficulty}
        onNextPuzzle={onNextPuzzle} scrollable
      >
        <View style={{ paddingTop: 16, alignItems: 'center' }}>
          {/* Legend */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: BLUE_COLOR }} />
              <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 }}>Blue</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: YELLOW_COLOR }} />
              <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 }}>Yellow</Text>
            </View>
          </View>

          {/* Grid */}
          {normalisedBoard.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {row.map((sym, c) => {
                const isGiven = normalisedGiven[r][c] !== 'empty';
                const isConflict = conflictSet.has(`${r},${c}`);
                const hCon = constraints.horizontal[`${r},${c}`];
                const vCon = constraints.vertical[`${r},${c}`];

                let cellBg: string;
                if (isConflict) cellBg = isDark ? '#7f1d1d' : '#fee2e2';
                else if (isGiven) cellBg = isDark ? '#1a1f35' : '#dde4f5';
                else cellBg = isDark ? '#111827' : '#ffffff';

                return (
                  <View key={c} style={{ position: 'relative' }}>
                    <TouchableOpacity
                      onPress={() => handleCellPress(r, c)}
                      disabled={isGiven || isPaused}
                      style={[styles.cell, { width: CELL, height: CELL, backgroundColor: cellBg, borderColor: isDark ? '#374151' : '#d1d5db' }]}
                      accessibilityLabel={`Row ${r + 1} col ${c + 1}: ${sym === 'empty' ? 'empty' : symbolName(sym)}`}
                    >
                      {sym !== 'empty' && (
                        <View style={[styles.circle, { backgroundColor: symbolColor(sym) }]} />
                      )}
                    </TouchableOpacity>

                    {/* Hint blink overlay */}
                    {isHinted(r, c) && (
                      <Animated.View pointerEvents="none" style={[
                        { position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.5)', borderRadius: 0 },
                        hintOverlayStyle,
                      ]} />
                    )}

                    {hCon && c < size - 1 && (
                      <View style={[styles.conBadge, { right: -(CON_SIZE / 2 + 1), top: (CELL - CON_SIZE) / 2, width: CON_SIZE, height: CON_SIZE }]}>
                        <Text style={[styles.conText, { color: isDark ? '#9ca3af' : '#6b7280', fontSize: CON_SIZE * 0.72 }]}>
                          {hCon === '=' ? '=' : '×'}
                        </Text>
                      </View>
                    )}

                    {vCon && r < size - 1 && (
                      <View style={[styles.conBadge, { bottom: -(CON_SIZE / 2), left: (CELL - CON_SIZE) / 2, width: CON_SIZE, height: CON_SIZE, zIndex: 10 }]}>
                        <Text style={[styles.conText, { color: isDark ? '#9ca3af' : '#6b7280', fontSize: CON_SIZE * 0.72 }]}>
                          {vCon === '=' ? '=' : '×'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}

          {/* HintBox — below board */}
          {hint && (
            <HintBox
              description={hint.description}
              subText="Tap the highlighted cell to cycle to the correct colour"
              onDismiss={dismissHint}
            />
          )}
        </View>
      </GenericGameScreen>

      <ConfirmModal
        visible={showResetConfirm}
        title="Reset board?"
        message="All your circles will be cleared."
        confirmLabel="Reset"
        confirmDanger
        onConfirm={() => { setShowResetConfirm(false); dismissHint(); updateState(buildInitial()); }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cell: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  circle: { width: '62%', aspectRatio: 1, borderRadius: 999 },
  conBadge: { position: 'absolute', zIndex: 10, alignItems: 'center', justifyContent: 'center' },
  conText: { fontFamily: 'SpaceGrotesk-Bold' },
});