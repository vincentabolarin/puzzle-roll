import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Difficulty, GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { queryKeys } from '../../../src/lib/query-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';
import { usePuzzleProgressStore } from '../../../src/stores/puzzle-progress.store';
import { useAppTheme } from '../../../src/hooks/useAppTheme';
import { useNetworkStatus } from '../../../src/hooks/useNetworkStatus';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Easy', [Difficulty.MEDIUM]: 'Medium',
  [Difficulty.HARD]: 'Hard', [Difficulty.EXPERT]: 'Expert',
};
const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  [Difficulty.EASY]: '#22c55e', [Difficulty.MEDIUM]: '#f59e0b',
  [Difficulty.HARD]: '#ef4444', [Difficulty.EXPERT]: '#a855f7',
};

interface PuzzleListItem { id: string; gameType: string; difficulty: Difficulty; createdAt: string }
interface DailyData { dailyPuzzleId: string; date: string; gameType: string; puzzle: { id: string; puzzleData: unknown } }
const PAGE_SIZE = 20;

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function DailyResultModal({
  visible, gameType, onClose, onLeaderboard,
}: { visible: boolean; gameType: string; onClose: () => void; onLeaderboard: () => void }) {
  const t = useAppTheme();
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.leaderboard.daily(gameType as GameType), 'lobby-modal'],
    queryFn: () => apiClient.get<{ userEntry: { rank: number; elapsedSeconds: number; hintsUsed: number } | null }>(`/leaderboard/${gameType}/daily`),
    enabled: visible,
    staleTime: 0,
  });
  const userEntry = data?.userEntry;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: t.surface, borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, borderColor: t.borderSubtle }}>
          <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, color: t.textPrimary, textAlign: 'center', marginBottom: 6 }}>
            Today's Daily ✅
          </Text>
          <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: t.textMuted, textAlign: 'center', marginBottom: 20 }}>
            You've already completed today's puzzle.
          </Text>

          {isLoading ? (
            <View style={{ alignItems: 'center', marginBottom: 20 }}><ActivityIndicator color={t.accent} /></View>
          ) : userEntry ? (
            <View style={{ backgroundColor: t.surface2, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, color: t.textPrimary }}>#{userEntry.rank}</Text>
                  <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, color: t.textMuted }}>Your rank</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'JetBrainsMono-Regular', fontSize: 26, color: t.textPrimary }}>{formatTime(userEntry.elapsedSeconds)}</Text>
                  <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, color: t.textMuted }}>Your time</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, color: t.textPrimary }}>{userEntry.hintsUsed === 0 ? '—' : userEntry.hintsUsed}</Text>
                  <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, color: t.textMuted }}>Hints</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              Result not available yet.
            </Text>
          )}

          <TouchableOpacity onPress={onLeaderboard} style={{ backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 }}>View Leaderboard 🏆</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: t.border }}>
            <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function GameLobbyScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: GameType }>();
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [showDailyResult, setShowDailyResult] = useState(false);
  // Subscribe to the sets directly so the component re-renders when they change
  const completedPuzzleIds = usePuzzleProgressStore(s => s.completedPuzzleIds);
  const dailyCompletedPuzzleIds = usePuzzleProgressStore(s => s.dailyCompletedPuzzleIds);
  const inProgressPuzzleIds = usePuzzleProgressStore(s => s.inProgressPuzzleIds);
  const isCompleted = (id: string) => completedPuzzleIds.has(id);
  const isDailyCompleted = (id: string) => dailyCompletedPuzzleIds.has(id);
  const isInProgress = (id: string) => !completedPuzzleIds.has(id) && inProgressPuzzleIds.has(id);
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';
  const queryClient = useQueryClient();

  const gameName = (gameType ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const { isConnected } = useNetworkStatus();

  const cachedDaily = queryClient.getQueryData<DailyData>(queryKeys.puzzles.daily(gameType ?? ''));
  const dailyAlreadyPlayed = !!cachedDaily && isDailyCompleted(cachedDaily.puzzle.id);

  const { data: daily } = useQuery<DailyData | null>({
    queryKey: queryKeys.puzzles.daily(gameType ?? ''),
    queryFn: async (): Promise<DailyData | null> => {
      const today = new Date().toISOString().slice(0, 10);
      const cached = await puzzleCache.getDailyPuzzle(gameType ?? '', today);
      if (cached) {
        return { dailyPuzzleId: cached.dailyPuzzleId, date: cached.date, gameType: cached.gameType, puzzle: { id: cached.puzzleId, puzzleData: JSON.parse(cached.puzzleData) } };
      }
      try { return await apiClient.get<DailyData>(`/puzzles/${gameType}/daily`); }
      catch { return null; }
    },
    enabled: !!gameType,
    staleTime: dailyAlreadyPlayed ? Infinity : 1000 * 60 * 5,
  });

  const dailyPlayed = !!daily && isDailyCompleted(daily.puzzle.id);

  const {
    data: puzzlePages,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.puzzles.list(gameType ?? '', selectedDifficulty),
    queryFn: async ({ pageParam = 1 }) => {
      const page = pageParam as number;
      if (page === 1) {
        const cached = await puzzleCache.getPuzzles(gameType ?? '', selectedDifficulty, PAGE_SIZE);
        if (cached.length > 0) {
          return {
            items: cached.map(p => ({ id: p.id, gameType: p.gameType, difficulty: p.difficulty as Difficulty, createdAt: new Date(p.cachedAt).toISOString() })),
            nextPage: 2,
            hasMore: cached.length === PAGE_SIZE,
          };
        }
      }
      const result = await apiClient.get<{ data: PuzzleListItem[]; hasMore: boolean }>(
        `/puzzles/${gameType}?difficulty=${selectedDifficulty}&limit=${PAGE_SIZE}&page=${page}`
      );
      const items = result.data ?? [];
      return { items, nextPage: page + 1, hasMore: result.hasMore ?? false };
    },
    initialPageParam: 1,
    getNextPageParam: page => page.hasMore ? page.nextPage : undefined,
    enabled: !!gameType,
  });

  const puzzles = puzzlePages?.pages.flatMap(p => p.items) ?? [];

  // ─── FlatList items: we prefix with a daily card item and a difficulty-tabs item ───
  type ListItem =
    | { kind: 'daily' }
    | { kind: 'tabs' }
    | { kind: 'error' }
    | { kind: 'empty' }
    | { kind: 'offline-end' }
    | { kind: 'puzzle'; puzzle: PuzzleListItem; index: number };

  const listItems: ListItem[] = [];
  if (daily != null) listItems.push({ kind: 'daily' });
  listItems.push({ kind: 'tabs' });
  if (isError) listItems.push({ kind: 'error' });
  if (!isLoading && puzzles.length === 0 && !isError) listItems.push({ kind: 'empty' });
  puzzles.forEach((puzzle, index) => listItems.push({ kind: 'puzzle', puzzle, index }));
  // Offline banner at end of list when there are no more cached puzzles to load
  if (!hasNextPage && !isFetchingNextPage && !isConnected && puzzles.length > 0) {
    listItems.push({ kind: 'offline-end' } as ListItem);
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'daily') {
      return (
        <TouchableOpacity
          onPress={() => dailyPlayed ? setShowDailyResult(true) : router.push(`/game/${gameType}/daily` as never)}
          style={[styles.dailyCard, { backgroundColor: t.surface, borderColor: dailyPlayed ? '#16a34a55' : t.accent + '55' }]}
          accessibilityLabel={dailyPlayed ? 'View your daily result' : "Play today's daily puzzle"}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.dailyTitle, { color: dailyPlayed ? '#4ade80' : t.accent }]}>
              {dailyPlayed ? '✓ Daily completed' : "Today's Daily"}
            </Text>
            <Text style={[styles.dailyDesc, { color: t.textSecondary }]}>
              {dailyPlayed ? 'Tap to view your result and the leaderboard' : 'Compete on the global leaderboard'}
            </Text>
          </View>
          <Text style={{ fontSize: 32 }}>{dailyPlayed ? '🏅' : '🏆'}</Text>
        </TouchableOpacity>
      );
    }

    if (item.kind === 'tabs') {
      return (
        <View style={styles.diffRow}>
          {(Object.values(Difficulty) as Difficulty[]).map(d => {
            const active = selectedDifficulty === d;
            const color = DIFFICULTY_COLORS[d];
            return (
              <TouchableOpacity
                key={d}
                onPress={() => setSelectedDifficulty(d)}
                style={[styles.diffBtn, { backgroundColor: active ? color + '22' : t.surface, borderColor: active ? color : t.borderSubtle }]}
                accessibilityLabel={DIFFICULTY_LABELS[d]}
                accessibilityRole="tab"
              >
                <Text style={[styles.diffText, { color: active ? color : t.textMuted }]}>{DIFFICULTY_LABELS[d]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (item.kind === 'offline-end') {
      return (
        <View style={{ marginTop: 16, borderRadius: 12, padding: 14, backgroundColor: isDark ? 'rgba(234,179,8,0.1)' : '#fefce8', borderWidth: 1, borderColor: '#ca8a04' }}>
          <Text style={{ color: '#ca8a04', fontFamily: 'SpaceGrotesk-Medium', fontSize: 13, textAlign: 'center' }}>
            You've reached the end of your downloaded puzzles.{' '}Connect to the internet to download more.
          </Text>
        </View>
      );
    }

    if (item.kind === 'error') {
      return (
        <View style={[styles.errorBanner, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: '#f87171' }]}>
          <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Medium', fontSize: 13, textAlign: 'center' }}>
            Unable to load puzzles. Check your internet connection.
          </Text>
        </View>
      );
    }

    if (item.kind === 'empty') {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 48 }}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center' }}>
            No puzzles available.{'\n'}Check your internet connection.
          </Text>
        </View>
      );
    }

    // puzzle row
    const { puzzle, index } = item;
    const completed = isCompleted(puzzle.id);
    const inProgress = !completed && isInProgress(puzzle.id);
    return (
      <TouchableOpacity
        onPress={() => router.push(`/game/${gameType}/${puzzle.id}` as never)}
        style={[styles.puzzleRow, { backgroundColor: t.surface, borderColor: completed ? '#16a34a44' : inProgress ? t.accent + '44' : t.borderSubtle }]}
        accessibilityLabel={`Puzzle ${index + 1}${completed ? ', completed' : inProgress ? ', in progress' : ''}`}
        accessibilityRole="button"
      >
        <Text style={[styles.puzzleLabel, { color: t.textPrimary }]}>Puzzle {index + 1}</Text>
        <View style={styles.puzzleRight}>
          {completed && <View style={styles.completedBadge}><Text style={styles.completedText}>✓ Done</Text></View>}
          {inProgress && <View style={[styles.inProgressBadge, { borderColor: t.accent }]}><Text style={[styles.inProgressText, { color: t.accent }]}>In progress</Text></View>}
          {!completed && !inProgress && <Text style={[styles.playArrow, { color: t.textMuted }]}>Play →</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Text style={[styles.backText, { color: t.textSecondary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.textPrimary }]}>{gameName}</Text>
        <TouchableOpacity onPress={() => router.push(`/game/${gameType}/instructions` as never)} style={styles.infoBtn} accessibilityLabel="How to play">
          <Text style={[styles.infoText, { color: t.textSecondary }]}>?</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, i) => {
            if (item.kind === 'puzzle') return item.puzzle.id;
            return `${item.kind}-${i}`;
          }}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          // Reliable infinite scroll — triggers when 20% from bottom
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          onEndReachedThreshold={0.2}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={t.accent} style={{ marginTop: 12 }} /> : null}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      <DailyResultModal
        visible={showDailyResult}
        gameType={gameType ?? ''}
        onClose={() => setShowDailyResult(false)}
        onLeaderboard={() => { setShowDailyResult(false); router.push('/(tabs)/leaderboard' as never); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, flex: 1, textAlign: 'center' },
  infoBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  infoText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
  content: { paddingHorizontal: 16, paddingBottom: 96 },
  dailyCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1.5, marginBottom: 0 },
  dailyTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 16, marginBottom: 2 },
  dailyDesc: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  diffText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  errorBanner: { borderRadius: 10, borderWidth: 1, padding: 14 },
  puzzleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  puzzleLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  puzzleRight: { flexDirection: 'row', alignItems: 'center' },
  completedBadge: { backgroundColor: '#052e16', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  completedText: { color: '#4ade80', fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  inProgressBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  inProgressText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  playArrow: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
});