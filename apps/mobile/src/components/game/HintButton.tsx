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
      {/* Horizontal layout: icon → count — matches other action buttons */}
      <Text style={styles.icon}>💡</Text>
      <Text style={[styles.count, { color: hasHints ? t.textPrimary : '#fbbf24' }]}>
        {hasHints ? hintsRemaining : '+'}
      </Text>
      <Text style={[styles.label, { color: t.textMuted }]}>Hint</Text>
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
  icon: { fontSize: 14, lineHeight: 17 },
  count: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 13, lineHeight: 16 },
  label: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 9, lineHeight: 12 },
});