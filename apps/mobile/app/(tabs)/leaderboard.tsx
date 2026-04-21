import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { GameType } from '@puzzle-roll/shared';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { useAuthStore } from '../../src/stores/auth.store';
import { useAppTheme } from '../../src/hooks/useAppTheme';

const GAME_LABELS: Record<GameType, string> = {
  [GameType.SUDOKU]:'Sudoku',[GameType.QUEENS]:'Queens',[GameType.ZIP]:'Zip',
  [GameType.TANGO]:'Tango',[GameType.NONOGRAM]:'Nonogram',[GameType.MINESWEEPER]:'Minesweeper',
  [GameType.KAKURO]:'Kakuro',[GameType.LIGHT_UP]:'Light Up',[GameType.FUTOSHIKI]:'Futoshiki',[GameType.HITORI]:'Hitori',
};

interface LeaderboardEntry { rank: number; userId: string; username: string; elapsedSeconds: number; hintsUsed: number; completedAt: string; }
function formatTime(s: number): string { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }

export default function LeaderboardScreen() {
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.SUDOKU);
  const { user } = useAuthStore();
  const t = useAppTheme();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.leaderboard.daily(selectedGame),
    queryFn: () => apiClient.get<{ gameType: string; date: string; entries: LeaderboardEntry[]; userEntry: LeaderboardEntry | null }>(
      `/leaderboard/${selectedGame}/daily`
    ),
    enabled: !!user,
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <View style={styles.topSection}>
        <Text style={[styles.heading, { color: t.textPrimary }]}>Daily Leaderboard</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {Object.values(GameType).map((gt) => {
              const active = selectedGame === gt;
              return (
                <TouchableOpacity
                  key={gt}
                  onPress={() => setSelectedGame(gt)}
                  style={[styles.chip, { backgroundColor: active ? '#6366f1' : t.surface, borderColor: active ? '#6366f1' : t.border }]}
                  accessibilityLabel={GAME_LABELS[gt]} accessibilityRole="tab"
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : t.textSecondary }]}>{GAME_LABELS[gt]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={t.accent} /></View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {data?.userEntry && (
            <View style={[styles.userEntry, { borderColor: t.accent + '55', backgroundColor: t.accent + '11' }]}>
              <View style={[styles.userEntryLabel, { backgroundColor: t.accent + '22' }]}>
                <Text style={[styles.userEntryLabelText, { color: t.accent }]}>Your result</Text>
              </View>
              <EntryRow entry={data.userEntry} isCurrentUser t={t} />
            </View>
          )}
          <View style={[styles.table, { borderColor: t.borderSubtle, backgroundColor: t.surface }]}>
            {(data?.entries ?? []).map((entry) => (
              <EntryRow key={entry.userId} entry={entry} isCurrentUser={entry.userId === user?.id} t={t} />
            ))}
            {(data?.entries ?? []).length === 0 && (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: t.textSecondary }]}>No completions yet today. Be the first!</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function EntryRow({ entry, isCurrentUser, t }: { entry: LeaderboardEntry; isCurrentUser: boolean; t: ReturnType<typeof useAppTheme> }) {
  const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
  return (
    <View style={[styles.entryRow, isCurrentUser && { backgroundColor: t.accent + '18' }]}>
      <Text style={[styles.rank, { color: t.textSecondary }]}>{medal ?? entry.rank}</Text>
      <Text style={[styles.username, { color: isCurrentUser ? t.accent : t.textPrimary }]} numberOfLines={1}>
        {isCurrentUser ? 'You' : entry.username}
      </Text>
      <Text style={[styles.entryTime, { color: t.textSecondary }]}>{formatTime(entry.elapsedSeconds)}</Text>
      {entry.hintsUsed > 0 && <Text style={[styles.hints, { color: t.textMuted }]}>{entry.hintsUsed}💡</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  heading: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 26, marginBottom: 14 },
  chipScroll: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 13 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userEntry: { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  userEntryLabel: { paddingHorizontal: 14, paddingVertical: 6 },
  userEntryLabelText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  table: { marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  rank: { fontFamily: 'JetBrainsMono-Regular', width: 32, fontSize: 13 },
  username: { flex: 1, fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  entryTime: { fontFamily: 'JetBrainsMono-Regular', fontSize: 13 },
  hints: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, marginLeft: 8 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14 },
});