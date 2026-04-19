/**
 * GenericGameScreen — shared shell used by all non-Sudoku games.
 *
 * Each game supplies a `renderBoard` function that returns the game-specific
 * board UI. The shell handles: pause/resume, hints, timer display, back nav,
 * reset, progress persistence, and the completion modal.
 *
 * Usage:
 *   <GenericGameScreen
 *     puzzleId={puzzleId}
 *     gameType={GameType.TANGO}
 *     gameName="Tango"
 *     accentColor="#f97316"
 *     hintsAvailable
 *     onGetHint={handleHintRequest}
 *     onReset={handleReset}
 *     isSolved={isSolved}
 *     elapsedSeconds={elapsedSeconds}
 *     hintsUsed={hintsUsed}
 *     hintsRemaining={hintsRemaining}
 *     isPaused={isPaused}
 *     onPauseToggle={handlePauseToggle}
 *     isDaily={isDaily}
 *     shareableResult={shareableResult}
 *   >
 *     {renderBoard()}
 *   </GenericGameScreen>
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { GameType } from '@puzzle-roll/shared';
import { ReactNode } from 'react';
import GameTimer from './GameTimer';
import HintButton from './HintButton';
import PauseModal from './PauseModal';
import CompletionModal from './CompletionModal';

interface GenericGameScreenProps {
  puzzleId: string;
  gameType: GameType;
  gameName: string;
  accentColor: string;
  children: ReactNode;               // the board UI
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
  scrollable?: boolean;              // wrap board in ScrollView if it can overflow
}

export default function GenericGameScreen({
  gameType, gameName, children,
  isSolved, elapsedSeconds, hintsUsed, hintsRemaining,
  isPaused, isDaily, shareableResult,
  onPauseToggle, onReset, onGetHint, onClose, scrollable = false,
}: GenericGameScreenProps) {
  const handleClose = onClose ?? (() => router.back());

  const Board = scrollable ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 8, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.boardContainer}>{children}</View>
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Go back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <GameTimer />

        <View style={styles.headerRight}>
          <HintButton hintsRemaining={hintsRemaining} onPress={onGetHint} />
          <TouchableOpacity
            onPress={onReset}
            style={styles.headerBtn}
            accessibilityLabel="Reset board"
          >
            <Text style={styles.headerIcon}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onPauseToggle}
            style={[styles.pauseBtn]}
            accessibilityLabel={isPaused ? 'Resume' : 'Pause'}
          >
            <Text style={styles.pauseIcon}>{isPaused ? '▶' : '⏸'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Board */}
      {Board}

      {/* Pause overlay */}
      <PauseModal
        visible={isPaused && !isSolved}
        elapsedSeconds={elapsedSeconds}
        hintsUsed={hintsUsed}
        hintsRemaining={hintsRemaining}
        gameName={gameName}
        onResume={onPauseToggle}
      />

      {/* Completion */}
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
  root: { flex: 1, backgroundColor: '#060818' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, paddingTop: 14,
  },
  headerBtn: { padding: 8, minWidth: 40, minHeight: 40, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#9ca3af', fontSize: 22 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIcon: { fontSize: 16 },
  pauseBtn: {
    padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1f2937', borderRadius: 10,
  },
  pauseIcon: { fontSize: 18 },
  boardContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
});