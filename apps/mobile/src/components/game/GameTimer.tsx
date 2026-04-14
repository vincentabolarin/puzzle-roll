import { View, Text, TouchableOpacity } from 'react-native';
import { useGameSessionStore } from '../../stores/game-session.store';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GameTimer() {
  const { session, pauseTimer, resumeTimer } = useGameSessionStore();

  if (!session) return null;

  return (
    <TouchableOpacity
      onPress={session.isPaused ? resumeTimer : pauseTimer}
      className="flex-row items-center gap-2"
      accessibilityLabel={session.isPaused ? 'Resume timer' : 'Pause timer'}
      accessibilityRole="button"
    >
      <Text className="text-text-primary font-mono text-lg">
        {formatTime(session.elapsedSeconds)}
      </Text>
      <Text className="text-text-secondary font-sans text-sm">
        {session.isPaused ? '▶' : '⏸'}
      </Text>
    </TouchableOpacity>
  );
}
