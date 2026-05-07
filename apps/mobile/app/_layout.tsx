import '../global.css';
import { useEffect, useState, createContext, useContext } from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
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
import { validateEnv } from '@/lib/env';

SplashScreen.preventAutoHideAsync();

// ─── Theme context ────────────────────────────────────────────────────────────

export type ResolvedTheme = 'light' | 'dark';

const ThemeContext = createContext<ResolvedTheme>('dark');

export function useTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}

// ─── Root layout ──────────────────────────────────────────────────────────────

function RootLayout() {
  const envCheck = validateEnv();

  const { hydrateFromStorage: hydrateAuth, user } = useAuthStore();
  const { hydrateFromStorage: hydrateSettings, theme } = useSettingsStore();
  const { isConnected } = useNetworkStatus();
  const { registerForPushNotifications } = usePushNotifications();
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

  // Log env validation errors for debugging
  useEffect(() => {
    if (!envCheck.valid) {
      console.error('[ENV VALIDATION FAILED]', envCheck.errors);
    }
  }, [envCheck.valid]);

  // Step 1 — Init DB and hydrate settings + progress store
  useEffect(() => {
    if (!envCheck.valid) return;

    async function init() {
      await puzzleCache.init();
      await hydrateSettings();
      await hydratePuzzleProgress();

      const hasSynced = await puzzleCache.hasInitialSync();
      setNeedsInitialSync(!hasSynced);
      setDbReady(true);
    }

    init();
  }, [envCheck.valid]);

  // Step 2 — Auth bootstrap
  useEffect(() => {
    if (!envCheck.valid || !dbReady) return;

    async function bootstrapAuth() {
      await hydrateAuth();

      const { user: currentUser } = useAuthStore.getState();

      if (!currentUser) {
        try {
          await authService.createAnonymousSession();
        } catch {
          // Non-fatal: app can still run offline
        }
      }

      setAuthBootstrapped(true);
    }

    bootstrapAuth();
  }, [envCheck.valid, dbReady]);

  // Register push notifications for authenticated users
  useEffect(() => {
    if (authBootstrapped && user && !user.isAnonymous) {
      registerForPushNotifications();
    }
  }, [authBootstrapped, user?.id]);

  // Flush offline queue when back online
  useEffect(() => {
    if (!envCheck.valid) return;

    const { user: currentUser } = useAuthStore.getState();

    if (isConnected && currentUser) {
      syncService.flushOfflineQueue();
    }
  }, [envCheck.valid, isConnected, user]);

  // Fetch daily puzzles when online
  useEffect(() => {
    if (!envCheck.valid) return;

    const { user: currentUser } = useAuthStore.getState();

    if (isConnected && currentUser && dbReady) {
      syncService.fetchAndCacheDailyPuzzles();
    }
  }, [envCheck.valid, isConnected, user, dbReady]);

  const isReady = fontsLoaded && authBootstrapped && dbReady;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  // Resolve theme
  const resolvedTheme: ResolvedTheme =
    theme === 'system'
      ? systemColorScheme === 'light'
        ? 'light'
        : 'dark'
      : theme;

  // Show configuration error instead of crashing
  if (!envCheck.valid) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 32,
          backgroundColor: '#060818',
        }}
      >
        <Text
          style={{
            fontFamily: 'SpaceGrotesk-Bold',
            fontSize: 22,
            color: '#f9fafb',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          Configuration Error
        </Text>

        {envCheck.errors.map((error) => (
          <Text
            key={error}
            style={{
              fontFamily: 'SpaceGrotesk-Regular',
              fontSize: 15,
              color: '#ef4444',
              textAlign: 'center',
              lineHeight: 22,
              marginBottom: 8,
            }}
          >
            {error}
          </Text>
        ))}
      </View>
    );
  }

  if (!isReady) return null;

  return (
    <ThemeContext.Provider value={resolvedTheme}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            {needsInitialSync && !isConnected ? (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    resolvedTheme === 'dark' ? '#060818' : '#f9fafb',
                  paddingHorizontal: 32,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'SpaceGrotesk-Bold',
                    fontSize: 20,
                    textAlign: 'center',
                    marginBottom: 12,
                    color:
                      resolvedTheme === 'dark' ? '#f9fafb' : '#111827',
                  }}
                >
                  One-time setup needed
                </Text>

                <Text
                  style={{
                    fontFamily: 'SpaceGrotesk-Regular',
                    fontSize: 15,
                    textAlign: 'center',
                    lineHeight: 22,
                    color:
                      resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
                  }}
                >
                  Connect to the internet once to download your puzzles. After
                  that, you can play offline anytime.
                </Text>
              </View>
            ) : (
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen
                  name="(tabs)"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="(auth)"
                  options={{
                    headerShown: false,
                    presentation: 'modal',
                  }}
                />
                <Stack.Screen
                  name="game"
                  options={{ headerShown: false }}
                />
              </Stack>
            )}
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeContext.Provider>
  );
}

export default RootLayout;