import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameSessionStore } from '../../stores/game-session.store';
import { useAppTheme } from '../../hooks/useAppTheme';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GameTimer() {
  const { session, pauseTimer, resumeTimer } = useGameSessionStore();
  const t = useAppTheme();

  if (!session) return null;

  return (
    <TouchableOpacity
      onPress={session.isPaused ? resumeTimer : pauseTimer}
      style={styles.row}
      accessibilityLabel={session.isPaused ? 'Resume timer' : 'Pause timer'}
      accessibilityRole="button"
    >
      <Text style={[styles.time, { color: t.textPrimary }]}>
        {formatTime(session.elapsedSeconds)}
      </Text>
      <View style={[styles.badge, { backgroundColor: t.surface2 }]}>
        <Text style={[styles.badgeText, { color: t.textSecondary }]}>
          {session.isPaused ? '▶' : '⏸'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { fontFamily: 'JetBrainsMono-Regular', fontSize: 20 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12 },
});