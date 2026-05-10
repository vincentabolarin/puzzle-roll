import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';

interface Props { msg: string }

export default function HintToastView({ msg }: Props) {
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';
  return (
    <View style={[styles.container, {
      backgroundColor: isDark ? '#1f2937' : '#f0f9ff',
      borderColor: isDark ? '#6366f1' : '#a5b4fc',
    }]}>
      <Text style={[styles.text, { color: t.textPrimary }]}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  text: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 13, lineHeight: 19 },
});