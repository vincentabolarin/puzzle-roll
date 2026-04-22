import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { GameType } from '@puzzle-roll/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { puzzleCache } from '@/services/puzzle-cache.service';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAppTheme } from '@/hooks/useAppTheme';
import SudokuGame from '@/components/game/SudokuGame';
import TangoGame from '@/components/game/TangoGame';
import QueensGame from '@/components/game/QueensGame';
import ZipGame from '@/components/game/ZipGame';
import NonogramGame from '@/components/game/NonogramGame';
import MinesweeperGame from '@/components/game/MinesweeperGame';
import KakuroGame from '@/components/game/KakuroGame';
import LightUpGame from '@/components/game/LightUpGame';
import FutoshikiGame from '@/components/game/FutoshikiGame';
import HitoriGame from '@/components/game/HitoriGame';

type GameProps = {
  puzzleId: string;
  puzzleData: unknown;
  solution: unknown;
  isDaily: boolean;
  dailyPuzzleId: string | null;
  onNextPuzzle?: () => void;
};

const GAME_COMPONENTS: Partial<Record<GameType, React.ComponentType<GameProps>>> = {
  [GameType.SUDOKU]: SudokuGame,
  [GameType.TANGO]: TangoGame,
  [GameType.QUEENS]: QueensGame,
  [GameType.ZIP]: ZipGame,
  [GameType.NONOGRAM]: NonogramGame,
  [GameType.MINESWEEPER]: MinesweeperGame,
  [GameType.KAKURO]: KakuroGame,
  [GameType.LIGHT_UP]: LightUpGame,
  [GameType.FUTOSHIKI]: FutoshikiGame,
  [GameType.HITORI]: HitoriGame,
};

function GameErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, backgroundColor: t.background }}>
      <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>{error.message}</Text>
      <TouchableOpacity onPress={resetErrorBoundary} style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
        <Text style={{ color: '#fff', fontFamily: 'SpaceGrotesk-Medium' }}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ActivePuzzleScreen() {
  const { gameType, puzzleId } = useLocalSearchParams<{ gameType: string; puzzleId: string }>();
  const { isTablet } = useBreakpoint();
  const t = useAppTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.puzzles.byId(puzzleId ?? ''),
    queryFn: async () => {
      const cached = await puzzleCache.getPuzzleById(puzzleId ?? '');
      if (cached) {
        return {
          id: cached.id,
          gameType: cached.gameType as GameType,
          difficulty: cached.difficulty,
          puzzleData: JSON.parse(cached.puzzleData),
          solution: null,
        };
      }
      return apiClient.get<{ id: string; gameType: GameType; difficulty: string; puzzleData: unknown }>(`/puzzles/id/${puzzleId}`);
    },
    enabled: !!puzzleId,
  });

  const { data: puzzleList } = useQuery({
    queryKey: [...queryKeys.puzzles.byGame(gameType ?? ''), data?.difficulty],
    queryFn: () =>
      apiClient.get<Array<{ id: string }>>(`/puzzles/${gameType}?difficulty=${data!.difficulty}&limit=50`),
    enabled: !!data?.difficulty,
    staleTime: 5 * 60 * 1000,
  });

  const gt = (gameType ?? '') as GameType;
  const GameComponent = GAME_COMPONENTS[gt];

  const handleNextPuzzle = () => {
    if (!puzzleList || !puzzleId) return;
    const idx = puzzleList.findIndex((p) => p.id === puzzleId);
    const next = puzzleList[(idx + 1) % puzzleList.length];
    if (next && next.id !== puzzleId) router.replace(`/game/${gt}/${next.id}`);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <ActivityIndicator color="#6366f1" size="large" />
      </SafeAreaView>
    );
  }

  // Guard: data or puzzleData undefined means loading failed or API returned unexpected shape
  if (error || !data || data.puzzleData == null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }} edges={['top']}>
        <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, marginBottom: 8 }}>Puzzle not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: '#6366f1', fontFamily: 'SpaceGrotesk-Medium' }}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!GameComponent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }} edges={['top']}>
        <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, marginBottom: 8 }}>Coming soon</Text>
        <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          {gt.replace('_', ' ')} is being added in the next update.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: '#6366f1', fontFamily: 'SpaceGrotesk-Medium' }}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top']}>
      <ErrorBoundary FallbackComponent={GameErrorFallback}>
        <View style={{ flex: 1, flexDirection: isTablet ? 'row' : 'column' }}>
          <GameComponent
            puzzleId={data.id}
            puzzleData={data.puzzleData}
            solution={null}
            isDaily={false}
            dailyPuzzleId={null}
            onNextPuzzle={puzzleList && puzzleList.length > 1 ? handleNextPuzzle : undefined}
          />
        </View>
      </ErrorBoundary>
    </SafeAreaView>
  );
}