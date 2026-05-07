import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // true = show banner when the app is in the foreground
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { user } = useAuthStore();
  const tokenRegistered = useRef(false);

  const registerForPushNotifications = async (): Promise<void> => {
    if (!user || user.isAnonymous) {
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const payload: Record<string, unknown> = {
        notificationEnabled: true,
        timezone,
        timezoneOffsetMinutes: -(new Date().getTimezoneOffset()),
      };

      if (!tokenRegistered.current) {
        // Prefer Constants (runtime app.json) over the env module so this works
        // in both Expo Go (dev) and production builds without env file changes.
        const projectId =
          (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
          process.env.EXPO_PUBLIC_PROJECT_ID;


        if (!projectId) {
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        payload.pushToken = tokenData.data;
        payload.platform = Platform.OS;
        tokenRegistered.current = true;
      }

      await apiClient.patch('/users/me/notifications', payload);
    } catch (err) {
    }
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const _data = response.notification.request.content.data as {
        screen?: string;
        gameType?: string;
      };
      // Navigation on tap is handled by deep link scheme in app.json
    });

    return () => subscription.remove();
  }, []);

  return { registerForPushNotifications };
}