import { Stack } from 'expo-router';

/**
 * Layout for the game segment group: app/game/[gameType]/*
 *
 * This file's existence is what makes `app/game/` a named segment in
 * Expo Router v4. Without it, Router flattens the routes to their full
 * paths (e.g. "game/[gameType]/index") and the root Stack's
 * <Stack.Screen name="game"> cannot resolve.
 *
 * With this layout, "game" becomes a proper child segment of root,
 * and all screens inside app/game/** nest under it automatically.
 */
export default function GameLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}