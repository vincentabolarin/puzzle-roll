import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

type NotificationsModule = typeof import('expo-notifications');
let notifCache: NotificationsModule | null = null;

async function getNotifModule(): Promise<NotificationsModule | null> {
  if (IS_EXPO_GO) return null;
  if (notifCache) return notifCache;
  try {
    notifCache = await import('expo-notifications');
    return notifCache;
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuthStore();
  const tokenRegistered = useRef(false);

  // Set the foreground notification handler once on mount
  useEffect(() => {
    if (IS_EXPO_GO) return;
    getNotifModule().then((mod) => {
      if (!mod) return;
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    });
  }, []);

  const registerForPushNotifications = async (): Promise<void> => {
    if (IS_EXPO_GO || !user || user.isAnonymous) return;

    const mod = await getNotifModule();
    if (!mod) return;

    const { status: existingStatus } = await mod.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await mod.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await mod.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: mod.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const payload: Record<string, unknown> = {
      notificationEnabled: true,
      timezone,
      timezoneOffsetMinutes: -(new Date().getTimezoneOffset()),
    };

    if (!tokenRegistered.current) {
      const projectId =
        (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
        process.env.EXPO_PUBLIC_PROJECT_ID;

      if (!projectId) return;

      try {
        const tokenData = await mod.getExpoPushTokenAsync({ projectId });
        payload.pushToken = tokenData.data;
        payload.platform = Platform.OS;
        tokenRegistered.current = true;
      } catch {
        return;
      }
    }

    try {
      await apiClient.patch('/users/me/notifications', payload);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    if (IS_EXPO_GO) return;
    let cleanup: (() => void) | undefined;
    getNotifModule().then((mod) => {
      if (!mod) return;
      const sub = mod.addNotificationResponseReceivedListener(() => {
        // Navigation on tap is handled by the deep link scheme in app.json
      });
      cleanup = () => sub.remove();
    });
    return () => cleanup?.();
  }, []);

  return { registerForPushNotifications };
}