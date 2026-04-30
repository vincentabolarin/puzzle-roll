import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GameType } from '@puzzle-roll/shared';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useAuthStore } from '../../src/stores/auth.store';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { queryKeys } from '../../src/lib/query-client';
import { apiClient } from '../../src/lib/api-client';
import { usePuzzleProgressStore } from '../../src/stores/puzzle-progress.store';

const GAME_CONFIGS = [
  { type: GameType.SUDOKU,      name: 'Sudoku',      description: 'Fill the 9×9 grid',      accent: '#6366f1', emoji: '🔢' },
  { type: GameType.QUEENS,      name: 'Queens',      description: 'Place queens safely',     accent: '#ec4899', emoji: '👑' },
  { type: GameType.ZIP,         name: 'Zip',         description: 'Connect every cell',      accent: '#f59e0b', emoji: '🔗' },
  { type: GameType.TANGO,       name: 'Tango',       description: 'Balance sun & moon',      accent: '#f97316', emoji: '☯️' },
  { type: GameType.NONOGRAM,    name: 'Nonogram',    description: 'Reveal the picture',      accent: '#14b8a6', emoji: '🖼️' },
  { type: GameType.MINESWEEPER, name: 'Minesweeper', description: 'Avoid the mines',         accent: '#ef4444', emoji: '💣' },
  { type: GameType.KAKURO,      name: 'Kakuro',      description: 'Sum the runs',            accent: '#a855f7', emoji: '➕' },
  { type: GameType.LIGHT_UP,    name: 'Light Up',    description: 'Illuminate every cell',   accent: '#eab308', emoji: '💡' },
  { type: GameType.FUTOSHIKI,   name: 'Futoshiki',   description: 'Satisfy inequalities',    accent: '#22c55e', emoji: '⚖️' },
  { type: GameType.HITORI,      name: 'Hitori',      description: 'Shade to clear repeats',  accent: '#64748b', emoji: '⬛' },
];

export default function HomeScreen() {
  const { columns } = useBreakpoint();
  const { user } = useAuthStore();
  const t = useAppTheme();
  const { isCompleted } = usePuzzleProgressStore();

  const { data: stats } = useQuery({
    queryKey: queryKeys.user.stats,
    queryFn: () => apiClient.get<Array<{ gameType: string; bestTime: number | null }>>('/users/me/stats'),
    enabled: !!user,
  });

  // Fetch today's daily puzzle IDs for all games so we can check if played
  const today = new Date().toISOString().slice(0, 10);
  const { data: dailyStatuses } = useQuery({
    queryKey: ['daily-statuses', today],
    queryFn: async () => {
      // Fetch all daily puzzles in parallel (best-effort)
      const results = await Promise.allSettled(
        GAME_CONFIGS.map(g =>
          apiClient.get<{ dailyPuzzleId: string; puzzle: { id: string } }>(`/puzzles/${g.type}/daily`)
            .then(r => ({ gameType: g.type, puzzleId: r.puzzle.id, dailyPuzzleId: r.dailyPuzzleId }))
        )
      );
      const map = new Map<string, string>(); // gameType → puzzleId
      for (const r of results) {
        if (r.status === 'fulfilled') map.set(r.value.gameType, r.value.puzzleId);
      }
      return map;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 60, // 1 hour — daily puzzles don't change mid-day
  });

  const statsMap = new Map(stats?.map(s => [s.gameType, s]) ?? []);
  const colWidth = columns === 3 ? '31%' : '47%';
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.appTitle, { color: t.textPrimary }]}>Puzzle Roll</Text>
        <Text style={[styles.appSub, { color: t.textMuted }]}>Daily logic puzzles</Text>

        <View style={styles.grid}>
          {GAME_CONFIGS.map(game => {
            const stat = statsMap.get(game.type);
            const dailyPuzzleId = dailyStatuses?.get(game.type);
            const dailyPlayed = !!dailyPuzzleId && isCompleted(dailyPuzzleId);

            return (
              <TouchableOpacity
                key={game.type}
                onPress={() => router.push(`/game/${game.type}` as never)}
                style={[styles.card, { width: colWidth, backgroundColor: t.surface, borderColor: t.borderSubtle, borderLeftColor: game.accent }]}
                accessibilityLabel={`${game.name} puzzle game`}
                accessibilityRole="button"
              >
                <View style={styles.cardTop}>
                  <Text style={styles.emoji}>{game.emoji}</Text>
                  <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>{game.name}</Text>
                </View>
                <Text style={[styles.desc, { color: t.textSecondary }]} numberOfLines={2}>{game.description}</Text>
                <View style={styles.cardBottom}>
                  {dailyPlayed ? (
                    <View style={[styles.dailyBadge, { backgroundColor: '#052e16' }]}>
                      <Text style={[styles.dailyText, { color: '#4ade80' }]}>✓ Daily played</Text>
                    </View>
                  ) : (
                    <View style={[styles.dailyBadge, { backgroundColor: t.surface2 }]}>
                      <Text style={[styles.dailyText, { color: t.textMuted }]}>● Daily live</Text>
                    </View>
                  )}
                  {stat?.bestTime != null && (
                    <Text style={[styles.bestTime, { color: t.textMuted }]}>{formatTime(stat.bestTime)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 },
  appTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 32, marginBottom: 4 },
  appSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderRadius: 18, padding: 16, borderWidth: 1, borderLeftWidth: 4, minHeight: 130, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  emoji: { fontSize: 24 },
  name: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 17, flexShrink: 1 },
  desc: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  dailyBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  dailyText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 10 },
  bestTime: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10 },
});