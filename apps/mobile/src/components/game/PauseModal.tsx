import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface PauseModalProps {
  visible: boolean;
  elapsedSeconds: number;
  hintsUsed: number;
  hintsRemaining: number;
  gameName: string;
  onResume: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function PauseModal({
  visible, elapsedSeconds, hintsUsed, hintsRemaining, gameName, onResume,
}: PauseModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      {/*
        BlurView fills the entire screen. The game board renders behind this modal
        (not unmounted), and BlurView blurs everything behind it so the player
        cannot see or interact with the puzzle while paused.
      */}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.pauseIcon}>⏸</Text>
            <Text style={styles.title}>Paused</Text>
            <Text style={styles.subtitle}>{gameName}</Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatTime(elapsedSeconds)}</Text>
                <Text style={styles.statLabel}>Time</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{hintsUsed}</Text>
                <Text style={styles.statLabel}>Hints used</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{hintsRemaining}</Text>
                <Text style={styles.statLabel}>Hints left</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.resumeBtn}
              onPress={onResume}
              accessibilityLabel="Resume game"
              accessibilityRole="button"
            >
              <Text style={styles.resumeText}>▶  Resume</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card: {
    backgroundColor: '#0f1322ee', borderRadius: 24, padding: 32,
    width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#374151',
  },
  pauseIcon: { fontSize: 44, marginBottom: 10 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24, color: '#f9fafb', marginBottom: 4 },
  subtitle: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: '#9ca3af', marginBottom: 28 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, width: '100%' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'JetBrainsMono-Regular', fontSize: 22, color: '#f9fafb', marginBottom: 4 },
  statLabel: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, color: '#6b7280' },
  statDivider: { width: 1, height: 40, backgroundColor: '#374151' },
  resumeBtn: {
    backgroundColor: '#6366f1', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 48, width: '100%', alignItems: 'center',
  },
  resumeText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 18, color: '#ffffff' },
});