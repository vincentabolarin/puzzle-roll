import '../global.css';
import { useEffect, useState, createContext, useContext } from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/auth.store';
import { useSettingsStore } from '../src/stores/settings.store';
import { queryClient } from '../src/lib/query-client';
import { puzzleCache } from '../src/services/puzzle-cache.service';
import { syncService } from '../src/services/sync.service';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { authService } from '../src/services/auth.service';
import { hydratePuzzleProgress } from '../src/stores/puzzle-progress.store';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { missingVars } from '../src/lib/env';
import { hasSeenOnboarding } from './onboarding';
import { useGdprConsent } from '@/hooks/useGdprConsent';

SplashScreen.preventAutoHideAsync();

const IS_EXPO_GO = Constants.appOwnership === 'expo';

// ─── Theme context ────────────────────────────────────────────────────────────

export type ResolvedTheme = 'light' | 'dark';

const ThemeContext = createContext<ResolvedTheme>('dark');

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}

// ─── Root layout ──────────────────────────────────────────────────────────────

function RootLayout() {
  const { hydrateFromStorage: hydrateAuth, isHydrated: authHydrated, user } = useAuthStore();
  const { hydrateFromStorage: hydrateSettings, theme } = useSettingsStore();
  const { isConnected } = useNetworkStatus();
  const { registerForPushNotifications } = usePushNotifications();
  useGdprConsent();
  const [onboardingDone, setOnboardingDone] = useState(true);
  const systemColorScheme = useColorScheme();

  const [dbReady, setDbReady] = useState(false);
  const [needsInitialSync, setNeedsInitialSync] = useState(false);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);

  const [fontsLoaded] = useFonts({
    'SpaceGrotesk-Regular': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
    'SpaceGrotesk-Medium': require('../assets/fonts/SpaceGrotesk-Medium.ttf'),
    'SpaceGrotesk-Bold': require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
  });

  // Step 1 — Init DB and hydrate settings + progress store
  useEffect(() => {
    async function init() {
      await puzzleCache.init();
      await hydrateSettings();
      await hydratePuzzleProgress();
      const hasSynced = await puzzleCache.hasInitialSync();
      setNeedsInitialSync(!hasSynced);
      const seen = await hasSeenOnboarding();
      setOnboardingDone(seen);
      setDbReady(true);
    }
    init();
  }, []);

  // Step 2 — Auth bootstrap
  useEffect(() => {
    if (!dbReady) return;

    async function bootstrapAuth() {
      await hydrateAuth();
      const { user: currentUser } = useAuthStore.getState();

      if (!currentUser) {
        try {
          await authService.createAnonymousSession();
        } catch {
          // Non-fatal
        }
      }

      setAuthBootstrapped(true);
    }

    bootstrapAuth();
  }, [dbReady]);

  // Push notifications: register whenever a real user is present
  useEffect(() => {
    if (authBootstrapped && user && !user.isAnonymous) {
      registerForPushNotifications();
    }
  }, [authBootstrapped, user?.id]);

  // Deep link handler: notification taps navigate to the relevant screen
  // Skipped entirely in Expo Go — remote push is not available there
  useEffect(() => {
    if (IS_EXPO_GO) return;
    let cleanup: (() => void) | undefined;
    import('expo-notifications').then((Notifications) => {
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as {
          screen?: string; gameType?: string;
        };
        if (data.screen === 'daily' && data.gameType) {
          router.push(`/game/${data.gameType}/daily` as never);
        } else if (data.screen === 'leaderboard') {
          router.push('/(tabs)/leaderboard' as never);
        } else if (data.screen === 'profile') {
          router.push('/(tabs)/profile' as never);
        } else if (data.screen === 'home') {
          router.push('/(tabs)/' as never);
        }
      });
      cleanup = () => sub.remove();
    }).catch(() => {});
    return () => cleanup?.();
  }, []);

  // Step 3 — Online sync
  useEffect(() => {
    const { user: currentUser } = useAuthStore.getState();
    if (isConnected && currentUser) {
      syncService.flushOfflineQueue();
    }
  }, [isConnected, user]);

  useEffect(() => {
    const { user: currentUser } = useAuthStore.getState();
    if (isConnected && currentUser && dbReady) {
      syncService.fetchAndCacheDailyPuzzles();
    }
  }, [isConnected, user, dbReady]);

  const isReady = fontsLoaded && authBootstrapped && dbReady;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
      if (!onboardingDone) {
        setTimeout(() => router.replace('/onboarding' as never), 100);
      }
    }
  }, [isReady, onboardingDone]);

  const resolvedTheme: ResolvedTheme =
    theme === 'system'
      ? (systemColorScheme === 'light' ? 'light' : 'dark')
      : theme;

  if (!isReady) return null;

  if (missingVars.length > 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#060818', padding: 32 }}>
        <Text style={{ fontFamily: 'SpaceGrotesk-Bold', fontSize: 18, color: '#ef4444', textAlign: 'center', marginBottom: 12 }}>
          Configuration error
        </Text>
        <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20 }}>
          Missing required environment variables:{' '}{missingVars.join(', ')}{' '}Add these to your EAS build profile or .env file and rebuild.
        </Text>
      </View>
    );
  }

  return (
    <ThemeContext.Provider value={resolvedTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            {needsInitialSync && !isConnected ? (
              <View style={{
                flex: 1, alignItems: 'center', justifyContent: 'center',
                backgroundColor: resolvedTheme === 'dark' ? '#060818' : '#f9fafb',
                paddingHorizontal: 32,
              }}>
                <Text style={{
                  fontFamily: 'SpaceGrotesk-Bold', fontSize: 20, textAlign: 'center', marginBottom: 12,
                  color: resolvedTheme === 'dark' ? '#f9fafb' : '#111827',
                }}>
                  One-time setup needed
                </Text>
                <Text style={{
                  fontFamily: 'SpaceGrotesk-Regular', fontSize: 15, textAlign: 'center', lineHeight: 22,
                  color: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
                }}>
                  Connect to the internet once to download your puzzles. After that, you can play offline anytime.
                </Text>
              </View>
            ) : (
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
                <Stack.Screen name="game" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
                <Stack.Screen name="(legal)/privacy" options={{ headerShown: false }} />
                <Stack.Screen name="(legal)/terms" options={{ headerShown: false }} />
              </Stack>
            )}
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeContext.Provider>
  );
}

export default RootLayout;