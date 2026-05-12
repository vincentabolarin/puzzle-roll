import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

interface Props {
  visible: boolean;
  localCount: number;
  cloudCount: number;
  onKeepLocal: () => void;
  onKeepCloud: () => void;
  onMergeBoth: () => void;
}

export default function ProgressMergeModal({ visible, localCount, cloudCount, onKeepLocal, onKeepCloud, onMergeBoth }: Props) {
  const t = useAppTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={onMergeBoth}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={[styles.title, { color: t.textPrimary }]}>Sync Progress</Text>
          <Text style={[styles.message, { color: t.textSecondary }]}>
            Your device and account have different progress. How would you like to proceed?
          </Text>

          <View style={[styles.row, { backgroundColor: t.surface2, borderColor: t.border }]}>
            <View style={styles.half}>
              <Text style={[styles.countLabel, { color: t.textMuted }]}>This device</Text>
              <Text style={[styles.count, { color: t.textPrimary }]}>{localCount}</Text>
              <Text style={[styles.countSub, { color: t.textMuted }]}>unique {localCount === 1 ? 'puzzle' : 'puzzles'}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: t.border }]} />
            <View style={styles.half}>
              <Text style={[styles.countLabel, { color: t.textMuted }]}>Your account</Text>
              <Text style={[styles.count, { color: t.textPrimary }]}>{cloudCount}</Text>
              <Text style={[styles.countSub, { color: t.textMuted }]}>unique {cloudCount === 1 ? 'puzzle' : 'puzzles'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, styles.primaryBtn, { backgroundColor: t.accent }]}
            onPress={onMergeBoth}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Merge both</Text>
            <Text style={[styles.btnSub, { color: 'rgba(255,255,255,0.7)' }]}>Keep all progress from device and account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.secondaryBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
            onPress={onKeepLocal}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: t.textPrimary }]}>Keep device progress</Text>
            <Text style={[styles.btnSub, { color: t.textMuted }]}>Discard account progress</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.secondaryBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
            onPress={onKeepCloud}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: t.textPrimary }]}>Use account progress</Text>
            <Text style={[styles.btnSub, { color: t.textMuted }]}>Discard device progress</Text>
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
  card: { width: '100%', borderRadius: 20, padding: 24, borderWidth: 1, gap: 12 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 18 },
  message: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  half: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  divider: { width: 1 },
  countLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 11, marginBottom: 4 },
  count: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28 },
  countSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginTop: 2 },
  btn: { borderRadius: 13, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  primaryBtn: {},
  secondaryBtn: { borderWidth: 1 },
  primaryText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, color: '#ffffff' },
  secondaryText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  btnSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginTop: 2 },
});