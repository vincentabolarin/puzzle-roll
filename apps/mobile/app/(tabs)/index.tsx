import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GameType } from '@puzzle-roll/shared';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useAuthStore } from '../../src/stores/auth.store';
import { queryKeys } from '../../src/lib/query-client';
import { apiClient } from '../../src/lib/api-client';

const GAME_CONFIGS = [
  { type: GameType.SUDOKU,      name: 'Sudoku',      description: 'Fill the 9×9 grid',       accent: '#6366f1', emoji: '🔢' },
  { type: GameType.QUEENS,      name: 'Queens',      description: 'Place queens safely',      accent: '#ec4899', emoji: '👑' },
  { type: GameType.ZIP,         name: 'Zip',         description: 'Connect every cell',       accent: '#f59e0b', emoji: '🔗' },
  { type: GameType.TANGO,       name: 'Tango',       description: 'Balance sun & moon',       accent: '#f97316', emoji: '☯️' },
  { type: GameType.NONOGRAM,    name: 'Nonogram',    description: 'Reveal the picture',       accent: '#14b8a6', emoji: '🖼️' },
  { type: GameType.MINESWEEPER, name: 'Minesweeper', description: 'Avoid the mines',          accent: '#ef4444', emoji: '💣' },
  { type: GameType.KAKURO,      name: 'Kakuro',      description: 'Sum the runs',             accent: '#a855f7', emoji: '➕' },
  { type: GameType.LIGHT_UP,    name: 'Light Up',    description: 'Illuminate every cell',    accent: '#eab308', emoji: '💡' },
  { type: GameType.FUTOSHIKI,   name: 'Futoshiki',   description: 'Satisfy inequalities',     accent: '#22c55e', emoji: '⚖️' },
  { type: GameType.HITORI,      name: 'Hitori',      description: 'Shade to clear repeats',   accent: '#64748b', emoji: '⬛' },
];

interface GameCardProps {
  game: (typeof GAME_CONFIGS)[number];
  bestTime: number | null;
  dailyPlayed: boolean;
}

function GameCard({ game, bestTime, dailyPlayed }: GameCardProps) {
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/game/${game.type}` as never)}
      style={[styles.card, { borderLeftColor: game.accent }]}
      accessibilityLabel={`${game.name} puzzle game`}
      accessibilityRole="button"
    >
      {/* Top row: emoji + game name */}
      <View style={styles.cardTopRow}>
        <Text style={styles.cardEmoji}>{game.emoji}</Text>
        <Text style={styles.cardName}>{game.name}</Text>
      </View>

      {/* Description */}
      <Text style={styles.cardDesc}>{game.description}</Text>

      {/* Bottom row: daily badge + best time */}
      <View style={styles.cardBottomRow}>
        <View style={[styles.dailyBadge, dailyPlayed && styles.dailyBadgeDone]}>
          <Text style={[styles.dailyBadgeText, dailyPlayed && styles.dailyBadgeTextDone]}>
            {dailyPlayed ? '✓ Daily done' : '● Daily live'}
          </Text>
        </View>
        {bestTime !== null && (
          <Text style={styles.bestTime}>Best {formatTime(bestTime)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { columns } = useBreakpoint();
  const { user } = useAuthStore();

  const { data: stats } = useQuery({
    queryKey: queryKeys.user.stats,
    queryFn: () => apiClient.get<Array<{ gameType: string; bestTime: number | null }>>('/users/me/stats'),
    enabled: !!user,
  });

  const statsMap = new Map(stats?.map((s) => [s.gameType, s]) ?? []);
  const colWidth = columns === 3 ? '31%' : '47%';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.appTitle}>Puzzle Roll</Text>
        <Text style={styles.appSubtitle}>10 daily logic puzzles</Text>

        <View style={styles.grid}>
          {GAME_CONFIGS.map((game) => {
            const stat = statsMap.get(game.type);
            return (
              <View key={game.type} style={{ width: colWidth }}>
                <GameCard
                  game={game}
                  bestTime={stat?.bestTime ?? null}
                  dailyPlayed={false}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#060818' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 },
  appTitle: { color: '#f9fafb', fontFamily: 'SpaceGrotesk-Bold', fontSize: 32, marginBottom: 4 },
  appSubtitle: { color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderLeftWidth: 4,
    minHeight: 130,
    justifyContent: 'space-between',
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardEmoji: { fontSize: 24 },
  cardName: { color: '#f9fafb', fontFamily: 'SpaceGrotesk-Bold', fontSize: 17, flexShrink: 1 },
  cardDesc: { color: '#9ca3af', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, marginBottom: 12, lineHeight: 17 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  dailyBadge: { backgroundColor: '#1f2937', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  dailyBadgeDone: { backgroundColor: '#052e16' },
  dailyBadgeText: { color: '#9ca3af', fontFamily: 'SpaceGrotesk-Medium', fontSize: 10 },
  dailyBadgeTextDone: { color: '#4ade80' },
  bestTime: { color: '#6b7280', fontFamily: 'JetBrainsMono-Regular', fontSize: 10 },
});