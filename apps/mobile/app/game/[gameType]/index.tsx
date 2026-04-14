import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Difficulty } from '@puzzle-roll/shared';
import { apiClient } from '../../../src/lib/api-client';
import { queryKeys } from '../../../src/lib/query-client';
import { puzzleCache } from '../../../src/services/puzzle-cache.service';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'Easy',
  [Difficulty.MEDIUM]: 'Medium',
  [Difficulty.HARD]: 'Hard',
  [Difficulty.EXPERT]: 'Expert',
};

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  [Difficulty.EASY]: '#22c55e',
  [Difficulty.MEDIUM]: '#f59e0b',
  [Difficulty.HARD]: '#ef4444',
  [Difficulty.EXPERT]: '#a855f7',
};

interface Puzzle {
  id: string;
  gameType: string;
  difficulty: Difficulty;
  createdAt: string;
}

export default function GameLobbyScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: string }>();
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);

  const gameName = (gameType ?? '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: daily } = useQuery({
    queryKey: queryKeys.puzzles.daily(gameType ?? ''),
    queryFn: async () => {
      // Try cache first
      const today = new Date().toISOString().slice(0, 10);
      const cached = await puzzleCache.getDailyPuzzle(gameType ?? '', today);
      if (cached) return cached;
      return apiClient.get(`/puzzles/${gameType}/daily`);
    },
    enabled: !!gameType,
  });

  const { data: puzzles, isLoading } = useQuery({
    queryKey: queryKeys.puzzles.list(gameType ?? '', selectedDifficulty),
    queryFn: async () => {
      // Try cache first
      const cached = await puzzleCache.getPuzzles(gameType ?? '', selectedDifficulty, 20);
      if (cached.length > 0) {
        return cached.map((p) => ({
          id: p.id,
          gameType: p.gameType,
          difficulty: p.difficulty as Difficulty,
          createdAt: new Date(p.cachedAt).toISOString(),
        }));
      }
      const result = await apiClient.get<{ data: Puzzle[] }>(
        `/puzzles/${gameType}?difficulty=${selectedDifficulty}&limit=20`
      );
      return Array.isArray(result) ? result : (result as { data: Puzzle[] }).data ?? [];
    },
    enabled: !!gameType,
  });

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
      <View className="px-4 pt-4 pb-2 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Text className="text-text-secondary text-2xl">←</Text>
        </TouchableOpacity>
        <Text className="text-text-primary font-sans-bold text-2xl">{gameName}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-24">
        {/* Daily puzzle CTA */}
        {daily && (
          <TouchableOpacity
            onPress={() => router.push(`/game/${gameType}/daily`)}
            className="bg-game-sudoku/10 border border-game-sudoku/30 rounded-2xl p-4 mb-6"
            accessibilityLabel="Play today's daily puzzle"
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-game-sudoku font-sans-bold text-base">Today's Daily</Text>
                <Text className="text-text-secondary font-sans text-sm mt-0.5">
                  Compete on the global leaderboard
                </Text>
              </View>
              <Text className="text-3xl">🏆</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Difficulty selector */}
        <View className="flex-row gap-2 mb-4">
          {Object.values(Difficulty).map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setSelectedDifficulty(d)}
              className={`flex-1 py-2 rounded-xl border items-center ${
                selectedDifficulty === d ? 'border-transparent' : 'border-border bg-surface'
              }`}
              style={selectedDifficulty === d ? { backgroundColor: DIFFICULTY_COLORS[d] + '33', borderColor: DIFFICULTY_COLORS[d] } : {}}
              accessibilityLabel={DIFFICULTY_LABELS[d]}
              accessibilityRole="tab"
            >
              <Text
                className="font-sans-medium text-xs"
                style={{ color: selectedDifficulty === d ? DIFFICULTY_COLORS[d] : '#6b7280' }}
              >
                {DIFFICULTY_LABELS[d]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Puzzle list */}
        {isLoading ? (
          <ActivityIndicator color="#6366f1" className="mt-8" />
        ) : (
          <View className="gap-2">
            {(puzzles ?? []).map((puzzle, i) => (
              <TouchableOpacity
                key={puzzle.id}
                onPress={() => router.push(`/game/${gameType}/${puzzle.id}`)}
                className="bg-surface border border-border-subtle rounded-xl px-4 py-3.5 flex-row items-center justify-between"
                accessibilityLabel={`Puzzle ${i + 1}`}
                accessibilityRole="button"
              >
                <Text className="text-text-primary font-sans-medium text-sm">Puzzle {i + 1}</Text>
                <Text className="text-text-secondary font-sans text-xs">Play →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
