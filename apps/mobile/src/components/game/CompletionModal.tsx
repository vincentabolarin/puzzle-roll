import { View, Text, TouchableOpacity, Share, Modal, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { GameType } from '@puzzle-roll/shared';
import { useAppTheme } from '../../hooks/useAppTheme';

interface CompletionModalProps {
  gameType: GameType;
  elapsedSeconds: number;
  hintsUsed: number;
  isDaily: boolean;
  shareableResult: string;
  /** Current streak after completion — passed from game onSuccess */
  streak?: number;
  onClose: () => void;
  onNextPuzzle?: () => void;
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

const GAME_LABELS: Partial<Record<GameType, string>> = {
  [GameType.SUDOKU]: 'Sudoku', [GameType.QUEENS]: 'Queens', [GameType.ZIP]: 'Zip',
  [GameType.TANGO]: 'Tango', [GameType.NONOGRAM]: 'Nonogram',
  [GameType.MINESWEEPER]: 'Minesweeper', [GameType.KAKURO]: 'Kakuro',
  [GameType.LIGHT_UP]: 'Light Up', [GameType.FUTOSHIKI]: 'Futoshiki', [GameType.HITORI]: 'Hitori',
};

export default function CompletionModal({ gameType, elapsedSeconds, hintsUsed, isDaily, shareableResult, streak, onClose, onNextPuzzle }: CompletionModalProps) {
  const t = useAppTheme();
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }], opacity: opacity.value,
  }));

  useEffect(() => {
    scale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 180 }));
    opacity.value = withDelay(100, withTiming(1, { duration: 200 }));
  }, []);

  // If streak is available, rebuild share text with it; otherwise use the pre-built string
  const shareText = shareableResult;

  const handleShare = async () => {
    try { await Share.share({ message: shareText }); } catch {}
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, containerStyle, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <View style={styles.header}>
            <Text style={styles.emoji}>🎉</Text>
            <Text style={[styles.title, { color: t.textPrimary }]}>
              {isDaily ? 'Daily complete!' : 'Puzzle solved!'}
            </Text>
            <Text style={[styles.subtitle, { color: t.textSecondary }]}>{GAME_LABELS[gameType]}</Text>
            {isDaily && streak != null && streak > 1 && (
              <Text style={[styles.streakBadge, { color: '#f97316' }]}>🔥 {streak}-day streak</Text>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: t.surface2 }]}>
              <Text style={[styles.statLabel, { color: t.textSecondary }]}>Time</Text>
              <Text style={[styles.statValue, { color: t.textPrimary }]}>{formatTime(elapsedSeconds)}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: t.surface2 }]}>
              <Text style={[styles.statLabel, { color: t.textSecondary }]}>Hints</Text>
              <Text style={[styles.statValue, { color: t.textPrimary }]}>{hintsUsed === 0 ? '—' : hintsUsed}</Text>
            </View>
          </View>

          {isDaily && (
            <View style={[styles.sharePreview, { backgroundColor: t.surface2 }]}>
              <Text style={[styles.shareText, { color: t.textSecondary }]}>{shareableResult}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {onNextPuzzle && (
              <TouchableOpacity
                onPress={onNextPuzzle}
                style={styles.nextBtn}
                accessibilityLabel="Next puzzle"
              >
                <Text style={styles.primaryBtnText}>Next puzzle →</Text>
              </TouchableOpacity>
            )}
            {isDaily && (
              <TouchableOpacity onPress={handleShare} style={styles.primaryBtn} accessibilityLabel="Share result">
                <Text style={styles.primaryBtnText}>Share result</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onClose}
              style={[styles.secondaryBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
              accessibilityLabel="Back to menu"
            >
              <Text style={[styles.secondaryBtnText, { color: t.textPrimary }]}>Back to menu</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: { width: '100%', borderRadius: 28, padding: 28, borderWidth: 1 },
  header: { alignItems: 'center', marginBottom: 20 },
  emoji: { fontSize: 52, marginBottom: 10 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24, marginBottom: 4 },
  subtitle: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14 },
  streakBadge: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center' },
  statLabel: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 4 },
  statValue: { fontFamily: 'JetBrainsMono-Regular', fontSize: 22 },
  sharePreview: { borderRadius: 12, padding: 14, marginBottom: 20 },
  shareText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 12, lineHeight: 18 },
  actions: { gap: 10 },
  nextBtn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 16 },
  secondaryBtn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 16 },
});