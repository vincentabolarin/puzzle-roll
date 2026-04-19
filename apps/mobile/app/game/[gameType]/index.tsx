import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Difficulty, GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { queryKeys } from '../../../src/lib/query-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';
import { usePuzzleProgressStore } from '../../../src/stores/puzzle-progress.store';
import { useTheme } from '../../_layout';
import { themes } from '../../../src/lib/theme';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Easy',
  [Difficulty.MEDIUM]: 'Medium',
  [Difficulty.HARD]: 'Hard',
  [Difficulty.EXPERT]: 'Expert',
};

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  [Difficulty.EASY]: '#22c55e',
  [Difficulty.MEDIUM]: '#f59e0b',
  [Difficulty.HARD]: '#ef4444',
  [Difficulty.EXPERT]: '#a855f7',
};

interface PuzzleListItem {
  id: string;
  gameType: string;
  difficulty: Difficulty;
  createdAt: string;
}

interface DailyData {
  dailyPuzzleId: string;
  date: string;
  gameType: string;
  puzzle: { id: string; puzzleData: unknown };
}

export default function GameLobbyScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: GameType }>();
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const { isCompleted, isInProgress } = usePuzzleProgressStore();
  const resolvedTheme = useTheme();
  const t = themes[resolvedTheme];

  const gameName = (gameType ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: daily } = useQuery<DailyData | null>({
    queryKey: queryKeys.puzzles.daily(gameType ?? ''),
    queryFn: async (): Promise<DailyData | null> => {
      const today = new Date().toISOString().slice(0, 10);
      const cached = await puzzleCache.getDailyPuzzle(gameType ?? '', today);
      if (cached) {
        return {
          dailyPuzzleId: cached.dailyPuzzleId,
          date: cached.date,
          gameType: cached.gameType,
          puzzle: { id: cached.puzzleId, puzzleData: JSON.parse(cached.puzzleData) },
        };
      }
      try {
        return await apiClient.get<DailyData>(`/puzzles/${gameType}/daily`);
      } catch {
        return null;
      }
    },
    enabled: !!gameType,
  });

  const { data: puzzles, isLoading } = useQuery<PuzzleListItem[]>({
    queryKey: queryKeys.puzzles.list(gameType ?? '', selectedDifficulty),
    queryFn: async (): Promise<PuzzleListItem[]> => {
      const cached = await puzzleCache.getPuzzles(gameType ?? '', selectedDifficulty, 20);
      if (cached.length > 0) {
        return cached.map((p) => ({
          id: p.id,
          gameType: p.gameType,
          difficulty: p.difficulty as Difficulty,
          createdAt: new Date(p.cachedAt).toISOString(),
        }));
      }
      const result = await apiClient.get<{ data: PuzzleListItem[] } | PuzzleListItem[]>(
        `/puzzles/${gameType}?difficulty=${selectedDifficulty}&limit=20`
      );
      return Array.isArray(result) ? result : (result as { data: PuzzleListItem[] }).data ?? [];
    },
    enabled: !!gameType,
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={[styles.backText, { color: t.textSecondary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.textPrimary }]}>{gameName}</Text>
        <TouchableOpacity
          onPress={() => router.push(`/game/${gameType}/instructions` as never)}
          style={styles.infoBtn}
          accessibilityLabel="How to play"
        >
          <Text style={[styles.infoText, { color: t.textSecondary }]}>?</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Daily CTA */}
        {daily != null && (
          <TouchableOpacity
            onPress={() => router.push(`/game/${gameType}/daily` as never)}
            style={[styles.dailyCard, { backgroundColor: t.surface, borderColor: t.accent + '55' }]}
            accessibilityLabel="Play today's daily puzzle"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.dailyTitle, { color: t.accent }]}>Today's Daily</Text>
              <Text style={[styles.dailyDesc, { color: t.textSecondary }]}>Compete on the global leaderboard</Text>
            </View>
            <Text style={{ fontSize: 32 }}>🏆</Text>
          </TouchableOpacity>
        )}

        {/* Difficulty selector */}
        <View style={styles.diffRow}>
          {(Object.values(Difficulty) as Difficulty[]).map((d) => {
            const active = selectedDifficulty === d;
            const color = DIFFICULTY_COLORS[d];
            return (
              <TouchableOpacity
                key={d}
                onPress={() => setSelectedDifficulty(d)}
                style={[
                  styles.diffBtn,
                  {
                    backgroundColor: active ? color + '22' : t.surface,
                    borderColor: active ? color : t.borderSubtle,
                  },
                ]}
                accessibilityLabel={DIFFICULTY_LABELS[d]}
                accessibilityRole="tab"
              >
                <Text style={[styles.diffText, { color: active ? color : t.textMuted }]}>
                  {DIFFICULTY_LABELS[d]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Puzzle list */}
        {isLoading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} />
        ) : (
          <View style={{ gap: 8 }}>
            {(puzzles ?? []).map((puzzle, i) => {
              const completed = isCompleted(puzzle.id);
              const inProgress = !completed && isInProgress(puzzle.id);
              return (
                <TouchableOpacity
                  key={puzzle.id}
                  onPress={() => router.push(`/game/${gameType}/${puzzle.id}` as never)}
                  style={[
                    styles.puzzleRow,
                    {
                      backgroundColor: t.surface,
                      borderColor: completed ? '#16a34a44' : inProgress ? t.accent + '44' : t.borderSubtle,
                    },
                  ]}
                  accessibilityLabel={`Puzzle ${i + 1}${completed ? ', completed' : inProgress ? ', in progress' : ''}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.puzzleLabel, { color: t.textPrimary }]}>Puzzle {i + 1}</Text>
                  <View style={styles.puzzleRight}>
                    {completed && (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedText}>✓ Done</Text>
                      </View>
                    )}
                    {inProgress && (
                      <View style={[styles.inProgressBadge, { borderColor: t.accent }]}>
                        <Text style={[styles.inProgressText, { color: t.accent }]}>In progress</Text>
                      </View>
                    )}
                    {!completed && !inProgress && (
                      <Text style={[styles.playArrow, { color: t.textMuted }]}>Play →</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            {!isLoading && (puzzles ?? []).length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={[styles.emptyText, { color: t.textMuted }]}>
                  No puzzles available. Check your connection.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, flex: 1, textAlign: 'center' },
  infoBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    borderColor: '#374151', alignItems: 'center', justifyContent: 'center',
  },
  infoText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
  content: { paddingHorizontal: 16, paddingBottom: 96 },
  dailyCard: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderRadius: 16, borderWidth: 1.5, marginBottom: 20,
  },
  dailyTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 16, marginBottom: 2 },
  dailyDesc: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  diffRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  diffBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  diffText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  puzzleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  puzzleLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  puzzleRight: { flexDirection: 'row', alignItems: 'center' },
  completedBadge: { backgroundColor: '#052e16', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  completedText: { color: '#4ade80', fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  inProgressBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  inProgressText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  playArrow: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  emptyText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center' },
});