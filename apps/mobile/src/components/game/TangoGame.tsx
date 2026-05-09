import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
import { TangoEngine } from '@puzzle-roll/shared';
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

// Treat any unrecognised cached value (e.g. old 'sun'/'moon') as empty
function normalise(sym: string): TangoSymbol {
  if (sym === 'blue' || sym === 'yellow') return sym;
  return 'empty';
}

interface HintOverlay {
  row: number;
  col: number;
  symbol: TangoSymbol;
  description: string;
}

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
  const [hintOverlay, setHintOverlay] = useState<HintOverlay | null>(null);

  const blinkAnim = useRef(new Animated.Value(1)).current;
  const blinkLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (hintOverlay) {
      blinkAnim.setValue(1);
      blinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.25, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      blinkLoop.current.start();
    } else {
      blinkLoop.current?.stop();
    }
    return () => { blinkLoop.current?.stop(); };
  }, [hintOverlay]);

  const pd = puzzleData as TangoEngine.TangoPuzzleData;
  const { size, given, constraints } = pd;

  const CELL = Math.max(36, Math.min(Math.floor((width * 0.9) / size), 72));
  const CON_SIZE = Math.max(18, Math.floor(CELL * 0.38));

  // Normalise given in case of stale cache with old symbol names
  const normalisedGiven: TangoSymbol[][] = given.map(row => row.map(normalise));

  function buildInitial(): TangoState {
    return { board: normalisedGiven.map(r => [...r]) };
  }

  useEffect(() => {
    async function init() {
      const s = await loadProgress(puzzleId);
      if (s) {
        // Validate saved progress is compatible: check that at least one given cell
        // in the saved board matches the expected symbol from puzzleData.given.
        // If none match, the save is stale (old symbol names) — discard it.
        const savedBoard = (s.currentState as TangoState | undefined)?.board;
        let compatible = false;
        if (savedBoard) {
          outer: for (let r = 0; r < normalisedGiven.length; r++) {
            for (let c = 0; c < normalisedGiven[r].length; c++) {
              if (normalisedGiven[r][c] !== 'empty') {
                if (savedBoard[r]?.[c] === normalisedGiven[r][c]) {
                  compatible = true;
                  break outer;
                }
              }
            }
          }
        }
        if (compatible) {
          setSavedData(s);
          setShowResume(true);
        } else {
          await clearProgress(puzzleId);
          startFresh();
        }
      } else {
        startFresh();
      }
    }
    init();
  }, [puzzleId]);

  function startFresh() {
    startSession({
      puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM,
      isDaily, dailyPuzzleId, initialState: buildInitial(),
      initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3,
    });
    setInitialized(true);
  }

  function continueFromSave() {
    const savedState = savedData?.currentState as TangoState | undefined;
    // Always rebuild given cells from puzzleData — never trust saved values for given positions.
    // Only restore user-placed symbols from saved state for non-given cells.
    // This handles stale cached saves that used old symbol names (e.g. 'sun'/'moon').
    const board: TangoSymbol[][] = normalisedGiven.map((row, r) =>
      row.map((givenSym, c) => {
        if (givenSym !== 'empty') return givenSym; // always use canonical given value
        const saved = savedState?.board?.[r]?.[c];
        return saved ? normalise(saved as string) : 'empty';
      })
    );
    startSession({
      puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM,
      isDaily, dailyPuzzleId, initialState: { board },
      initialElapsedSeconds: savedData?.elapsedSeconds ?? 0,
      initialHintsUsed: savedData?.hintsUsed ?? 0,
      initialHintsRemaining: savedData?.hintsRemaining ?? 3,
    });
    setInitialized(true);
  }

  useEffect(() => {
    return () => {
      const s = useGameSessionStore.getState().session;
      if (!s || s.isSolved) return;
      usePuzzleProgressStore.getState().saveProgress({
        puzzleId, gameType: GameType.TANGO, difficulty: s.difficulty, isDaily, dailyPuzzleId,
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
      saveProgress({
        puzzleId, gameType: GameType.TANGO, difficulty: s.difficulty, isDaily, dailyPuzzleId,
        elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining,
        currentState: s.currentState, savedAt: Date.now(),
      });
    }, 10000);
    return () => clearInterval(iv);
  }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as TangoState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', {
        puzzleId, gameType: GameType.TANGO,
        difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString(),
      }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.daily(GameType.TANGO) });
      try {
        const stats = await apiClient.get<Array<{ gameType: string; currentStreak: number }>>('/users/me/stats');
        const s = stats.find(x => x.gameType === GameType.TANGO);
        if (s) setStreak(s.currentStreak);
      } catch {}
    },
    onError: (_, v) => enqueue({
      puzzleId, gameType: GameType.TANGO,
      difficulty: session?.difficulty ?? Difficulty.MEDIUM,
      isDaily, dailyPuzzleId, ...v, completedAt: '',
    }),
  });

  async function checkAndFinish(nb: TangoSymbol[][]) {
    const sol = await loadSolution();
    if (!sol) return;
    if (TangoEngine.isTangoSolved(nb, size, sol)) {
      markSolved(); setIsSolved(true); setHintOverlay(null);
      successNotification(); playSound('complete');
      const elapsed = useGameSessionStore.getState().getElapsed();
      const hints = useGameSessionStore.getState().session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({
        gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        elapsedSeconds: elapsed, hintsUsed: hints,
        date: new Date().toISOString().slice(0, 10), isDaily,
      });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId, isDaily);
      await puzzleCache.markCompleted(puzzleId, GameType.TANGO);
      await showInterstitialIfDue();
    }
  }

  const handleCellPress = useCallback(async (r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (normalisedGiven[r][c] !== 'empty') return;

    if (hintOverlay && hintOverlay.row === r && hintOverlay.col === c) {
      setHintOverlay(null);
      const nb = gameState.board.map(row => [...row]);
      nb[r][c] = hintOverlay.symbol;
      lightImpact(); playSound('cell_tap');
      updateState({ board: nb });
      await checkAndFinish(nb);
      return;
    }

    setHintOverlay(null);
    lightImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => [...row]);
    nb[r][c] = TangoEngine.cycleTangoSymbol(normalise(nb[r][c] as string));
    updateState({ board: nb });
    await checkAndFinish(nb);
  }, [gameState, isPaused, isSolved, normalisedGiven, hintOverlay, lightImpact, updateState]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint();
    if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution();
    if (!sol) return;
    const normalState: TangoState = { board: gameState.board.map(row => row.map(c => normalise(c as string))) };
    const hint = TangoEngine.getHint(normalState, sol, normalisedGiven, constraints);
    if (!hint) return;
    lightImpact(); playSound('hint');
    setHintOverlay({
      row: hint.position.row, col: hint.position.col,
      symbol: hint.symbol, description: hint.description,
    });
  }, [gameState, isPaused, useHint, showRewardedAd, loadSolution, normalisedGiven, constraints, lightImpact]);

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
  const shareable = generateShareableResult({
    gameType: GameType.TANGO, difficulty: session.difficulty,
    elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed,
    date: new Date().toISOString().slice(0, 10), isDaily,
  });

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
                const isHinted = hintOverlay?.row === r && hintOverlay?.col === c;
                const hCon = constraints.horizontal[`${r},${c}`];
                const vCon = constraints.vertical[`${r},${c}`];

                let cellBg: string;
                if (isConflict) {
                  cellBg = isDark ? '#7f1d1d' : '#fee2e2';
                } else if (isGiven) {
                  cellBg = isDark ? '#1a1f35' : '#dde4f5';
                } else {
                  cellBg = isDark ? '#111827' : '#ffffff';
                }

                return (
                  <View key={c} style={{ position: 'relative' }}>
                    <TouchableOpacity
                      onPress={() => handleCellPress(r, c)}
                      disabled={isGiven || isPaused}
                      style={[styles.cell, {
                        width: CELL, height: CELL,
                        backgroundColor: cellBg,
                        borderColor: isDark ? '#374151' : '#d1d5db',
                      }]}
                      accessibilityLabel={`Row ${r + 1} col ${c + 1}: ${sym === 'empty' ? 'empty' : symbolName(sym)}`}
                    >
                      {/* Existing symbol — hidden on hinted cell so blink animation shows cleanly */}
                      {sym !== 'empty' && !isHinted && (
                        <View style={[styles.circle, { backgroundColor: symbolColor(sym) }]} />
                      )}
                      {/* Hint blink */}
                      {isHinted && (
                        <Animated.View style={[styles.circle, {
                          backgroundColor: symbolColor(hintOverlay!.symbol),
                          opacity: blinkAnim,
                        }]} />
                      )}
                    </TouchableOpacity>

                    {/* Horizontal constraint — no background, symbol only */}
                    {hCon && c < size - 1 && (
                      <View style={[styles.conBadge, {
                        right: -(CON_SIZE / 2 + 1),
                        top: (CELL - CON_SIZE) / 2,
                        width: CON_SIZE,
                        height: CON_SIZE,
                      }]}>
                        <Text style={[styles.conText, {
                          color: isDark ? '#9ca3af' : '#6b7280',
                          fontSize: CON_SIZE * 0.72,
                        }]}>
                          {hCon === '=' ? '=' : '×'}
                        </Text>
                      </View>
                    )}

                    {/* Vertical constraint — no background, symbol only */}
                    {vCon && r < size - 1 && (
                      <View style={[styles.conBadge, {
                        bottom: -(CON_SIZE / 2 + 1),
                        left: (CELL - CON_SIZE) / 2,
                        width: CON_SIZE,
                        height: CON_SIZE,
                        zIndex: 10,
                      }]}>
                        <Text style={[styles.conText, {
                          color: isDark ? '#9ca3af' : '#6b7280',
                          fontSize: CON_SIZE * 0.72,
                        }]}>
                          {vCon === '=' ? '=' : '×'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}

          {/* Hint popup — below the board, full width, no truncation */}
          {hintOverlay && (
            <View style={[styles.hintPopup, {
              backgroundColor: isDark ? '#1f2937' : '#f0f9ff',
              borderColor: isDark ? '#3b82f6' : '#93c5fd',
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 3, backgroundColor: symbolColor(hintOverlay.symbol), flexShrink: 0 }} />
                <Text style={[styles.hintText, { color: t.textPrimary }]}>
                  {hintOverlay.description}
                </Text>
              </View>
              <Text style={[styles.hintSub, { color: t.textMuted }]}>
                Tap the highlighted cell to apply
              </Text>
            </View>
          )}
        </View>
      </GenericGameScreen>

      <ConfirmModal
        visible={showResetConfirm}
        title="Reset board?"
        message="All your circles will be cleared."
        confirmLabel="Reset"
        confirmDanger
        onConfirm={() => { setShowResetConfirm(false); setHintOverlay(null); updateState(buildInitial()); }}
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
  hintPopup: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginHorizontal: 16,
    alignSelf: 'stretch',
    gap: 6,
  },
  hintText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  hintSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11 },
});