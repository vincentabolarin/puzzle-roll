import '../global.css';
import { useEffect, useState, createContext, useContext } from 'react';
import { View, Text, useColorScheme, ColorSchemeName } from 'react-native';
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

SplashScreen.preventAutoHideAsync();

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
      setDbReady(true);
    }
    init();
  }, []);

  // Step 2 — Auth bootstrap (runs after db is ready)
  // Hydrate stored tokens. If no user found (first install or cleared storage),
  // create an anonymous session automatically so every API call has a valid JWT.
  useEffect(() => {
    if (!dbReady) return;

    async function bootstrapAuth() {
      await hydrateAuth();
      const { user: currentUser } = useAuthStore.getState();

      if (!currentUser) {
        // No stored session — create anonymous session
        try {
          await authService.createAnonymousSession();
        } catch {
          // Non-fatal: app can still run offline, API calls will fail gracefully
        }
      }

      setAuthBootstrapped(true);
    }

    bootstrapAuth();
  }, [dbReady]);

  // Register for push notifications whenever a real (non-anonymous) user is present.
  // Re-runs on user change so login always syncs the current IANA timezone to the backend.
  useEffect(() => {
    if (authBootstrapped && user && !user.isAnonymous) {
      registerForPushNotifications();
    }
  }, [authBootstrapped, user?.id]);

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
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  // Resolve theme: 'system' defers to device setting
  const resolvedTheme: ResolvedTheme =
    theme === 'system'
      ? (systemColorScheme === 'light' ? 'light' : 'dark')
      : theme;

  if (!isReady) return null;

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
              </Stack>
            )}
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeContext.Provider>
  );
}

export default RootLayout;