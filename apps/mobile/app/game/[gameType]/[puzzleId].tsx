import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { queryKeys } from '../../../src/lib/query-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';
import { useBreakpoint } from '../../../src/hooks/useBreakpoint';
import SudokuGame from '../../../src/components/game/SudokuGame';

const GAME_COMPONENTS: Partial<Record<GameType, React.ComponentType<{ puzzleId: string; puzzleData: unknown; solution: unknown; isDaily: boolean; dailyPuzzleId: string | null }>>> = {
  [GameType.SUDOKU]: SudokuGame,
};

function GameErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8 bg-navy-950">
      <Text className="text-text-primary font-sans-bold text-xl mb-2">Something went wrong</Text>
      <Text className="text-text-secondary font-sans text-sm text-center mb-6">{error.message}</Text>
      <TouchableOpacity
        onPress={resetErrorBoundary}
        className="bg-game-sudoku rounded-xl px-6 py-3"
        accessibilityLabel="Try again"
      >
        <Text className="text-white font-sans-medium">Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ActivePuzzleScreen() {
  const { gameType, puzzleId } = useLocalSearchParams<{ gameType: string; puzzleId: string }>();
  const { isTablet } = useBreakpoint();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.puzzles.byId(puzzleId ?? ''),
    queryFn: async () => {
      // Try SQLite cache first
      const cached = await puzzleCache.getPuzzleById(puzzleId ?? '');
      if (cached) {
        return {
          id: cached.id,
          gameType: cached.gameType,
          difficulty: cached.difficulty,
          puzzleData: JSON.parse(cached.puzzleData),
          solution: null, // fetched separately on completion
        };
      }
      return apiClient.get<{ id: string; gameType: string; difficulty: string; puzzleData: unknown }>(`/puzzles/id/${puzzleId}`);
    },
    enabled: !!puzzleId,
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

  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-navy-950 items-center justify-center px-8" edges={['top']}>
        <Text className="text-text-primary font-sans-bold text-xl mb-2">Puzzle not found</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Text className="text-game-sudoku font-sans-medium">← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!GameComponent) {
    return (
      <SafeAreaView className="flex-1 bg-navy-950 items-center justify-center px-8" edges={['top']}>
        <Text className="text-text-primary font-sans-bold text-xl mb-2">Coming soon</Text>
        <Text className="text-text-secondary font-sans text-sm text-center mb-6">
          {gt.replace('_', ' ')} is being added in the next update.
        </Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Text className="text-game-sudoku font-sans-medium">← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
      <ErrorBoundary FallbackComponent={GameErrorFallback}>
        <View className={`flex-1 ${isTablet ? 'flex-row' : ''}`}>
          <GameComponent
            puzzleId={data.id}
            puzzleData={data.puzzleData}
            solution={null}
            isDaily={false}
            dailyPuzzleId={null}
          />
        </View>
      </ErrorBoundary>
    </SafeAreaView>
  );
}
