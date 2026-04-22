import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { queryKeys } from '../../../src/lib/query-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';
import { useAppTheme } from '../../../src/hooks/useAppTheme';
import SudokuGame from '../../../src/components/game/SudokuGame';
import TangoGame from '../../../src/components/game/TangoGame';
import QueensGame from '../../../src/components/game/QueensGame';
import ZipGame from '../../../src/components/game/ZipGame';
import NonogramGame from '../../../src/components/game/NonogramGame';
import MinesweeperGame from '../../../src/components/game/MinesweeperGame';
import KakuroGame from '../../../src/components/game/KakuroGame';
import LightUpGame from '../../../src/components/game/LightUpGame';
import FutoshikiGame from '../../../src/components/game/FutoshikiGame';
import HitoriGame from '../../../src/components/game/HitoriGame';

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

  const { data, isLoading } = useQuery({
    // queryKey: queryKeys.puzzles.daily(gameType ?? ''),
    queryKey: ['daily-puzzle', gameType, today],

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
      // Guard: API returns puzzle nested under .puzzle
      if (!result.puzzle || result.puzzle.puzzleData == null) {
        throw new Error('Daily puzzle data unavailable');
      }
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
        />
      </ErrorBoundary>
    </SafeAreaView>
  );
}