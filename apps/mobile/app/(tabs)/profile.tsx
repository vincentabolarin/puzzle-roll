import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { authService } from '../../src/services/auth.service';

interface StatRow {
  gameType: string;
  gamesPlayed: number;
  gamesCompleted: number;
  bestTime: number | null;
  currentStreak: number;
  longestStreak: number;
}

const GAME_LABELS: Record<string, string> = {
  sudoku: 'Sudoku', queens: 'Queens', zip: 'Zip', tango: 'Tango',
  nonogram: 'Nonogram', minesweeper: 'Minesweeper', kakuro: 'Kakuro',
  light_up: 'Light Up', futoshiki: 'Futoshiki', hitori: 'Hitori',
};

function formatTime(s: number | null): string {
  if (s === null) return '—';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  const { data: stats } = useQuery({
    queryKey: queryKeys.user.stats,
    queryFn: () => apiClient.get<StatRow[]>('/users/me/stats'),
    enabled: !!user,
  });

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          await authService.logout();
          // Navigate to home — auth state is cleared, app will prompt login if needed
          router.replace('/');
        },
      },
    ]);
  };

  const handleUpgrade = async () => {
    if (!email.trim() || password.length < 8) {
      Alert.alert('Invalid input', 'Password must be at least 8 characters.');
      return;
    }
    setUpgrading(true);
    try {
      await authService.upgradeAccount(email.trim().toLowerCase(), password);
      setShowUpgrade(false);
      Alert.alert('Account created', 'Your progress is now saved to your account.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setUpgrading(false);
    }
  };

  const totalCompleted = stats?.reduce((sum, s) => sum + (s.gamesCompleted ?? 0), 0) ?? 0;
  const bestStreak = stats?.reduce((max, s) => Math.max(max, s.longestStreak ?? 0), 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Profile</Text>

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.isAnonymous ? '?' : (user?.email?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameText}>
              {user?.isAnonymous ? 'Guest Player' : user?.email}
            </Text>
            <Text style={styles.subText}>
              {user?.isAnonymous ? 'Progress not saved' : 'Progress synced to cloud'}
            </Text>
          </View>
        </View>

        {/* Guest upgrade CTA */}
        {user?.isAnonymous && !showUpgrade && (
          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => setShowUpgrade(true)}
            accessibilityLabel="Create account"
          >
            <Text style={styles.upgradeBtnText}>Create account to save progress →</Text>
          </TouchableOpacity>
        )}

        {user?.isAnonymous && showUpgrade && (
          <View style={styles.upgradeForm}>
            <Text style={styles.sectionTitle}>Create account</Text>
            <TextInput
              style={styles.input}
              placeholder="Email" placeholderTextColor="#6b7280"
              value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password (min 8 characters)" placeholderTextColor="#6b7280"
              value={password} onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity
              style={[styles.primaryBtn, upgrading && styles.primaryBtnDisabled]}
              onPress={handleUpgrade} disabled={upgrading}
              accessibilityLabel="Save account"
            >
              <Text style={styles.primaryBtnText}>{upgrading ? 'Saving...' : 'Save account'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowUpgrade(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick stats summary */}
        {(stats ?? []).length > 0 && (
          <View style={styles.quickStats}>
            <View style={styles.quickStatBox}>
              <Text style={styles.quickStatValue}>{totalCompleted}</Text>
              <Text style={styles.quickStatLabel}>Completed</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatBox}>
              <Text style={styles.quickStatValue}>{bestStreak}</Text>
              <Text style={styles.quickStatLabel}>Best streak</Text>
            </View>
          </View>
        )}

        {/* Per-game stats */}
        {(stats ?? []).length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.sectionTitle}>Game stats</Text>
            <View style={styles.card}>
              {(stats ?? []).map((stat, i) => (
                <View
                  key={stat.gameType}
                  style={[styles.statRow, i < (stats ?? []).length - 1 && styles.statRowBorder]}
                >
                  <Text style={styles.statGame}>{GAME_LABELS[stat.gameType] ?? stat.gameType}</Text>
                  <Text style={styles.statValue}>{formatTime(stat.bestTime)}</Text>
                  <Text style={styles.statStreak}>🔥 {stat.currentStreak}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Login / logout */}
        {user?.isAnonymous ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/login' as never)}
            accessibilityLabel="Log in to existing account"
          >
            <Text style={styles.secondaryBtnText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={handleLogout}
            accessibilityLabel="Log out"
          >
            <Text style={styles.dangerBtnText}>Log out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#060818' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 },
  heading: { color: '#f9fafb', fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, marginBottom: 20 },
  card: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', marginBottom: 16 },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#6366f1',
    alignItems: 'center', justifyContent: 'center', marginRight: 12, marginLeft: 16, marginVertical: 16,
  },
  avatarText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 22 },
  nameText: { color: '#f9fafb', fontFamily: 'SpaceGrotesk-Medium', fontSize: 15, marginBottom: 2 },
  subText: { color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  upgradeBtn: {
    backgroundColor: '#1e1b4b', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    borderWidth: 1, borderColor: '#6366f1', marginBottom: 16,
  },
  upgradeBtnText: { color: '#a5b4fc', fontFamily: 'SpaceGrotesk-Medium', fontSize: 14, textAlign: 'center' },
  upgradeForm: { backgroundColor: '#111827', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1f2937' },
  sectionTitle: { color: '#f9fafb', fontFamily: 'SpaceGrotesk-Bold', fontSize: 16, marginBottom: 12 },
  input: {
    backgroundColor: '#1f2937', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#f9fafb', fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#374151',
  },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
  cancelText: { color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center', paddingVertical: 4 },
  quickStats: {
    flexDirection: 'row', backgroundColor: '#111827', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', marginBottom: 16, padding: 20,
  },
  quickStatBox: { flex: 1, alignItems: 'center' },
  quickStatValue: { color: '#f9fafb', fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, marginBottom: 4 },
  quickStatLabel: { color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  quickStatDivider: { width: 1, backgroundColor: '#1f2937', marginHorizontal: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  statGame: { flex: 1, color: '#f9fafb', fontFamily: 'SpaceGrotesk-Medium', fontSize: 13 },
  statValue: { color: '#9ca3af', fontFamily: 'JetBrainsMono-Regular', fontSize: 12, marginRight: 16 },
  statStreak: { color: '#9ca3af', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  secondaryBtn: {
    backgroundColor: '#111827', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#374151', marginBottom: 12,
  },
  secondaryBtnText: { color: '#a5b4fc', fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  dangerBtn: {
    backgroundColor: '#111827', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#374151',
  },
  dangerBtnText: { color: '#f87171', fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
});