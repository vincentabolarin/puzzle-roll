import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { useAuthStore } from '../../src/stores/auth.store';

const GAME_LABELS: Record<GameType, string> = {
  [GameType.SUDOKU]: 'Sudoku',
  [GameType.QUEENS]: 'Queens',
  [GameType.ZIP]: 'Zip',
  [GameType.TANGO]: 'Tango',
  [GameType.NONOGRAM]: 'Nonogram',
  [GameType.MINESWEEPER]: 'Minesweeper',
  [GameType.KAKURO]: 'Kakuro',
  [GameType.LIGHT_UP]: 'Light Up',
  [GameType.FUTOSHIKI]: 'Futoshiki',
  [GameType.HITORI]: 'Hitori',
};

const GAME_TYPES = Object.values(GameType);

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  elapsedSeconds: number;
  hintsUsed: number;
  completedAt: string;
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function EntryRow({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  const medalEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;

  return (
    <View
      className={`flex-row items-center py-3 px-4 border-b border-border-subtle ${
        isCurrentUser ? 'bg-surface-2' : ''
      }`}
    >
      <Text className="text-text-secondary font-mono w-8 text-sm">
        {medalEmoji ?? `${entry.rank}`}
      </Text>
      <Text className={`flex-1 font-sans-medium text-sm ${isCurrentUser ? 'text-game-sudoku' : 'text-text-primary'}`}>
        {isCurrentUser ? 'You' : entry.username}
      </Text>
      <Text className="text-text-secondary font-mono text-sm">{formatTime(entry.elapsedSeconds)}</Text>
      {entry.hintsUsed > 0 && (
        <Text className="text-muted font-sans text-xs ml-2">{entry.hintsUsed}💡</Text>
      )}
    </View>
  );
}

export default function LeaderboardScreen() {
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.SUDOKU);
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.leaderboard.daily(selectedGame),
    queryFn: () =>
      apiClient.get<{ gameType: string; date: string; entries: LeaderboardEntry[]; userEntry: LeaderboardEntry | null }>(
        `/leaderboard/${selectedGame}/daily`
      ),
    enabled: !!user,
  });

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-text-primary font-sans-bold text-2xl mb-4">Daily Leaderboard</Text>

        {/* Game selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row gap-2">
            {GAME_TYPES.map((gt) => (
              <TouchableOpacity
                key={gt}
                onPress={() => setSelectedGame(gt)}
                className={`px-3 py-1.5 rounded-full border ${
                  selectedGame === gt
                    ? 'bg-game-sudoku border-game-sudoku'
                    : 'bg-surface border-border'
                }`}
                accessibilityLabel={GAME_LABELS[gt]}
                accessibilityRole="tab"
              >
                <Text className={`font-sans-medium text-sm ${selectedGame === gt ? 'text-white' : 'text-text-secondary'}`}>
                  {GAME_LABELS[gt]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView className="flex-1">
          {data?.userEntry && (
            <View className="mx-4 mb-2 rounded-xl overflow-hidden border border-game-sudoku/30">
              <View className="px-4 py-2 bg-game-sudoku/10">
                <Text className="text-game-sudoku font-sans-medium text-xs">Your result</Text>
              </View>
              <EntryRow entry={data.userEntry} isCurrentUser />
            </View>
          )}

          <View className="mx-4 rounded-xl overflow-hidden border border-border-subtle">
            {(data?.entries ?? []).map((entry) => (
              <EntryRow
                key={entry.userId}
                entry={entry}
                isCurrentUser={entry.userId === user?.id}
              />
            ))}
            {(data?.entries ?? []).length === 0 && (
              <View className="py-12 items-center">
                <Text className="text-text-secondary font-sans text-sm">
                  No completions yet today. Be the first!
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
