import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
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

interface KBlackCell { type: 'black'; acrossClue: number | null; downClue: number | null }
interface KWhiteCell { type: 'white'; value: number }
type KCell = KBlackCell | KWhiteCell;
interface KakuroPuzzleData { size: number; grid: KCell[][] }
interface KakuroState { values: Record<string, number> }
interface KakuroProps {
  puzzleId: string;
  puzzleData: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
}

export default function KakuroGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId, onNextPuzzle }: KakuroProps) {
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
  const [solution, setSolution] = useState<{ values: Array<{ row: number; col: number; value: number }> } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pressedDigit, setPressedDigit] = useState<number | null>(null);

  if (!puzzleData || typeof (puzzleData as KakuroPuzzleData).size !== 'number') return null;

  const pd = puzzleData as KakuroPuzzleData;
  const { size, grid } = pd;
  const CELL = Math.min(Math.floor((width * 0.96) / size), 44);

  function buildInitial(): KakuroState { return { values: {} }; }
  useEffect(() => { async function init() { const s = await loadProgress(puzzleId); if (s) { setSavedData(s); setShowResume(true); } else startFresh(); } init(); }, [puzzleId]);
  function startFresh() { startSession({ puzzleId, gameType: GameType.KAKURO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: buildInitial(), initialElapsedSeconds: 0, initialHintsUsed: 0, initialHintsRemaining: 3 }); setInitialized(true); }
  function continueFromSave() { startSession({ puzzleId, gameType: GameType.KAKURO, difficulty: Difficulty.MEDIUM, isDaily, dailyPuzzleId, initialState: (savedData?.currentState ?? buildInitial()) as KakuroState, initialElapsedSeconds: savedData?.elapsedSeconds ?? 0, initialHintsUsed: savedData?.hintsUsed ?? 0, initialHintsRemaining: savedData?.hintsRemaining ?? 3 }); setInitialized(true); }
  const loadSolution = useCallback(async () => { if (solution) return solution; try { const r = await apiClient.get<{ id: string; solution: typeof solution }>(`/puzzles/id/${puzzleId}/solution`); setSolution(r.solution); return r.solution; } catch { return null; } }, [puzzleId, solution]);
  useEffect(() => { if (!initialized || !session || session.isSolved) return; const iv = setInterval(() => { const s = useGameSessionStore.getState().session; if (!s || s.isSolved) return; saveProgress({ puzzleId, gameType: GameType.KAKURO, difficulty: s.difficulty, isDaily, dailyPuzzleId, elapsedSeconds: s.elapsedSeconds, hintsUsed: s.hintsUsed, hintsRemaining: s.hintsRemaining, currentState: s.currentState, savedAt: Date.now() }); }, 10000); return () => clearInterval(iv); }, [initialized, session?.isSolved]);

  const gameState = session?.currentState as KakuroState | undefined;
  const values = gameState?.values ?? {};
  const isPaused = session?.isPaused ?? false;

  const { mutate: submit } = useMutation({
    mutationFn: (p: { elapsedSeconds: number; hintsUsed: number; shareableResult: string }) =>
      apiClient.post('/progress/complete', { puzzleId, gameType: GameType.KAKURO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...p, completedAt: new Date().toISOString() }),
    onError: (_, v) => enqueue({ puzzleId, gameType: GameType.KAKURO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, isDaily, dailyPuzzleId, ...v, completedAt: '' }),
  });

  function checkKakuroSolved(vals: Record<string, number>): boolean {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c].type !== 'black') continue;
        const blk = grid[r][c] as KBlackCell;
        if (blk.acrossClue !== null) {
          let sum = 0; const used = new Set<number>(); let ok = true;
          for (let cc = c + 1; cc < size && grid[r][cc].type === 'white'; cc++) {
            const v = vals[`${r},${cc}`] ?? 0;
            if (!v || used.has(v)) { ok = false; break; }
            used.add(v); sum += v;
          }
          if (!ok || sum !== blk.acrossClue) return false;
        }
        if (blk.downClue !== null) {
          let sum = 0; const used = new Set<number>(); let ok = true;
          for (let rr = r + 1; rr < size && grid[rr][c].type === 'white'; rr++) {
            const v = vals[`${rr},${c}`] ?? 0;
            if (!v || used.has(v)) { ok = false; break; }
            used.add(v); sum += v;
          }
          if (!ok || sum !== blk.downClue) return false;
        }
      }
    }
    return true;
  }

  async function resolveWin(newVals: Record<string, number>) {
    if (checkKakuroSolved(newVals)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.KAKURO, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.KAKURO); await showInterstitialIfDue();
    }
  }

  const handleDigit = useCallback(async (digit: number) => {
    if (!gameState || !selected || isPaused || isSolved) return;
    lightImpact(); playSound('digit_place');
    setPressedDigit(digit);
    setTimeout(() => setPressedDigit(null), 120);
    const newVals = { ...values };
    if (digit === 0) { delete newVals[selected]; } else { newVals[selected] = digit; }
    updateState({ values: newVals });
    await resolveWin(newVals);
  }, [gameState, selected, isPaused, isSolved, values, lightImpact, updateState, session, markSolved, successNotification, showInterstitialIfDue]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    for (const { row, col, value } of sol.values) {
      if (!values[`${row},${col}`]) {
        lightImpact(); playSound('hint');
        const newVals = { ...values, [`${row},${col}`]: value };
        updateState({ values: newVals });
        await resolveWin(newVals);
        return;
      }
    }
  }, [gameState, isPaused, values, useHint, showRewardedAd, loadSolution, lightImpact, updateState, session]);

  const isDark = t.background !== '#f9fafb';
  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!gameState || !session) return null;
  const shareable = generateShareableResult({ gameType: GameType.KAKURO, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });

  return (
    <GenericGameScreen puzzleId={puzzleId} gameType={GameType.KAKURO} gameName="Kakuro" accentColor="#a855f7" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => { updateState(buildInitial()); setSelected(null); }} onGetHint={handleHint} onNextPuzzle={onNextPuzzle} scrollable>
      <View>
        <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 10, textAlign: 'center' }}>Tap a white cell, then enter a digit 1–9</Text>

        {/* Board */}
        <View style={{ borderWidth: 2, borderColor: isDark ? '#374151' : '#6b7280', alignSelf: 'center' }}>
          {grid.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {row.map((cell, c) => {
                if (cell.type === 'black') {
                  const blk = cell as KBlackCell;
                  const hasBoth = blk.downClue !== null && blk.acrossClue !== null;
                  return (
                    <View key={c} style={{
                      width: CELL, height: CELL,
                      backgroundColor: isDark ? '#1f2937' : '#374151',
                      borderWidth: 1,
                      borderColor: isDark ? '#374151' : '#1f2937',
                      overflow: 'hidden',
                      position: 'relative',
                    }}>
                      {/* Diagonal divider line when both clues present */}
                      {hasBoth && (
                        <View style={{
                          position: 'absolute',
                          width: CELL * 1.5,
                          height: 1,
                          backgroundColor: isDark ? '#6b7280' : '#9ca3af',
                          top: CELL / 2,
                          left: -CELL * 0.25,
                          transform: [{ rotate: `${Math.atan2(CELL, CELL) * 180 / Math.PI}deg` }],
                        }} />
                      )}
                      {blk.downClue !== null && (
                        <Text style={{ position: 'absolute', top: 2, left: 3, color: '#fff', fontSize: Math.max(8, CELL * 0.28), fontFamily: 'SpaceGrotesk-Bold' }}>
                          {blk.downClue}
                        </Text>
                      )}
                      {blk.acrossClue !== null && (
                        <Text style={{ position: 'absolute', bottom: 2, right: 3, color: '#fff', fontSize: Math.max(8, CELL * 0.28), fontFamily: 'SpaceGrotesk-Bold' }}>
                          {blk.acrossClue}
                        </Text>
                      )}
                    </View>
                  );
                }
                const key = `${r},${c}`;
                const val = values[key];
                const isSelected = selected === key;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => { if (!isPaused) setSelected(isSelected ? null : key); }}
                    disabled={isPaused}
                    style={{
                      width: CELL, height: CELL,
                      borderWidth: 1,
                      borderColor: isSelected ? '#a855f7' : (isDark ? '#374151' : '#d1d5db'),
                      backgroundColor: isSelected ? (isDark ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.1)') : (isDark ? '#111827' : '#ffffff'),
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {val ? <Text style={{ fontSize: CELL * 0.48, fontFamily: 'SpaceGrotesk-Bold', color: isSelected ? '#a855f7' : t.textPrimary }}>{val}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Digit pad with press feedback */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 24, marginBottom: 8 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <TouchableOpacity
              key={d}
              onPress={() => handleDigit(d)}
              activeOpacity={0.6}
              style={[
                styles.digitKey,
                {
                  backgroundColor: pressedDigit === d ? '#a855f7' : t.surface2,
                  borderColor: pressedDigit === d ? '#a855f7' : t.border,
                  transform: [{ scale: pressedDigit === d ? 0.93 : 1 }],
                },
              ]}
            >
              <Text style={{ color: pressedDigit === d ? '#fff' : t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20 }}>{d}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => handleDigit(0)}
            activeOpacity={0.6}
            style={[styles.digitKey, { backgroundColor: t.surface2, borderColor: t.border }]}
          >
            <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Bold', fontSize: 18 }}>⌫</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GenericGameScreen>
  );
}

const styles = StyleSheet.create({
  digitKey: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});