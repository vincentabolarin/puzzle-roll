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
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export function usePushNotifications() {
  const { user } = useAuthStore();
  const tokenRegistered = useRef(false);

  const registerForPushNotifications = async (): Promise<void> => {
    if (!user || user.isAnonymous) {
      console.log('[Push] Skipping — user is anonymous or null');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log('[Push] Permission status:', existingStatus);

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[Push] Requested permissions, got:', status);
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted, aborting');
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
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string;
        console.log('[Push] Fetching token with projectId:', projectId);
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log('[Push] Got token:', tokenData.data);
        payload.pushToken = tokenData.data;
        payload.platform = Platform.OS;
        tokenRegistered.current = true;
      }

      console.log('[Push] Sending PATCH with keys:', Object.keys(payload));
      await apiClient.patch('/users/me/notifications', payload);
      console.log('[Push] PATCH succeeded — PushToken should now be in DB');
    } catch (err) {
      console.error('[Push] Registration failed:', err);
    }
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const _data = response.notification.request.content.data as {
        screen?: string;
        gameType?: string;
      };
      // Navigation handled by deep link scheme in app.json
    });

    return () => subscription.remove();
  }, []);

  return { registerForPushNotifications };
}