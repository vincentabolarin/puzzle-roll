import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Difficulty, GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';
import { useAppTheme } from '../../../src/hooks/useAppTheme';
import { GAME_REGISTRY } from '@/lib/game-registry';
import { useAuthStore } from '@/stores/auth.store';

function ErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, backgroundColor: t.background }}>
      <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, marginBottom: 16 }}>Something went wrong</Text>
      <TouchableOpacity onPress={resetErrorBoundary} style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
        <Text style={{ color: '#fff', fontFamily: 'SpaceGrotesk-Medium' }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DailyPuzzleScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: GameType }>();
  const t = useAppTheme();
  const today = new Date().toISOString().slice(0, 10);

  const { user } = useAuthStore();

  if (!user || user.isAnonymous) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }} edges={['top']}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>🏆</Text>
        <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, textAlign: 'center', marginBottom: 10 }}>
          Sign in to play daily puzzles
        </Text>
        <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
          Daily puzzles, streaks, and leaderboards require an account.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 }}
          onPress={() => router.push('/(auth)/login' as never)}
        >
          <Text style={{ color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 }}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 12 }} onPress={() => router.push('/(auth)/register' as never)}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>Create a free account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => router.back()}>
          <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { data, isLoading } = useQuery({
    queryKey: ['daily-puzzle', gameType, today],
    queryFn: async () => {
      const cached = await puzzleCache.getDailyPuzzle(gameType ?? '', today);
      if (cached) {
        return {
          dailyPuzzleId: cached.dailyPuzzleId,
          puzzleId: cached.puzzleId,
          puzzleData: JSON.parse(cached.puzzleData),
          difficulty: cached.difficulty ?? undefined,
        };
      }
      const result = await apiClient.get<{
        dailyPuzzleId: string;
        puzzle: { id: string; puzzleData: unknown; difficulty: Difficulty };
      }>(`/puzzles/${gameType}/daily`);
      if (!result.puzzle || result.puzzle.puzzleData == null) {
        throw new Error('Daily puzzle data unavailable');
      }
      // Cache with difficulty for next time
      await puzzleCache.cacheDailyPuzzle({
        gameType: gameType as GameType,
        date: today,
        dailyPuzzleId: result.dailyPuzzleId,
        puzzleId: result.puzzle.id,
        puzzleData: result.puzzle.puzzleData,
        difficulty: result.puzzle.difficulty,
      });
      return {
        dailyPuzzleId: result.dailyPuzzleId,
        puzzleId: result.puzzle.id,
        puzzleData: result.puzzle.puzzleData,
        difficulty: result.puzzle.difficulty,
      };
    },
    enabled: !!gameType,
  });

  const gt = (gameType ?? '') as GameType;
  const GameComponent = GAME_REGISTRY[gt];

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <ActivityIndicator color="#6366f1" size="large" />
      </SafeAreaView>
    );
  }

  if (!data || data.puzzleData == null || !GameComponent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }} edges={['top']}>
        <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, marginBottom: 8 }}>
          {!GameComponent ? 'Coming soon' : 'Daily puzzle unavailable'}
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: '#6366f1', fontFamily: 'SpaceGrotesk-Medium', marginTop: 16 }}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top']}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GameComponent
          puzzleId={data.puzzleId}
          puzzleData={data.puzzleData}
          solution={null}
          isDaily
          dailyPuzzleId={data.dailyPuzzleId}
          difficulty={data.difficulty}
        />
      </ErrorBoundary>
    </SafeAreaView>
  );
}