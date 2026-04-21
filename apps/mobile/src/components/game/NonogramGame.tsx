import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions, Modal } from 'react-native';
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
type Cell = 'empty' | 'filled' | 'marked'
interface NGState { board: Cell[][] }
interface Props { puzzleId: string; puzzleData: unknown; isDaily: boolean; dailyPuzzleId: string | null }

export default function NonogramGame({ puzzleId, puzzleData, isDaily, dailyPuzzleId }: Props) {
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
  const [solution, setSolution] = useState<{ grid: boolean[][] } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pd = puzzleData as NonogramData;
  const { size, rowClues, colClues } = pd;

  // Cell fills most of the available width minus clue columns
  const CLUE_W = Math.max(24, Math.floor(width * 0.09));
  const CELL = Math.max(24, Math.floor((width * 0.94 - CLUE_W) / size));

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
    for (let r = 0; r < size; r++) {
      const c = computeClues(b[r].map(x => x === 'filled')); if (JSON.stringify(c) !== JSON.stringify(rowClues[r])) return false;
    }
    for (let c = 0; c < size; c++) {
      const cl = computeClues(b.map(row => row[c] === 'filled')); if (JSON.stringify(cl) !== JSON.stringify(colClues[c])) return false;
    }
    return true;
  }

  const handleCellPress = useCallback(async (r: number, c: number, markEmpty: boolean) => {
    if (!gameState || isPaused || isSolved) return;
    lightImpact(); playSound('cell_tap');
    const nb = gameState.board.map(row => [...row]);
    if (markEmpty) {
      nb[r][c] = nb[r][c] === 'marked' ? 'empty' : 'marked';
    } else {
      nb[r][c] = nb[r][c] === 'filled' ? 'empty' : 'filled';
    }
    updateState({ board: nb });
    if (checkSolved(nb)) {
      markSolved(); setIsSolved(true); successNotification(); playSound('complete');
      const sol = await loadSolution();
      setSolution(sol); // save for picture display
      setTimeout(() => setShowSolution(true), 800); // show picture after brief delay
      const elapsed = session?.elapsedSeconds ?? 0, hints = session?.hintsUsed ?? 0;
      const shareable = generateShareableResult({ gameType: GameType.NONOGRAM, difficulty: session?.difficulty ?? Difficulty.MEDIUM, elapsedSeconds: elapsed, hintsUsed: hints, date: new Date().toISOString().slice(0, 10), isDaily });
      submit({ elapsedSeconds: elapsed, hintsUsed: hints, shareableResult: shareable });
      await markCompleted(puzzleId); await puzzleCache.markCompleted(puzzleId, GameType.NONOGRAM); await showInterstitialIfDue();
    }
  }, [gameState, isPaused, isSolved, lightImpact, updateState, session, markSolved, successNotification, loadSolution, showInterstitialIfDue]);

  const handleHint = useCallback(async () => {
    if (!gameState || isPaused) return;
    const canUse = useHint(); if (!canUse) { const g = await showRewardedAd(); if (!g) return; }
    const sol = await loadSolution(); if (!sol) return;
    for (let r = 0; r < size; r++) {
      const rowOk = gameState.board[r].every((c, ci) => (c === 'filled') === sol.grid[r][ci]);
      if (!rowOk) {
        const nb = gameState.board.map((row, ri) => ri === r ? row.map((_, ci): Cell => sol.grid[r][ci] ? 'filled' : 'marked') : [...row]);
        lightImpact(); playSound('hint'); updateState({ board: nb }); return;
      }
    }
  }, [gameState, isPaused, size, useHint, showRewardedAd, loadSolution, lightImpact, updateState]);

  if (!initialized) return <ResumeModal visible={showResume} elapsedSeconds={savedData?.elapsedSeconds ?? 0} onContinue={() => { setShowResume(false); continueFromSave(); }} onRestart={() => { setShowResume(false); clearProgress(puzzleId); startFresh(); }} />;
  if (!board || !session) return null;

  const isDark = t.background !== '#f9fafb';
  const shareable = generateShareableResult({ gameType: GameType.NONOGRAM, difficulty: session.difficulty, elapsedSeconds: session.elapsedSeconds, hintsUsed: session.hintsUsed, date: new Date().toISOString().slice(0, 10), isDaily });
  const maxClueRows = Math.max(...colClues.map(c => c.length));

  return (
    <>
      <GenericGameScreen puzzleId={puzzleId} gameType={GameType.NONOGRAM} gameName="Nonogram" accentColor="#14b8a6" isSolved={isSolved} elapsedSeconds={session.elapsedSeconds} hintsUsed={session.hintsUsed} hintsRemaining={session.hintsRemaining} isPaused={isPaused} isDaily={isDaily} shareableResult={shareable} onPauseToggle={isPaused ? resumeTimer : pauseTimer} onReset={() => setShowResetConfirm(true)} onGetHint={handleHint} scrollable>
        <View>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>
            Tap: fill · Long-press: mark empty (×)
          </Text>

          {/* Column clues */}
          <View style={{ flexDirection: 'row', paddingLeft: CLUE_W }}>
            {colClues.map((clue, c) => (
              <View key={c} style={{ width: CELL, height: maxClueRows * 14, justifyContent: 'flex-end', alignItems: 'center' }}>
                {clue.map((n, i) => (
                  <Text key={i} style={{ fontSize: Math.max(8, CELL * 0.28), color: t.textSecondary, fontFamily: 'JetBrainsMono-Regular', lineHeight: 14 }}>{n}</Text>
                ))}
              </View>
            ))}
          </View>

          {/* Rows */}
          {board.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Row clue */}
              <View style={{ width: CLUE_W, alignItems: 'flex-end', paddingRight: 4 }}>
                <Text style={{ fontSize: Math.max(8, CELL * 0.28), color: t.textSecondary, fontFamily: 'JetBrainsMono-Regular' }}>
                  {rowClues[r].join(' ')}
                </Text>
              </View>
              {/* Cells */}
              {row.map((cell, c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => handleCellPress(r, c, false)}
                  onLongPress={() => handleCellPress(r, c, true)}
                  delayLongPress={300}
                  disabled={isPaused}
                  style={{
                    width: CELL, height: CELL,
                    borderWidth: 0.5,
                    borderColor: isDark ? '#374151' : '#9ca3af',
                    backgroundColor:
                      cell === 'filled' ? (isDark ? '#e5e7eb' : '#111827')
                      : cell === 'marked' ? (isDark ? '#1f2937' : '#f3f4f6')
                      : (isDark ? '#060818' : '#ffffff'),
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {cell === 'marked' && (
                    <Text style={{ fontSize: CELL * 0.55, color: isDark ? '#6b7280' : '#9ca3af', lineHeight: CELL }}>×</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </GenericGameScreen>

      {/* Solution picture modal */}
      <Modal visible={showSolution} transparent animationType="fade" onRequestClose={() => setShowSolution(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: t.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: t.borderSubtle }}>
            <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, color: t.textPrimary, marginBottom: 4 }}>Puzzle complete! 🎉</Text>
            <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: t.textSecondary, marginBottom: 16 }}>Here's the picture you revealed:</Text>
            {/* Pixel art preview */}
            <View style={{ borderWidth: 1, borderColor: t.border }}>
              {(solution?.grid ?? []).map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {row.map((filled, c) => (
                    <View key={c} style={{ width: Math.min(8, Math.floor(160 / size)), height: Math.min(8, Math.floor(160 / size)), backgroundColor: filled ? '#111827' : '#f9fafb' }} />
                  ))}
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