import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, FlatList, ListRenderItem, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_W } = Dimensions.get('window');
const ONBOARDING_KEY = 'proll_onboarding_done';

export async function hasSeenOnboarding(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ONBOARDING_KEY);
  return v === 'true';
}
export async function markOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
}

interface Slide {
  id: string;
  emoji: string;
  title: string;
  body: string;
  accent: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    emoji: '🎲',
    title: 'Welcome to Puzzle Roll',
    body: '10 logic games. One new puzzle every day for each. Compete on the global leaderboard and build your streak.',
    accent: '#6366f1',
  },
  {
    id: '2',
    emoji: '📅',
    title: 'Daily challenges',
    body: 'A fresh daily puzzle resets at midnight UTC. Complete it to keep your streak alive — miss a day and it resets to zero.',
    accent: '#ec4899',
  },
  {
    id: '3',
    emoji: '🔥',
    title: 'Build your streak',
    body: 'Play daily to rack up consecutive days. Hit 7, 30, or 100 days to earn milestone badges. Your streak is per-game.',
    accent: '#f97316',
  },
  {
    id: '4',
    emoji: '🏆',
    title: 'Compete globally',
    body: 'After completing a daily, see where you rank. The fastest solver with no hints wins. Weekly champions get a badge.',
    accent: '#eab308',
  },
  {
    id: '5',
    emoji: '💡',
    title: 'Stuck? Use a hint',
    body: "Each game gives you 3 hints. They reveal the next correct move without spoiling the puzzle. Use them wisely.",
    accent: '#22c55e',
  },
  {
    id: '6',
    emoji: '☁️',
    title: 'Save your progress',
    body: 'Create a free account to sync progress across devices and recover it if you ever reinstall. Or play as a guest.',
    accent: '#14b8a6',
  },
];

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  const finish = async () => {
    await markOnboardingDone();
    router.replace('/');
  };

  const isLast = activeIndex === SLIDES.length - 1;

  const renderItem: ListRenderItem<Slide> = ({ item }) => (
    <View style={[S.slide, { width: SCREEN_W }]}>
      <View style={[S.emojiCircle, { backgroundColor: item.accent + '22', borderColor: item.accent + '44' }]}>
        <Text style={S.emoji}>{item.emoji}</Text>
      </View>
      <Text style={[S.title, { color: '#f9fafb' }]}>{item.title}</Text>
      <Text style={[S.body, { color: '#9ca3af' }]}>{item.body}</Text>
    </View>
  );

  return (
    <SafeAreaView style={S.safe} edges={['top', 'bottom']}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setActiveIndex(idx);
        }}
        scrollEventThrottle={16}
      />

      {/* Dots */}
      <View style={S.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              S.dot,
              i === activeIndex
                ? { backgroundColor: SLIDES[activeIndex].accent, width: 20 }
                : { backgroundColor: '#374151' },
            ]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={S.buttons}>
        {isLast ? (
          <TouchableOpacity style={[S.primaryBtn, { backgroundColor: SLIDES[activeIndex].accent }]} onPress={finish}>
            <Text style={S.primaryBtnText}>Get started</Text>
          </TouchableOpacity>
        ) : (
          <View style={S.btnRow}>
            <TouchableOpacity onPress={finish} style={S.skipBtn}>
              <Text style={S.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.primaryBtn, { backgroundColor: SLIDES[activeIndex].accent, flex: 1 }]} onPress={goNext}>
              <Text style={S.primaryBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#060818' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 80 },
  emojiCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  emoji: { fontSize: 56 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 26, textAlign: 'center', marginBottom: 16, lineHeight: 32 },
  body: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingBottom: 20 },
  dot: { height: 6, borderRadius: 3 },
  buttons: { paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 8 : 20 },
  btnRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skipBtn: { paddingVertical: 14, paddingHorizontal: 16 },
  skipText: { color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 14 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
});