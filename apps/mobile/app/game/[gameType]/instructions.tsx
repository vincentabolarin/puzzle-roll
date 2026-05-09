import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameType } from '@puzzle-roll/shared';
import { useTheme } from '../../_layout';
import { themes } from '../../../src/lib/theme';

interface InstructionSet {
  title: string;
  emoji: string;
  objective: string;
  rules: string[];
  tips: string[];
}

const INSTRUCTIONS: Record<string, InstructionSet> = {
  [GameType.SUDOKU]: {
    title: 'Sudoku', emoji: '🔢',
    objective: 'Fill every cell in the 9×9 grid so that each row, column, and 3×3 box contains the digits 1–9 exactly once.',
    rules: [
      'Each row must contain 1–9 with no repeats.',
      'Each column must contain 1–9 with no repeats.',
      'Each 3×3 box must contain 1–9 with no repeats.',
      'Grey cells are given — you cannot change them.',
    ],
    tips: [
      'Use Notes mode (✏️) to pencil in candidates before committing.',
      'Look for rows/columns where only one digit is missing — fill those first.',
      'Enable Auto-remove notes in Settings to speed up your solving.',
      'Tap a filled cell to highlight all cells with the same digit.',
    ],
  },
  [GameType.QUEENS]: {
    title: 'Queens', emoji: '👑',
    objective: 'Place exactly one queen in each coloured region, row, and column so that no two queens touch — not even diagonally.',
    rules: [
      'One queen per row, one per column.',
      'One queen per coloured region.',
      'No two queens may be adjacent — including diagonally.',
    ],
    tips: [
      'Start with the smallest regions — they have the fewest options.',
      'If a row has only one available column, place the queen there.',
      'Tap once to mark a cell with ×, tap again to place a queen.',
    ],
  },
  [GameType.ZIP]: {
    title: 'Zip', emoji: '🔗',
    objective: 'Draw a single continuous path that visits every cell exactly once, passing through the numbered waypoints in order.',
    rules: [
      'The path must visit every cell in the grid exactly once.',
      'The path must pass through waypoints 1, 2, 3… in order.',
      'The path can only move horizontally or vertically — never diagonally.',
      'Thick lines between cells are walls — the path cannot cross them.',
    ],
    tips: [
      'Work from one waypoint to the next rather than the full grid at once.',
      'Dead-end corridors must be entered and exited through the same opening — plan ahead.',
      'If you get stuck, use the hint to reveal the next step.',
    ],
  },
  [GameType.TANGO]: {
    title: 'Tango', emoji: '☯️',
    objective: 'Fill the grid with blue and yellow circles so that rows, columns, and constraints are all satisfied.',
    rules: [
      'Each row and column must have exactly equal numbers of blue and yellow circles.',
      'No three consecutive circles of the same colour in a row or column.',
      '= means adjacent cells must be the same colour; × means they must differ.',
    ],
    tips: [
      'If a row already has half blues, the remaining empty cells must all be yellow.',
      'Look for runs of two identical colours — the next cell must be the opposite.',
      'Constraints (= and ×) near corners give strong deductions.',
    ],
  },
  [GameType.NONOGRAM]: {
    title: 'Nonogram', emoji: '🖼️',
    objective: 'Fill cells to reveal a hidden picture. The numbers tell you the lengths of filled blocks in each row and column.',
    rules: [
      'A clue like "3 2" means a run of 3 filled cells, then a gap, then a run of 2.',
      'There must be at least one empty cell between separate runs.',
      'Tap to fill a cell; long-press (or double-tap) to mark it as known-empty (×).',
    ],
    tips: [
      'Overlap technique: if a clue is longer than half the row, the middle cells are definitely filled.',
      'A clue of 0 means the entire row/column is empty.',
      'Use the × marker to rule out cells — it prevents accidental fills.',
    ],
  },
  [GameType.MINESWEEPER]: {
    title: 'Minesweeper', emoji: '💣',
    objective: 'Reveal all safe cells without detonating a mine. Numbers show how many mines are adjacent to that cell.',
    rules: [
      'Tap a cell to reveal it.',
      'A revealed number tells you how many of the 8 surrounding cells contain mines.',
      'Flag a cell (long-press) to mark it as a suspected mine.',
      'Revealing a mine ends the game.',
    ],
    tips: [
      'If a "1" has only one unrevealed neighbour, that neighbour is definitely a mine — flag it.',
      'If all mines around a number are flagged, safely reveal the remaining neighbours.',
      'Corners and edges have fewer neighbours — use them to anchor deductions.',
    ],
  },
  [GameType.KAKURO]: {
    title: 'Kakuro', emoji: '➕',
    objective: 'Fill white cells with digits 1–9 so that each run of cells adds up to its clue, with no repeated digits in a run.',
    rules: [
      'Each white cell contains one digit from 1 to 9.',
      'No digit may repeat within a single across or down run.',
      'The sum of each run must equal its black-cell clue.',
    ],
    tips: [
      'A run of 2 that sums to 3 can only be 1+2. Use sum tables to eliminate candidates quickly.',
      'Cells where across and down runs intersect narrow down possibilities significantly.',
      'Start with the longest runs that have the most restrictive sums.',
    ],
  },
  [GameType.LIGHT_UP]: {
    title: 'Light Up', emoji: '💡',
    objective: 'Place light bulbs to illuminate every white cell. Bulbs illuminate in straight lines until blocked by a black cell.',
    rules: [
      'A light bulb illuminates all cells in its row and column until a black cell blocks the path.',
      'Two bulbs may never shine on each other.',
      'Black cells with numbers must have exactly that many bulbs directly adjacent.',
      'Every white cell must be illuminated.',
    ],
    tips: [
      'A "0" black cell means none of its four neighbours can have a bulb — mark them safe.',
      'A "4" black cell means all four neighbours must have bulbs — place them immediately.',
      'An isolated white cell (surrounded on 3+ sides) has very few valid bulb positions.',
    ],
  },
  [GameType.FUTOSHIKI]: {
    title: 'Futoshiki', emoji: '⚖️',
    objective: 'Fill the grid with digits so each row and column contains each number exactly once, while satisfying the inequality signs.',
    rules: [
      'Each row and column must contain each digit from 1 to the grid size exactly once.',
      '< and > signs between cells mean the left/top cell must be less than or greater than the right/bottom cell.',
    ],
    tips: [
      'A long chain of inequalities (1 < 2 < 3 < 4) pins the minimum and maximum values firmly.',
      'If a cell must be greater than all its neighbours, it is probably the largest value.',
      'Fill in cells with the fewest valid candidates first.',
    ],
  },
  [GameType.HITORI]: {
    title: 'Hitori', emoji: '⬛',
    objective: 'Shade cells to eliminate duplicate numbers in rows and columns, while keeping all unshaded cells connected.',
    rules: [
      'No row or column may contain the same digit twice among unshaded cells.',
      'Two shaded cells may never be adjacent horizontally or vertically.',
      'All unshaded cells must form a single connected region.',
    ],
    tips: [
      'If shading a cell would disconnect the unshaded region, that cell must stay unshaded.',
      'If a digit appears three times in a row, the middle occurrence must be shaded.',
      'Cells adjacent to two shaded cells on two sides must stay unshaded to maintain connectivity.',
    ],
  },
};

