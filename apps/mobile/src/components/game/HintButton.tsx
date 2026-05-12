import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import { useAppTheme } from '../../hooks/useAppTheme';

interface HintButtonProps {
  hintsRemaining: number;
  onPress: () => void;
  disabled?: boolean;
  cooldownProgress?: SharedValue<number>;
}

export default function HintButton({ hintsRemaining, onPress, disabled, cooldownProgress }: HintButtonProps) {
  const hasHints = hintsRemaining > 0;
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${(cooldownProgress?.value ?? 0) * 100}%`,
  }));

  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.btn,
          {
            backgroundColor: hasHints ? (isDark ? '#1f2937' : '#f3f4f6') : '#451a03',
            borderColor: hasHints ? t.border : '#92400e',
            opacity: disabled ? 0.6 : 1,
          },
        ]}
        accessibilityLabel={hasHints ? `Hint — ${hintsRemaining} left` : 'Watch ad for hint'}
        accessibilityRole="button"
      >
        <View style={styles.topRow}>
          <Text style={styles.icon}>💡</Text>
          <Text style={[styles.count, { color: hasHints ? t.textPrimary : '#fbbf24' }]}>
            {hasHints ? hintsRemaining : '+'}
          </Text>
        </View>
      </TouchableOpacity>
      {disabled && cooldownProgress && (
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, progressBarStyle]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 52,
    minHeight: 52,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  icon: { fontSize: 14 },
  count: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 13 },
  label: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 9, lineHeight: 13, marginTop: 1 },
  progressTrack: { height: 2, backgroundColor: 'transparent', borderRadius: 1, marginTop: 2, overflow: 'hidden' },
  progressBar: { height: 2, backgroundColor: '#6366f1', borderRadius: 1 },
});