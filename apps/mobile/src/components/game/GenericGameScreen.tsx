import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { ReactNode, useState } from 'react';
import { router } from 'expo-router';
import { GameType } from '@puzzle-roll/shared';
import { useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { useAppTheme } from '../../hooks/useAppTheme';
import GameTimer from './GameTimer';
import HintButton from './HintButton';
import PauseModal from './PauseModal';
import CompletionModal from './CompletionModal';

interface GenericGameScreenProps {
  puzzleId: string;
  gameType: GameType;
  gameName: string;
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
  onNextPuzzle?: () => void;
  /** Streak for this game after completion, from onSuccess */
  streak?: number;
  /** 1-based puzzle number shown in header subtitle */
  puzzleNumber?: number;
  /** Difficulty label shown in header subtitle */
  difficulty?: string;
  scrollable?: boolean;
  // Optional extra actions shown in the control bar between Undo and Hint
  // e.g. Notes toggle for Futoshiki/Kakuro
  extraControls?: ReactNode;
  // Show undo button in control bar (default true)
  showUndo?: boolean;
  onUndo?: () => void;
  // Numpads rendered below the control bar (passed as children to the scroll area)
  numpad?: ReactNode;
}

export default function GenericGameScreen({
  gameType, gameName, accentColor, children,
  isSolved, elapsedSeconds, hintsUsed, hintsRemaining,
  isPaused, isDaily, shareableResult,
  onPauseToggle, onReset, onGetHint, onClose, onNextPuzzle,
  streak,
  puzzleNumber,
  difficulty,
  scrollable = false,
  extraControls,
  showUndo = false,
  onUndo,
  numpad,
}: GenericGameScreenProps) {
  const t = useAppTheme();
  const handleClose = onClose ?? (() => router.back());
  const isDark = t.background !== '#f9fafb';
  const actionBg = isDark ? '#1f2937' : '#f3f4f6';
  const iconColor = isDark ? '#e5e7eb' : '#374151';

  const [hintCooldown, setHintCooldown] = useState(false);
  const cooldownProgress = useSharedValue(0);

  const handleGetHint = () => {
    onGetHint();
    setHintCooldown(true);
    cooldownProgress.value = 0;
    cooldownProgress.value = withTiming(1, { duration: 3000 }, (finished) => {
      if (finished) runOnJS(setHintCooldown)(false);
    });
  };

  const controlBar = (
    <View style={styles.controlBar}>
      <View style={styles.actionRow}>
        {showUndo && (
          <TouchableOpacity
            onPress={onUndo}
            style={[styles.actionBtn, { backgroundColor: actionBg, borderColor: t.border }]}
            accessibilityLabel="Undo"
          >
            <Text style={[styles.actionIcon, { color: iconColor }]}>↩</Text>
            <Text style={[styles.actionLabel, { color: t.textMuted }]}>Undo</Text>
          </TouchableOpacity>
        )}

        {extraControls}

        <HintButton hintsRemaining={hintsRemaining} onPress={handleGetHint} disabled={hintCooldown} cooldownProgress={cooldownProgress} />

        <TouchableOpacity
          onPress={onReset}
          style={[styles.actionBtn, { backgroundColor: actionBg, borderColor: t.border }]}
          accessibilityLabel="Reset board"
        >
          <Text style={[styles.actionIcon, { color: iconColor }]}>🔄</Text>
          <Text style={[styles.actionLabel, { color: t.textMuted }]}>Reset</Text>
        </TouchableOpacity>
      </View>

      {numpad && <View style={styles.numpadArea}>{numpad}</View>}
    </View>
  );

  const boardContent = scrollable ? (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.boardScroll} showsVerticalScrollIndicator={false}>
      {children}
      {controlBar}
    </ScrollView>
  ) : (
    <View style={styles.boardContainer}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {children}
        {controlBar}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      {/* Header */}
      <View style={[styles.headerWrap, { borderBottomColor: t.borderSubtle }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Go back">
            <Text style={[styles.backText, { color: t.textSecondary }]}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: t.textPrimary }]} numberOfLines={1}>{gameName}</Text>
            {(difficulty || puzzleNumber != null) && (
              <Text style={[styles.headerSub, { color: t.textMuted }]}>
                {[difficulty && difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase(), puzzleNumber != null && `#${puzzleNumber}`].filter(Boolean).join('  ·  ')}
              </Text>
            )}
          </View>

          <View style={styles.headerRight}>
            <GameTimer />
            <TouchableOpacity
              onPress={onPauseToggle}
              style={[styles.iconBtn, { backgroundColor: t.surface2 }]}
              accessibilityLabel={isPaused ? 'Resume' : 'Pause'}
            >
              <Text style={[styles.pauseIcon, { color: iconColor }]}>{isPaused ? '▶' : '⏸'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {boardContent}

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
          onNextPuzzle={onNextPuzzle}
          streak={streak}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, paddingTop: 10,
  },
  headerBtn: { padding: 8, minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  headerTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, lineHeight: 18 },
  headerSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 10, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { padding: 8, minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  backText: { fontSize: 22 },
  pauseIcon: { fontSize: 16 },
  boardContainer: { flex: 1, paddingTop: 64 },
  boardScroll: { alignItems: 'center', padding: 8, paddingTop: 64, paddingBottom: 8 },
  controlBar: { width: '100%', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  actionRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 10, marginBottom: 12,
  },
  actionBtn: {
    alignItems: 'center', justifyContent: 'center', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12, minWidth: 56, minHeight: 52, borderWidth: 1,
  },
  actionIcon: { fontSize: 16, marginBottom: 2 },
  actionLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 9 },
  numpadArea: { marginTop: 4 },
});