import '../global.css';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
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

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const { hydrateFromStorage: hydrateAuth, isHydrated: authHydrated, user } = useAuthStore();
  const { hydrateFromStorage: hydrateSettings } = useSettingsStore();
  const { isConnected } = useNetworkStatus();
  const [dbReady, setDbReady] = useState(false);
  const [needsInitialSync, setNeedsInitialSync] = useState(false);

  const [fontsLoaded] = useFonts({
    'SpaceGrotesk-Regular': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
    'SpaceGrotesk-Medium': require('../assets/fonts/SpaceGrotesk-Medium.ttf'),
    'SpaceGrotesk-Bold': require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
  });

  useEffect(() => {
    async function init() {
      await puzzleCache.init();
      await hydrateAuth();
      await hydrateSettings();
      const hasSynced = await puzzleCache.hasInitialSync();
      setNeedsInitialSync(!hasSynced);
      setDbReady(true);
    }
    init();
  }, []);

  useEffect(() => {
    if (isConnected && user) {
      syncService.flushOfflineQueue();
    }
  }, [isConnected, user]);

  useEffect(() => {
    if (isConnected && user && dbReady) {
      syncService.fetchAndCacheDailyPuzzles();
    }
  }, [isConnected, user, dbReady]);

  const isReady = fontsLoaded && authHydrated && dbReady;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) return null;

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {needsInitialSync && !isConnected ? (
            <View className="flex-1 items-center justify-center bg-navy-950 px-8">
              <Text className="text-text-primary font-sans-bold text-xl text-center mb-4">
                One-time setup needed
              </Text>
              <Text className="text-text-secondary font-sans text-base text-center">
                Connect to the internet once to download your puzzles. After that, you can play
                offline anytime.
              </Text>
            </View>
          ) : (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
              {/*
                "game" resolves because app/game/_layout.tsx now exists.
                Router v4 treats that directory as a named segment group.
                All screens inside app/game/** are handled by game/_layout.tsx.
              */}
              <Stack.Screen name="game" options={{ headerShown: false }} />
            </Stack>
          )}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;