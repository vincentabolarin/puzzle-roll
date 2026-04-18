import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { queryKeys } from '../../../src/lib/query-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';
import SudokuGame from '../../../src/components/game/SudokuGame';

const GAME_COMPONENTS: Partial<Record<GameType, React.ComponentType<{ puzzleId: string; puzzleData: unknown; solution: unknown; isDaily: boolean; dailyPuzzleId: string | null }>>> = {
  [GameType.SUDOKU]: SudokuGame,
};

function ErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-text-primary font-sans-bold text-xl mb-4">Something went wrong</Text>
      <TouchableOpacity onPress={resetErrorBoundary} className="bg-game-sudoku rounded-xl px-6 py-3">
        <Text className="text-white font-sans-medium">Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DailyPuzzleScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: GameType }>();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.puzzles.daily(gameType ?? ''),
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const cached = await puzzleCache.getDailyPuzzle(gameType ?? '', today);
      if (cached) {
        return {
          dailyPuzzleId: cached.dailyPuzzleId,
          puzzleId: cached.puzzleId,
          puzzleData: JSON.parse(cached.puzzleData),
        };
      }
      const result = await apiClient.get<{
        dailyPuzzleId: string;
        puzzle: { id: string; puzzleData: unknown };
      }>(`/puzzles/${gameType}/daily`);
      return {
        dailyPuzzleId: result.dailyPuzzleId,
        puzzleId: result.puzzle.id,
        puzzleData: result.puzzle.puzzleData,
      };
    },
    enabled: !!gameType,
  });

  const gt = (gameType ?? '') as GameType;
  const GameComponent = GAME_COMPONENTS[gt];

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-navy-950 items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#6366f1" size="large" />
      </SafeAreaView>
    );
  }

  if (!data || !GameComponent) {
    return (
      <SafeAreaView className="flex-1 bg-navy-950 items-center justify-center px-8" edges={['top']}>
        <Text className="text-text-primary font-sans-bold text-xl mb-2">
          {!GameComponent ? 'Coming soon' : 'Daily puzzle unavailable'}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-game-sudoku font-sans-medium mt-4">← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GameComponent
          puzzleId={data.puzzleId}
          puzzleData={data.puzzleData}
          solution={null}
          isDaily
          dailyPuzzleId={data.dailyPuzzleId}
        />
      </ErrorBoundary>
    </SafeAreaView>
  );
}
