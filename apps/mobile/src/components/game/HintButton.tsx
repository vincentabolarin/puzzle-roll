import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';

interface HintButtonProps {
  hintsRemaining: number;
  onPress: () => void;
  disabled?: boolean;
}

export default function HintButton({ hintsRemaining, onPress, disabled }: HintButtonProps) {
  const hasHints = hintsRemaining > 0;
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        {
          backgroundColor: hasHints ? (isDark ? '#1f2937' : '#f3f4f6') : '#451a03',
          borderColor: hasHints ? t.border : '#92400e',
        },
      ]}
      accessibilityLabel={hasHints ? `Hint — ${hintsRemaining} left` : 'Watch ad for hint'}
      accessibilityRole="button"
    >
      {/* Row 1: icon + count side by side */}
      <View style={styles.topRow}>
        <Text style={styles.icon}>💡</Text>
        <Text style={[styles.count, { color: hasHints ? t.textPrimary : '#fbbf24' }]}>
          {hasHints ? hintsRemaining : '+'}
        </Text>
      </View>
      {/* Row 2: label */}
      {/* <Text style={[styles.label, { color: t.textMuted }]}>Hint</Text> */}
    </TouchableOpacity>
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
});