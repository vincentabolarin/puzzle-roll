/**
 * ConfirmModal.tsx
 * Place at: apps/mobile/src/components/ui/ConfirmModal.tsx
 *
 * Replaces Alert.alert throughout the app with a themed, appealing modal.
 *
 * Usage:
 *   <ConfirmModal
 *     visible={showConfirm}
 *     title="Reset board?"
 *     message="This will clear all your progress on this puzzle."
 *     confirmLabel="Reset"
 *     confirmDanger
 *     onConfirm={() => { handleReset(); setShowConfirm(false); }}
 *     onCancel={() => setShowConfirm(false)}
 *   />
 */
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  confirmDanger = false,
  onConfirm, onCancel,
}: ConfirmModalProps) {
  const t = useAppTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={[styles.title, { color: t.textPrimary }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: t.textSecondary }]}>{message}</Text> : null}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
              onPress={onCancel}
              accessibilityLabel={cancelLabel}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: t.textSecondary }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn, { backgroundColor: confirmDanger ? '#dc2626' : t.accent }]}
              onPress={onConfirm}
              accessibilityLabel={confirmLabel}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  card: {
    width: '100%', borderRadius: 20, padding: 24,
    borderWidth: 1,
  },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 18, marginBottom: 8 },
  message: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { borderWidth: 1 },
  confirmBtn: {},
  cancelText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 15 },
  confirmText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, color: '#ffffff' },
});