import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Line, Rect, Path, Polygon } from 'react-native-svg';
import { GameType } from '@puzzle-roll/shared';
import { useAuthStore } from '../../src/stores/auth.store';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import { queryKeys } from '../../src/lib/query-client';
import { apiClient } from '../../src/lib/api-client';
import { usePuzzleProgressStore } from '../../src/stores/puzzle-progress.store';

const GAME_CONFIGS = [
  { type: GameType.SUDOKU,      name: 'Sudoku',      description: 'Fill the 9×9 grid',       accent: '#6366f1', emoji: '🔢', pattern: 'grid' },
  { type: GameType.QUEENS,      name: 'Queens',      description: 'One queen per region',     accent: '#ec4899', emoji: '👑', pattern: 'diamonds' },
  { type: GameType.ZIP,         name: 'Zip',         description: 'Connect every cell',       accent: '#f59e0b', emoji: '🔗', pattern: 'zigzag' },
  { type: GameType.TANGO,       name: 'Tango',       description: 'Balance suns & moons',     accent: '#f97316', emoji: '☯️', pattern: 'circles' },
  { type: GameType.NONOGRAM,    name: 'Nonogram',    description: 'Reveal the picture',       accent: '#14b8a6', emoji: '🖼️', pattern: 'dots' },
  { type: GameType.MINESWEEPER, name: 'Minesweeper', description: 'Clear the minefield',      accent: '#ef4444', emoji: '💣', pattern: 'triangles' },
  { type: GameType.KAKURO,      name: 'Kakuro',      description: 'Sums in every run',        accent: '#a855f7', emoji: '➕', pattern: 'cross' },
  { type: GameType.LIGHT_UP,    name: 'Light Up',    description: 'Illuminate every cell',    accent: '#eab308', emoji: '💡', pattern: 'rays' },
  { type: GameType.FUTOSHIKI,   name: 'Futoshiki',   description: 'Satisfy inequalities',     accent: '#22c55e', emoji: '⚖️', pattern: 'chevrons' },
  { type: GameType.HITORI,      name: 'Hitori',      description: 'Shade to clear dupes',     accent: '#64748b', emoji: '⬛', pattern: 'squares' },
];

