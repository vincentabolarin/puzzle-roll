import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { ReactNode } from 'react';
import { router } from 'expo-router';
import { GameType } from '@puzzle-roll/shared';
import { useAppTheme } from '../../hooks/useAppTheme';
import GameTimer from './GameTimer';
import HintButton from './HintButton';
import PauseModal from './PauseModal';
import CompletionModal from './CompletionModal';

interface GenericGameScreenProps {
  puzzleId: string;
  gameType: GameType;
  gameName: string;
  /** Accent colour used for future theming / per-game tinting. */
  accentColor: string;
  children: ReactNode;
  isSolved: boolean;
  elapsedSeconds: number;
  hintsUsed: number;
  hintsRemaining: number;
  isPaused: boolean;
  isDaily: boolean;
  shareableResult: string;
  onPauseToggle: () => void;
  onReset: () => void;
  onGetHint: () => void;
  onClose?: () => void;
  /** Wrap children in a ScrollView when the board may overflow the screen. */
  scrollable?: boolean;
}

export default function GenericGameScreen({
  gameType, gameName, accentColor, children,
  isSolved, elapsedSeconds, hintsUsed, hintsRemaining,
  isPaused, isDaily, shareableResult,
  onPauseToggle, onReset, onGetHint, onClose, scrollable = false,
}: GenericGameScreenProps) {
  const t = useAppTheme();
  const handleClose = onClose ?? (() => router.back());
  const isDark = t.background !== '#f9fafb';
  const iconColor = isDark ? '#e5e7eb' : '#374151';

  const Board = scrollable ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.boardScroll}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.boardContainer}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backText, { color: t.textSecondary }]}>←</Text>
        </TouchableOpacity>

        <GameTimer />

        <View style={styles.headerRight}>
          <HintButton hintsRemaining={hintsRemaining} onPress={onGetHint} />

          <TouchableOpacity
            onPress={onReset}
            style={[styles.headerBtn, styles.iconBtn, { backgroundColor: t.surface2 }]}
            accessibilityLabel="Reset board"
          >
            <Text style={styles.iconText}>🔄</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onPauseToggle}
            style={[styles.headerBtn, styles.iconBtn, { backgroundColor: t.surface2 }]}
            accessibilityLabel={isPaused ? 'Resume' : 'Pause'}
          >
            <Text style={[styles.pauseIcon, { color: iconColor }]}>
              {isPaused ? '▶' : '⏸'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {Board}

      <PauseModal
        visible={isPaused && !isSolved}
        elapsedSeconds={elapsedSeconds}
        hintsUsed={hintsUsed}
        hintsRemaining={hintsRemaining}
        gameName={gameName}
        onResume={onPauseToggle}
      />

      {isSolved && (
        <CompletionModal
          gameType={gameType}
          elapsedSeconds={elapsedSeconds}
          hintsUsed={hintsUsed}
          isDaily={isDaily}
          shareableResult={shareableResult}
          onClose={handleClose}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, paddingTop: 14,
  },
  headerBtn: {
    padding: 8, minWidth: 40, minHeight: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  iconBtn: { borderRadius: 10 },
  backText: { fontSize: 22 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconText: { fontSize: 15 },
  pauseIcon: { fontSize: 16 },
  boardContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  boardScroll: { alignItems: 'center', padding: 8, paddingBottom: 32 },
});