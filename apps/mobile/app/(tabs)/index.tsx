import { View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GameType, Difficulty } from '@puzzle-roll/shared';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useAuthStore } from '../../src/stores/auth.store';
import { queryKeys } from '../../src/lib/query-client';
import { apiClient } from '../../src/lib/api-client';

const GAME_CONFIGS: Array<{
  type: GameType;
  name: string;
  description: string;
  accent: string;
  emoji: string;
}> = [
  { type: GameType.SUDOKU, name: 'Sudoku', description: 'Fill the 9×9 grid', accent: '#6366f1', emoji: '🔢' },
  { type: GameType.QUEENS, name: 'Queens', description: 'Place queens safely', accent: '#ec4899', emoji: '👑' },
  { type: GameType.ZIP, name: 'Zip', description: 'Connect every cell', accent: '#f59e0b', emoji: '🔗' },
  { type: GameType.TANGO, name: 'Tango', description: 'Balance sun & moon', accent: '#f97316', emoji: '☯️' },
  { type: GameType.NONOGRAM, name: 'Nonogram', description: 'Reveal the picture', accent: '#14b8a6', emoji: '🖼️' },
  { type: GameType.MINESWEEPER, name: 'Minesweeper', description: 'Avoid the mines', accent: '#ef4444', emoji: '💣' },
  { type: GameType.KAKURO, name: 'Kakuro', description: 'Sum the runs', accent: '#a855f7', emoji: '➕' },
  { type: GameType.LIGHT_UP, name: 'Light Up', description: 'Illuminate every cell', accent: '#eab308', emoji: '💡' },
  { type: GameType.FUTOSHIKI, name: 'Futoshiki', description: 'Satisfy inequalities', accent: '#22c55e', emoji: '⚖️' },
  { type: GameType.HITORI, name: 'Hitori', description: 'Shade to clear repeats', accent: '#64748b', emoji: '⬛' },
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
      onPress={() => router.push(`/game/${game.type}`)}
      className="bg-surface rounded-2xl p-4 mb-3 border border-border-subtle"
      accessibilityLabel={`${game.name} puzzle game`}
      accessibilityRole="button"
      style={{ borderLeftWidth: 3, borderLeftColor: game.accent }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-2xl">{game.emoji}</Text>
          <Text className="text-text-primary font-sans-bold text-base">{game.name}</Text>
        </View>
        {dailyPlayed ? (
          <View className="bg-green-900/40 px-2 py-0.5 rounded-full">
            <Text className="text-green-400 font-sans text-xs">✓ Daily done</Text>
          </View>
        ) : (
          <View className="bg-surface-2 px-2 py-0.5 rounded-full">
            <Text className="text-text-secondary font-sans text-xs">Daily live</Text>
          </View>
        )}
      </View>
      <Text className="text-text-secondary font-sans text-sm">{game.description}</Text>
      {bestTime !== null && (
        <Text className="text-muted font-mono text-xs mt-1">Best: {formatTime(bestTime)}</Text>
      )}
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

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-24"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-6">
          <Text className="text-text-primary font-sans-bold text-3xl">Puzzle Roll</Text>
          <Text className="text-text-secondary font-sans text-sm mt-1">
            10 daily logic puzzles
          </Text>
        </View>

        {/* Game grid */}
        <View
          className="flex-row flex-wrap"
          style={{ gap: 12 }}
        >
          {GAME_CONFIGS.map((game) => {
            const stat = statsMap.get(game.type);
            return (
              <View
                key={game.type}
                style={{ width: columns === 3 ? '31%' : '47%' }}
              >
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