// ─── SVG background patterns ───────────────────────────────────────────────────
function PatternBg({ pattern, color, w, h }: { pattern: string; color: string; w: number; h: number }) {
  const op = '0.13';
  switch (pattern) {
    case 'grid':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: Math.ceil(h / 16) + 1 }, (_, i) => (
            <Line key={`h${i}`} x1="0" y1={i * 16} x2={w} y2={i * 16} stroke={color} strokeWidth="0.8" opacity={op} />
          ))}
          {Array.from({ length: Math.ceil(w / 16) + 1 }, (_, i) => (
            <Line key={`v${i}`} x1={i * 16} y1="0" x2={i * 16} y2={h} stroke={color} strokeWidth="0.8" opacity={op} />
          ))}
        </Svg>
      );
    case 'diamonds':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 5 }, (_, col) => {
              const cx = col * 22 + (row % 2 === 0 ? 0 : 11);
              const cy = row * 18;
              return <Polygon key={`${row},${col}`} points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`} fill="none" stroke={color} strokeWidth="0.9" opacity={op} />;
            })
          )}
        </Svg>
      );
    case 'zigzag':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 6 }, (_, row) => {
            const y = row * 14;
            const pts = Array.from({ length: Math.ceil(w / 10) + 1 }, (_, i) =>
              `${i * 10},${y + (i % 2 === 0 ? 0 : 8)}`
            ).join(' ');
            return <Path key={row} d={`M ${pts.split(' ').map((p, i) => (i === 0 ? `${p}` : `L ${p}`)).join(' ')}`} fill="none" stroke={color} strokeWidth="0.9" opacity={op} />;
          })}
        </Svg>
      );
    case 'circles':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 4 }, (_, col) => (
              <Circle key={`${row},${col}`} cx={col * 22 + 8} cy={row * 20 + 8} r="6" fill="none" stroke={color} strokeWidth="0.9" opacity={op} />
            ))
          )}
          {Array.from({ length: 3 }, (_, row) =>
            Array.from({ length: 3 }, (_, col) => (
              <Circle key={`s${row},${col}`} cx={col * 22 + 19} cy={row * 20 + 18} r="2.5" fill={color} opacity={op} />
            ))
          )}
        </Svg>
      );
    case 'dots':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 7 }, (_, row) =>
            Array.from({ length: 7 }, (_, col) => (
              <Circle key={`${row},${col}`} cx={col * 13 + 4} cy={row * 13 + 4} r={row % 2 === 0 && col % 2 === 0 ? 2.5 : 1.2} fill={color} opacity={op} />
            ))
          )}
        </Svg>
      );
    case 'triangles':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 5 }, (_, col) => {
              const x = col * 20 + (row % 2 === 0 ? 0 : 10);
              const y = row * 16;
              return <Polygon key={`${row},${col}`} points={`${x + 8},${y} ${x + 16},${y + 12} ${x},${y + 12}`} fill="none" stroke={color} strokeWidth="0.9" opacity={op} />;
            })
          )}
        </Svg>
      );
    case 'cross':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 4 }, (_, col) => {
              const cx = col * 22 + 8;
              const cy = row * 20 + 8;
              return (
                <Path key={`${row},${col}`}
                  d={`M ${cx - 5},${cy} L ${cx + 5},${cy} M ${cx},${cy - 5} L ${cx},${cy + 5}`}
                  stroke={color} strokeWidth="1.2" opacity={op} />
              );
            })
          )}
        </Svg>
      );
    case 'rays':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const cx = w * 0.85, cy = h * 0.15;
            return (
              <Line key={i}
                x1={cx} y1={cy}
                x2={cx + Math.cos(angle) * 60} y2={cy + Math.sin(angle) * 60}
                stroke={color} strokeWidth="0.9" opacity={op} />
            );
          })}
          {[12, 24, 36].map(r => (
            <Circle key={r} cx={w * 0.85} cy={h * 0.15} r={r} fill="none" stroke={color} strokeWidth="0.7" opacity={op} />
          ))}
        </Svg>
      );
    case 'chevrons':
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 4 }, (_, col) => {
              const x = col * 22 + 2;
              const y = row * 18 + 2;
              return (
                <Path key={`${row},${col}`}
                  d={`M ${x},${y + 6} L ${x + 8},${y} L ${x + 16},${y + 6}`}
                  fill="none" stroke={color} strokeWidth="1.0" opacity={op} />
              );
            })
          )}
        </Svg>
      );
    case 'squares':
    default:
      return (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 4 }, (_, col) => (
              <Rect key={`${row},${col}`}
                x={col * 20 + 4} y={row * 20 + 4}
                width={row % 2 === 0 ? 10 : 6} height={row % 2 === 0 ? 10 : 6}
                fill="none" stroke={color} strokeWidth="0.9" opacity={op} />
            ))
          )}
        </Svg>
      );
  }
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';
  const { width } = useWindowDimensions();
  // Two columns, gap 10, padding 16 each side
  const cardW = Math.floor((width - 42) / 2);
  const cardH = 168;

  const completedPuzzleIds = usePuzzleProgressStore(s => s.completedPuzzleIds);
  const dailyCompletedPuzzleIds = usePuzzleProgressStore(s => s.dailyCompletedPuzzleIds);
  const isCompleted = (id: string) => completedPuzzleIds.has(id);
  const isDailyCompleted = (id: string) => dailyCompletedPuzzleIds.has(id);

  const { data: stats } = useQuery({
    queryKey: queryKeys.user.stats,
    queryFn: () => apiClient.get<Array<{ gameType: string; bestTime: number | null; currentStreak: number }>>('/users/me/stats'),
    enabled: !!user,
  });

  const today = new Date().toISOString().slice(0, 10);
  const { data: dailyStatuses } = useQuery({
    queryKey: ['daily-statuses', today],
    queryFn: async () => {
      const results = await Promise.allSettled(
        GAME_CONFIGS.map(g =>
          apiClient.get<{ dailyPuzzleId: string; puzzle: { id: string } }>(`/puzzles/${g.type}/daily`)
            .then(r => ({ gameType: g.type, puzzleId: r.puzzle.id }))
        )
      );
      const map = new Map<string, string>();
      for (const r of results) {
        if (r.status === 'fulfilled') map.set(r.value.gameType, r.value.puzzleId);
      }
      return map;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 60,
  });

  const statsMap = new Map(stats?.map(s => [s.gameType, s]) ?? []);
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // Pair cards into rows of 2
  const rows: typeof GAME_CONFIGS[] = [];
  for (let i = 0; i < GAME_CONFIGS.length; i += 2) {
    rows.push(GAME_CONFIGS.slice(i, i + 2));
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.appTitle, { color: t.textPrimary }]}>Puzzle Roll</Text>
            <Text style={[styles.appSub, { color: t.textMuted }]}>Daily logic games</Text>
          </View>
          <Text style={styles.headerEmoji}>🎲</Text>
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {rows.map((pair, rowIdx) => (
            <View key={rowIdx} style={styles.row}>
              {pair.map(game => {
                const stat = statsMap.get(game.type);
                const dailyPuzzleId = dailyStatuses?.get(game.type);
                const dailyPlayed = !!dailyPuzzleId && isDailyCompleted(dailyPuzzleId);

                return (
                  <TouchableOpacity
                    key={game.type}
                    onPress={() => router.push(`/game/${game.type}` as never)}
                    style={[
                      styles.card,
                      {
                        width: cardW,
                        height: cardH,
                        backgroundColor: t.surface,
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
                      },
                    ]}
                    accessibilityLabel={`${game.name} puzzle game`}
                    accessibilityRole="button"
                    activeOpacity={0.8}
                  >
                    {/* Background SVG pattern */}
                    <PatternBg pattern={game.pattern} color={game.accent} w={cardW} h={cardH} />

                    <View style={styles.cardInner}>
                      {/* Emoji */}
                      <Text style={styles.cardEmoji}>{game.emoji}</Text>

                      {/* Game name + partial underline */}
                      <View style={styles.nameBlock}>
                        <Text style={[styles.cardName, { color: t.textPrimary }]} numberOfLines={1}>
                          {game.name}
                        </Text>
                        {/* Thick underline under ~60% of name width */}
                        <View style={[styles.underline, { backgroundColor: game.accent }]} />
                      </View>

                      {/* Description */}
                      <Text style={[styles.cardDesc, { color: t.textSecondary }]} numberOfLines={2}>
                        {game.description}
                      </Text>

                      {/* Footer */}
                      <View style={styles.cardFooter}>
                        {dailyPlayed ? (
                          <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(74,222,128,0.15)' : 'rgba(22,163,74,0.1)' }]}>
                            <Text style={[styles.badgeText, { color: '#4ade80' }]}>✓ Done</Text>
                          </View>
                        ) : (
                          <View style={[styles.badge, { backgroundColor: game.accent + '22' }]}>
                            <Text style={[styles.badgeText, { color: game.accent }]}>● Daily</Text>
                          </View>
                        )}

                        {stat?.bestTime != null && (
                          <View style={styles.bestBlock}>
                            <Text style={[styles.bestLabel, { color: t.textMuted }]}>BEST</Text>
                            <Text style={[styles.bestValue, { color: t.textPrimary }]}>{formatTime(stat.bestTime)}</Text>
                          </View>
                        )}
                      </View>

                      {/* Streak */}
                      {stat?.currentStreak != null && stat.currentStreak > 1 && (
                        <Text style={styles.streak}>🔥 {stat.currentStreak}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {/* If odd number of cards in last row, fill with spacer */}
              {pair.length === 1 && <View style={{ width: cardW }} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
    paddingTop: 8,
  },
  appTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 30, lineHeight: 36 },
  appSub: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, marginTop: 2 },
  headerEmoji: { fontSize: 34 },

  grid: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  cardInner: {
    flex: 1,
    padding: 14,
    justifyContent: 'flex-start',
  },

  cardEmoji: {
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 8,
  },

  nameBlock: {
    marginBottom: 6,
  },
  cardName: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  underline: {
    height: 3,
    width: '58%',
    borderRadius: 2,
  },

  cardDesc: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 'auto' as never,
    flexShrink: 1,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: 10,
  },
  bestBlock: {
    alignItems: 'flex-end',
  },
  bestLabel: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 8,
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  bestValue: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
  },

  streak: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 11,
    color: '#f97316',
    marginTop: 5,
  },
});