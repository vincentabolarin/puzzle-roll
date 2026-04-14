import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/auth.store';
import { useSettingsStore } from '../../src/stores/settings.store';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { authService } from '../../src/services/auth.service';

interface StatRow {
  gameType: string;
  gamesCompleted: number;
  bestTime: number | null;
  currentStreak: number;
  longestStreak: number;
}

function formatTime(s: number | null): string {
  if (s === null) return '—';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const { soundEnabled, hapticsEnabled, autoRemoveNotes, setSoundEnabled, setHapticsEnabled, setAutoRemoveNotes } = useSettingsStore();

  const { data: stats } = useQuery({
    queryKey: queryKeys.user.stats,
    queryFn: () => apiClient.get<StatRow[]>('/users/me/stats'),
    enabled: !!user,
  });

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await authService.logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-24"
        showsVerticalScrollIndicator={false}
      >
        {/* User info */}
        <View className="mb-6">
          <Text className="text-text-primary font-sans-bold text-2xl">Profile</Text>
          <Text className="text-text-secondary font-sans text-sm mt-1">
            {user?.isAnonymous ? 'Playing as guest' : user?.email}
          </Text>
          {user?.isAnonymous && (
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register')}
              className="mt-3 bg-game-sudoku rounded-xl px-4 py-2.5 self-start"
              accessibilityLabel="Create account to save progress"
            >
              <Text className="text-white font-sans-medium text-sm">Create account to save progress</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        {(stats ?? []).length > 0 && (
          <View className="mb-6">
            <Text className="text-text-primary font-sans-bold text-lg mb-3">Stats</Text>
            <View className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
              {(stats ?? []).map((stat, i) => (
                <View
                  key={stat.gameType}
                  className={`flex-row items-center px-4 py-3 ${i < (stats ?? []).length - 1 ? 'border-b border-border-subtle' : ''}`}
                >
                  <Text className="flex-1 text-text-primary font-sans-medium text-sm capitalize">
                    {stat.gameType.replace('_', ' ')}
                  </Text>
                  <Text className="text-text-secondary font-mono text-xs mr-4">
                    Best: {formatTime(stat.bestTime)}
                  </Text>
                  <Text className="text-text-secondary font-sans text-xs">
                    🔥 {stat.currentStreak}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Settings */}
        <View className="mb-6">
          <Text className="text-text-primary font-sans-bold text-lg mb-3">Settings</Text>
          <View className="bg-surface rounded-2xl border border-border-subtle overflow-hidden">
            {[
              { label: 'Sound', value: soundEnabled, onChange: setSoundEnabled },
              { label: 'Haptics', value: hapticsEnabled, onChange: setHapticsEnabled },
              { label: 'Auto-remove notes (Sudoku)', value: autoRemoveNotes, onChange: setAutoRemoveNotes },
            ].map((item, i, arr) => (
              <View
                key={item.label}
                className={`flex-row items-center justify-between px-4 py-4 ${i < arr.length - 1 ? 'border-b border-border-subtle' : ''}`}
              >
                <Text className="text-text-primary font-sans text-sm">{item.label}</Text>
                <Switch
                  value={item.value}
                  onValueChange={item.onChange}
                  trackColor={{ false: '#374151', true: '#6366f1' }}
                  thumbColor="#ffffff"
                />
              </View>
            ))}
          </View>
        </View>

        {/* Logout */}
        {!user?.isAnonymous && (
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-surface border border-border rounded-xl px-4 py-3 items-center"
            accessibilityLabel="Log out"
            accessibilityRole="button"
          >
            <Text className="text-red-400 font-sans-medium text-sm">Log out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
