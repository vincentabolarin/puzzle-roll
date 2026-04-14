import { View, Text, TouchableOpacity, Share, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { GameType } from '@puzzle-roll/shared';

interface CompletionModalProps {
  gameType: GameType;
  elapsedSeconds: number;
  hintsUsed: number;
  isDaily: boolean;
  shareableResult: string;
  onClose: () => void;
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

const GAME_LABELS: Partial<Record<GameType, string>> = {
  [GameType.SUDOKU]: 'Sudoku',
  [GameType.QUEENS]: 'Queens',
  [GameType.ZIP]: 'Zip',
  [GameType.TANGO]: 'Tango',
  [GameType.NONOGRAM]: 'Nonogram',
  [GameType.MINESWEEPER]: 'Minesweeper',
  [GameType.KAKURO]: 'Kakuro',
  [GameType.LIGHT_UP]: 'Light Up',
  [GameType.FUTOSHIKI]: 'Futoshiki',
  [GameType.HITORI]: 'Hitori',
};

export default function CompletionModal({
  gameType,
  elapsedSeconds,
  hintsUsed,
  isDaily,
  shareableResult,
  onClose,
}: CompletionModalProps) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    scale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 180 }));
    opacity.value = withDelay(100, withTiming(1, { duration: 200 }));
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({ message: shareableResult });
    } catch {
      // User cancelled or share failed — silent
    }
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View className="flex-1 bg-black/70 items-center justify-center px-6">
        <Animated.View
          style={containerStyle}
          className="bg-surface rounded-3xl p-8 w-full border border-border-subtle"
        >
          {/* Header */}
          <View className="items-center mb-6">
            <Text className="text-5xl mb-3">🎉</Text>
            <Text className="text-text-primary font-sans-bold text-2xl">
              {isDaily ? 'Daily complete!' : 'Puzzle solved!'}
            </Text>
            <Text className="text-text-secondary font-sans text-sm mt-1">
              {GAME_LABELS[gameType]}
            </Text>
          </View>

          {/* Stats */}
          <View className="flex-row gap-4 mb-6">
            <View className="flex-1 bg-surface-2 rounded-2xl p-4 items-center">
              <Text className="text-text-secondary font-sans text-xs mb-1">Time</Text>
              <Text className="text-text-primary font-mono text-xl font-bold">
                {formatTime(elapsedSeconds)}
              </Text>
            </View>
            <View className="flex-1 bg-surface-2 rounded-2xl p-4 items-center">
              <Text className="text-text-secondary font-sans text-xs mb-1">Hints</Text>
              <Text className="text-text-primary font-mono text-xl font-bold">
                {hintsUsed === 0 ? '—' : hintsUsed}
              </Text>
            </View>
          </View>

          {/* Shareable preview */}
          {isDaily && (
            <View className="bg-navy-900 rounded-2xl p-4 mb-6">
              <Text className="text-text-secondary font-mono text-xs leading-5">
                {shareableResult}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View className="gap-3">
            {isDaily && (
              <TouchableOpacity
                onPress={handleShare}
                className="bg-game-sudoku rounded-2xl py-4 items-center"
                accessibilityLabel="Share your result"
                accessibilityRole="button"
              >
                <Text className="text-white font-sans-bold text-base">Share result</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onClose}
              className="bg-surface-2 rounded-2xl py-4 items-center border border-border"
              accessibilityLabel="Back to game menu"
              accessibilityRole="button"
            >
              <Text className="text-text-primary font-sans-medium text-base">Back to menu</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
