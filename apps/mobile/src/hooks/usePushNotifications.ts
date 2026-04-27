import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false
  }),
});

export function usePushNotifications() {
  const { user } = useAuthStore();
  const tokenRegistered = useRef(false);

  const registerForPushNotifications = async (): Promise<void> => {
    if (tokenRegistered.current || !user || user.isAnonymous) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
      });

      await apiClient.patch('/users/me/notifications', {
        notificationEnabled: true,
        pushToken: tokenData.data,
        platform: Platform.OS,
      });

      tokenRegistered.current = true;
    } catch {
      // Silently fail — notification registration is non-critical
    }
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        screen?: string;
        gameType?: string;
      };
      // Navigation handled by deep link scheme in app.json
    });

    return () => subscription.remove();
  }, []);

  return { registerForPushNotifications };
}