export default function InstructionsScreen() {
  const { gameType } = useLocalSearchParams<{ gameType: GameType }>();
  const resolvedTheme = useTheme();
  const t = themes[resolvedTheme];
  const info = INSTRUCTIONS[gameType ?? ''];

  if (!info) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: t.textSecondary }]}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.heading, { color: t.textPrimary }]}>Instructions not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
        <Text style={[styles.backText, { color: t.textSecondary }]}>← Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroRow}>
          <Text style={styles.heroEmoji}>{info.emoji}</Text>
          <Text style={[styles.heading, { color: t.textPrimary }]}>{info.title}</Text>
        </View>

        {/* Objective */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={[styles.cardTitle, { color: t.accent }]}>Objective</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>{info.objective}</Text>
        </View>

        {/* Rules */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={[styles.cardTitle, { color: t.textPrimary }]}>Rules</Text>
          {info.rules.map((rule, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={[styles.bullet, { color: t.accent }]}>•</Text>
              <Text style={[styles.body, { color: t.textSecondary, flex: 1 }]}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Tips */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={[styles.cardTitle, { color: t.textPrimary }]}>Tips</Text>
          {info.tips.map((tip, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={[styles.bullet, { color: '#f59e0b' }]}>💡</Text>
              <Text style={[styles.body, { color: t.textSecondary, flex: 1 }]}>{tip}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.playBtn, { backgroundColor: t.accent }]}
          accessibilityLabel="Start playing"
        >
          <Text style={styles.playBtnText}>Start playing →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  backBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  backText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 15 },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  heroEmoji: { fontSize: 40 },
  heading: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  cardTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, marginBottom: 10 },
  body: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, lineHeight: 21 },
  listRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bullet: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 16, lineHeight: 21 },
  playBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  playBtnText: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 16, color: '#ffffff' },
});