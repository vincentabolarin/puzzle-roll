import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';

interface Props {
  description: string;
  subText?: string;
  onDismiss: () => void;
}

/**
 * Persistent hint box shown below the board.
 * Replaces HintToastView — does not auto-dismiss.
 */
export default function HintBox({ description, subText, onDismiss }: Props) {
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';

  return (
    <View style={[styles.container, {
      backgroundColor: isDark ? '#1f2937' : '#f0f9ff',
      borderColor: isDark ? '#6366f1' : '#a5b4fc',
    }]}>
      <View style={styles.row}>
        <Text style={[styles.icon]}>💡</Text>
        <Text style={[styles.description, { color: t.textPrimary, flex: 1 }]}>
          {description}
        </Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss hint">
          <Text style={{ color: t.textMuted, fontSize: 16, paddingLeft: 8 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {subText ? (
        <Text style={[styles.subText, { color: t.textMuted }]}>{subText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    marginHorizontal: 16,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { fontSize: 14, marginTop: 1 },
  description: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  subText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginLeft: 22 },
});