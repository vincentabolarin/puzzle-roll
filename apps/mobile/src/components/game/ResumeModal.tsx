import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ResumeModalProps {
  visible: boolean;
  elapsedSeconds: number;
  onContinue: () => void;
  onRestart: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ResumeModal({
  visible,
  elapsedSeconds,
  onContinue,
  onRestart,
}: ResumeModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>🔄</Text>
          <Text style={styles.title}>Continue puzzle?</Text>
          <Text style={styles.subtitle}>
            You have a saved session at {formatTime(elapsedSeconds)}.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onContinue}
            accessibilityLabel="Continue saved game"
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onRestart}
            accessibilityLabel="Start fresh"
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Start fresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  icon: { fontSize: 40, marginBottom: 12 },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    color: '#f9fafb',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: '#1f2937',
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  secondaryText: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: 16,
    color: '#9ca3af',
  },
});