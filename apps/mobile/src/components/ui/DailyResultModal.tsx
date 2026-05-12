import { Modal, View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

interface Props {
  visible: boolean;
  shareableResult: string;
  onClose: () => void;
}

export default function DailyResultModal({ visible, shareableResult, onClose }: Props) {
  const t = useAppTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={styles.emoji}>🏆</Text>
          <Text style={[styles.title, { color: t.textPrimary }]}>Already completed!</Text>
          <Text style={[styles.message, { color: t.textSecondary }]}>
            You already solved today's puzzle. Come back tomorrow for a new challenge.
          </Text>
          <View style={[styles.resultBox, { backgroundColor: t.surface2, borderColor: t.border }]}>
            <Text style={[styles.resultText, { color: t.textPrimary }]}>{shareableResult}</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: t.accent }]}
            onPress={() => Share.share({ message: shareableResult })}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Share result</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: t.border }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: t.textSecondary }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  card: { width: '100%', borderRadius: 20, padding: 24, borderWidth: 1, alignItems: 'center', gap: 12 },
  emoji: { fontSize: 40 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 20 },
  message: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  resultBox: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14 },
  resultText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, lineHeight: 20 },
  btn: { width: '100%', borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, color: '#fff' },
  secondaryBtn: { width: '100%', borderRadius: 13, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  secondaryText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
});