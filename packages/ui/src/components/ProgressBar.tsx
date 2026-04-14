import { View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface ProgressBarProps {
  progress: number; // 0–1
  color?: string;
  trackColor?: string;
  height?: number;
  borderRadius?: number;
}

export function ProgressBar({
  progress,
  color = '#6366f1',
  trackColor = '#1f2937',
  height = 6,
  borderRadius = 3,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const fillStyle = useAnimatedStyle(() => ({
    width: withTiming(`${clampedProgress * 100}%` as unknown as number, { duration: 400 }),
  }));

  return (
    <View
      style={{
        height,
        backgroundColor: trackColor,
        borderRadius,
        overflow: 'hidden',
      }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clampedProgress * 100) }}
    >
      <Animated.View
        style={[
          fillStyle,
          { height, backgroundColor: color, borderRadius },
        ]}
      />
    </View>
  );
}
