import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import {
  GameType, Difficulty, TangoSymbol, TangoConstraint, TangoPuzzleData, TangoSolution,
  isTangoSolved, validateTangoBoard, getHint, cycleTangoSymbol,
} from '@puzzle-roll/shared';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useHaptics } from '../../hooks/useHaptics';
import { useAdMob } from '../../hooks/useAdMob';
import { usePuzzleProgressStore } from '../../stores/puzzle-progress.store';
import { useOfflineQueueStore } from '../../stores/offline-queue.store';
import { apiClient } from '../../lib/api-client';
import { puzzleCache } from '../../services/puzzle-cache.service';
import { generateShareableResult } from '../../lib/shareable-result';
import { playSound } from '../../services/sound.service';
import GenericGameScreen from './GenericGameScreen';
import ResumeModal from './ResumeModal';

interface TangoGameProps {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
}

interface TangoGameState {
  board: TangoSymbol[][];
}

const SYMBOL_DISPLAY: Record<TangoSymbol, string> = {
  sun: '☀️', moon: '🌙', empty: '',
};

const CONSTRAINT_DISPLAY: Record<NonNullable<TangoConstraint>, string> = {
  '=': '=', 'x': '✕',
};

export default function TangoGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: TangoGameProps) {
  const { session, startSession, updateState, markSolved, pauseTimer, resumeTimer, useHint } = useGameSessionStore();
  const { lightImpact, successNotification } = useHaptics();
  const { showInterstitialIfDue, showRewardedAd } = useAdMob();
  const { saveProgress, loadProgress, clearProgress, markCompleted } = usePuzzleProgressStore();
  const { enqueue } = useOfflineQueueStore();

  const [initialized, setInitialized] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedProgress, setSavedProgress] = useState<unknown>(null);
  const [isSolved, setIsSolved] = useState(false);

  const pd = puzzleData as TangoPuzzleData;
  const { size, given, constraints } = pd;

  function buildInitialBoard(): TangoSymbol[][] {
    return given.map(row => [...row]);
  }

  useEffect(() => {
    async function init() {
      const saved = await loadProgress(puzzleId);
      if (saved) { setSavedProgress(saved); setShowResume(true); }
      else startFresh();
    }
    init();
  }, [puzzleId]);

  function startFresh() {
    startSession({
      puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM,
      isDaily, dailyPuzzleId,
      initialState: { board: buildInitialBoard() } satisfies TangoGameState,
    });
    setInitialized(true);
  }

  function continueFromSave() {
    const saved = savedProgress as { currentState: TangoGameState; elapsedSeconds: number } | null;
    startSession({
      puzzleId, gameType: GameType.TANGO, difficulty: Difficulty.MEDIUM,
      isDaily, dailyPuzzleId,
      initialState: saved?.currentState ?? { board: buildInitialBoard() },
    });
    setInitialized(true);
  }

  const gameState = session?.currentState as TangoGameState | undefined;
  const board = gameState?.board;
  const isPaused = session?.isPaused ?? false;

  const { mutate: submitCompletion } = useMutation({
    mutationFn: (payload: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', {
        puzzleId, gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily, dailyPuzzleId, ...payload, completedAt: new Date().toISOString(),
      }),
    onError: (_, variables) => {
      enqueue({ puzzleId, gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
        isDaily, dailyPuzzleId, ...variables, completedAt: '' });
    },
  });

  // Auto-save every 10s
  useEffect(() => {
    if (!initialized || !session || session.isSolved) return;
    const interval = setInterval(() => {
      if (session && !session.isSolved) {
        saveProgress({ puzzleId, gameType: GameType.TANGO, difficulty: session.difficulty,
          isDaily, dailyPuzzleId, elapsedSeconds: session.elapsedSeconds,
          hintsUsed: session.hintsUsed, hintsRemaining: session.hintsRemaining,
          currentState: session.currentState, savedAt: Date.now() });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [initialized, session?.elapsedSeconds, session?.isSolved]);

  const handleCellPress = useCallback((r: number, c: number) => {
    if (!gameState || isPaused || isSolved) return;
    if (given[r][c] !== 'empty') return; // can't change given cells
    lightImpact();
    playSound('cell_tap');
    const newBoard = gameState.board.map(row => [...row]);
    newBoard[r][c] = cycleTangoSymbol(newBoard[r][c]);
    const newState: TangoGameState = { board: newBoard };
    updateState(newState);

    if (isTangoSolved(newBoard, size, (puzzleData as TangoPuzzleData & { solution: TangoSolution }).solution)) {
      handleSolved(newState);
    }
  }, [gameState, isPaused, isSolved, given, lightImpact, updateState]);

  async function handleSolved(state: TangoGameState) {
    markSolved();
    setIsSolved(true);
    successNotification();
    playSound('complete');
    const elapsed = session?.elapsedSeconds ?? 0;
    const hints = session?.hintsUsed ?? 0;
    const shareable = generateShareableResult({
      gameType: GameType.TANGO, difficulty: session?.difficulty ?? Difficulty.MEDIUM,
      elapsedSeconds: elapsed, hintsUsed: hints,
      date: new Date().toISOString().slice(0, 10), isDaily,
    });
    submitCompletion({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
    await markCompleted(puzzleId);
    await puzzleCache.markCompleted(puzzleId, GameType.TANGO);
    await showInterstitialIfDue();
  }

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint();
    if (!canUse) {
      const granted = await showRewardedAd();
      if (!granted) return;
    }
    const pd2 = puzzleData as TangoPuzzleData & { solution: TangoSolution };
    const hint = getHint(gameState, pd2.solution, given);
    if (!hint) return;
    lightImpact();
    playSound('hint');
    updateState(hint.revealedState as TangoGameState);
  }, [gameState, isPaused, puzzleData, given, useHint, showRewardedAd, lightImpact, updateState]);

  const handleReset = useCallback(() => {
    if (!gameState) return;
    updateState({ board: buildInitialBoard() });
  }, [gameState, updateState]);

  if (!initialized) {
    return (
      <ResumeModal
        visible={showResume}
        elapsedSeconds={(savedProgress as { elapsedSeconds?: number })?.elapsedSeconds ?? 0}
        onContinue={() => { setShowResume(false); continueFromSave(); }}
        onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }}
      />
    );
  }

  if (!board || !session) return null;

  const conflicts = validateTangoBoard(board, size, constraints);
  const conflictSet = new Set(conflicts.conflicts.map(({ row, col }) => `${row},${col}`));
  const CELL = Math.min(320 / size, 52);

  const shareable = generateShareableResult({
    gameType: GameType.TANGO, difficulty: session.difficulty,
    elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed,
    date: new Date().toISOString().slice(0, 10), isDaily,
  });

  return (
    <GenericGameScreen
      puzzleId={puzzleId} gameType={GameType.TANGO} gameName="Tango"
      accentColor="#f97316" isSolved={isSolved}
      elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed}
      hintsRemaining={session.hintsRemaining} isPaused={isPaused}
      isDaily={isDaily} shareableResult={shareable}
      onPauseToggle={isPaused ? resumeTimer : pauseTimer}
      onReset={handleReset} onGetHint={handleHint}
    >
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.instruction}>Tap cells to cycle ☀️ ↔ 🌙</Text>
        {/* Grid */}
        {board.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((sym, c) => {
              const isGiven = given[r][c] !== 'empty';
              const isConflict = conflictSet.has(`${r},${c}`);
              const hCon = constraints.horizontal[`${r},${c}`];
              const vCon = constraints.vertical[`${r},${c}`];
              return (
                <View key={c} style={{ position: 'relative' }}>
                  <TouchableOpacity
                    onPress={() => handleCellPress(r, c)}
                    style={[
                      styles.cell,
                      { width: CELL, height: CELL,
                        backgroundColor: isConflict ? '#7f1d1d' : isGiven ? '#1a1f35' : '#111827',
                        borderColor: '#374151',
                      },
                    ]}
                    disabled={isGiven || isPaused}
                    accessibilityLabel={`Row ${r + 1} col ${c + 1}: ${sym === 'empty' ? 'empty' : sym}`}
                  >
                    <Text style={[styles.symText, { fontSize: CELL * 0.45 }]}>
                      {sym !== 'empty' ? SYMBOL_DISPLAY[sym] : ''}
                    </Text>
                  </TouchableOpacity>
                  {/* Horizontal constraint (right edge) */}
                  {hCon && c < size - 1 && (
                    <View style={[styles.hConstraint, { right: -(CELL * 0.2), top: (CELL - 18) / 2 }]}>
                      <Text style={styles.constraintText}>{CONSTRAINT_DISPLAY[hCon]}</Text>
                    </View>
                  )}
                  {/* Vertical constraint (bottom edge) */}
                  {vCon && r < size - 1 && (
                    <View style={[styles.vConstraint, { bottom: -(CELL * 0.2), left: (CELL - 18) / 2 }]}>
                      <Text style={styles.constraintText}>{CONSTRAINT_DISPLAY[vCon]}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </GenericGameScreen>
  );
}

const styles = StyleSheet.create({
  instruction: { color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, marginBottom: 12 },
  cell: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  symText: { textAlign: 'center' },
  hConstraint: {
    position: 'absolute', zIndex: 10, width: 18, height: 18,
    backgroundColor: '#1f2937', borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },
  vConstraint: {
    position: 'absolute', zIndex: 10, width: 18, height: 18,
    backgroundColor: '#1f2937', borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },
  constraintText: { color: '#f97316', fontFamily: 'SpaceGrotesk-Bold', fontSize: 9 },
});