import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { authService } from '../../src/services/auth.service';
import { useAppTheme } from '../../src/hooks/useAppTheme';
import ConfirmModal from '../../src/components/ui/ConfirmModal';

interface StatRow {
  gameType: string;
  gamesCompleted: number;
  bestTime: number | null;
  currentStreak: number;
  longestStreak: number;
  lastPlayedAt: string | null;
}

const GAME_LABELS: Record<string, string> = {
  sudoku: 'Sudoku', queens: 'Queens', zip: 'Zip', tango: 'Tango',
  nonogram: 'Nonogram', minesweeper: 'Minesweeper', kakuro: 'Kakuro',
  light_up: 'Light Up', futoshiki: 'Futoshiki', hitori: 'Hitori',
};

function formatTime(s: number | null): string {
  if (s === null || s === 0) return '—';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const { user, setUsername, clearSession } = useAuthStore();
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';
  const queryClient = useQueryClient();

  // Reset modal state whenever user changes (prevents stale modal after logout)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  useEffect(() => { setShowLogoutConfirm(false); }, [user?.id]);

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: queryKeys.user.me,
    queryFn: () => apiClient.get<{ id: string; username: string | null; email: string | null }>('/users/me'),
    enabled: !!user && !user.isAnonymous,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: queryKeys.user.stats,
    queryFn: () => apiClient.get<StatRow[]>('/users/me/stats'),
    enabled: !!user,
    // Refetch stats whenever the screen re-mounts (e.g. after completing a daily puzzle)
    refetchOnMount: true,
    // refetchOnWindowFocus: true,
    // staleTime: 0
  });

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    await authService.logout();
    queryClient.clear();
    router.replace('/');
  };

  const handleUpgrade = async () => {
    const cleanEmail = upgradeEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setUpgradeError('Please enter a valid email.'); return; }
    if (upgradePassword.length < 8) { setUpgradeError('Password must be at least 8 characters.'); return; }
    setUpgradeError(null); setUpgrading(true);
    try {
      await authService.upgradeAccount(cleanEmail, upgradePassword);
      setShowUpgrade(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Something went wrong. This email may already be in use.');
    } finally { setUpgrading(false); }
  };

  const handleSaveUsername = async () => {
    const val = usernameInput.trim();
    if (val.length < 2 || val.length > 20) { setUsernameError('Username must be 2–20 characters.'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(val)) { setUsernameError('Letters, numbers, _ and - only.'); return; }
    setUsernameError(null); setSavingUsername(true);
    try {
      await apiClient.patch('/users/me/username', { username: val });
      // Update both the auth store AND invalidate the profile query for immediate UI refresh
      setUsername(val);
      setEditingUsername(false);
      await refetchProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save username.';
      // 404 means username endpoint not found — show meaningful error
      setUsernameError(message.includes('404') ? 'Username service unavailable. Please try again later.' : message);
    } finally { setSavingUsername(false); }
  };

  const totalCompleted = stats?.reduce((s, r) => s + (r.gamesCompleted ?? 0), 0) ?? 0;
  const displayUsername = profile?.username ?? user?.username;
  const displayName = user == null ? 'Logged out'
    : user.isAnonymous ? 'Guest Player'
    : (displayUsername ?? profile?.email ?? user.email ?? 'Player');
  const initial = (user?.isAnonymous || !user) ? '?'
    : ((displayUsername?.[0] ?? user?.email?.[0] ?? '?').toUpperCase());

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        <Text style={[S.heading, { color: t.textPrimary }]}>Profile</Text>

        {/* Identity card */}
        <View style={[S.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <View style={S.identityRow}>
            <View style={S.avatar}><Text style={S.avatarText}>{initial}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[S.nameText, { color: t.textPrimary }]} numberOfLines={1}>{displayName}</Text>
              <Text style={[S.subText, { color: t.textMuted }]}>
                {user == null ? 'Not signed in'
                  : user.isAnonymous ? 'Progress saved locally only'
                  : 'Progress synced to cloud ☁️'}
              </Text>
            </View>
          </View>

          {/* Username section */}
          {!user?.isAnonymous && user != null && (
            <View style={[S.usernameSection, { borderTopColor: t.borderSubtle }]}>
              {!editingUsername ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={[S.fieldLabel, { color: t.textMuted }]}>Username</Text>
                    <Text style={[S.fieldValue, { color: displayUsername ? t.textPrimary : t.textMuted }]}>
                      {displayUsername ?? 'Not set'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setUsernameInput(displayUsername ?? ''); setEditingUsername(true); setUsernameError(null); }}
                    style={[S.editBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
                  >
                    <Text style={{ color: t.accent, fontFamily: 'SpaceGrotesk-Medium', fontSize: 13 }}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={[S.fieldLabel, { color: t.textMuted }]}>Username</Text>
                  <TextInput
                    style={[S.input, { backgroundColor: t.surface2, color: t.textPrimary, borderColor: usernameError ? '#ef4444' : t.border }]}
                    value={usernameInput}
                    onChangeText={v => { setUsernameInput(v); setUsernameError(null); }}
                    autoCapitalize="none" autoCorrect={false}
                    placeholder="2–20 chars, letters/numbers/_-"
                    placeholderTextColor={t.textMuted}
                  />
                  {usernameError && <Text style={S.errorText}>{usernameError}</Text>}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity onPress={handleSaveUsername} disabled={savingUsername} style={[S.saveBtn, { opacity: savingUsername ? 0.6 : 1 }]}>
                      <Text style={S.saveBtnText}>{savingUsername ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingUsername(false)} style={[S.cancelBtn, { backgroundColor: t.surface2, borderColor: t.border }]}>
                      <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Medium', fontSize: 13 }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Not logged in */}
        {user == null && (
          <View style={{ gap: 10, marginBottom: 24 }}>
            <TouchableOpacity style={S.primaryBtn} onPress={() => router.push('/(auth)/login' as never)}>
              <Text style={S.primaryBtnText}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.secondaryBtn, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => router.push('/(auth)/register' as never)}>
              <Text style={[S.secondaryBtnText, { color: t.textPrimary }]}>Create account</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Anonymous upgrade */}
        {user?.isAnonymous && !showUpgrade && (
          <TouchableOpacity style={[S.upgradeBtn, { borderColor: t.accent }]} onPress={() => setShowUpgrade(true)}>
            <Text style={[S.upgradeBtnText, { color: t.accentLight }]}>Create account to back up progress →</Text>
          </TouchableOpacity>
        )}
        {user?.isAnonymous && showUpgrade && (
          <View style={[S.card, { backgroundColor: t.surface, borderColor: t.borderSubtle, padding: 20, marginBottom: 16 }]}>
            <Text style={[S.sectionTitle, { color: t.textPrimary, marginBottom: 12 }]}>Create account</Text>
            {upgradeError && <Text style={[S.errorText, { marginBottom: 8 }]}>{upgradeError}</Text>}
            <TextInput style={[S.input, { backgroundColor: t.surface2, color: t.textPrimary, borderColor: t.border }]} placeholder="Email" placeholderTextColor={t.textMuted} value={upgradeEmail} onChangeText={setUpgradeEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <TextInput style={[S.input, { backgroundColor: t.surface2, color: t.textPrimary, borderColor: t.border }]} placeholder="Password (min 8 characters)" placeholderTextColor={t.textMuted} value={upgradePassword} onChangeText={setUpgradePassword} secureTextEntry />
            <TouchableOpacity style={[S.primaryBtn, upgrading && { opacity: 0.6 }]} onPress={handleUpgrade} disabled={upgrading}>
              <Text style={S.primaryBtnText}>{upgrading ? 'Saving…' : 'Save account'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowUpgrade(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {user?.isAnonymous && (
          <TouchableOpacity style={[S.secondaryBtn, { backgroundColor: t.surface, borderColor: t.border, marginBottom: 16 }]} onPress={() => router.push('/(auth)/login' as never)}>
            <Text style={[S.secondaryBtnText, { color: t.accentLight }]}>Already have an account? Log in</Text>
          </TouchableOpacity>
        )}

        {/* Total completed */}
        {(stats ?? []).length > 0 && (
          <View style={[S.totalCard, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
            <Text style={[S.totalValue, { color: t.textPrimary }]}>{totalCompleted}</Text>
            <Text style={[S.totalLabel, { color: t.textMuted }]}>Total puzzles completed</Text>
          </View>
        )}

        {/* Per-game stats */}
        {(stats ?? []).length > 0 && (
          <>
            <Text style={[S.sectionTitle, { color: t.textPrimary, marginBottom: 10 }]}>Game stats</Text>
            <View style={[S.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
              {/* Header row */}
              <View style={[S.statsHeaderRow, { borderBottomColor: t.borderSubtle }]}>
                <Text style={[S.statsHeaderGame, { color: t.textMuted }]}>Game</Text>
                <Text style={[S.statsHeaderCell, { color: t.textMuted }]}>Best time</Text>
                <Text style={[S.statsHeaderCell, { color: t.textMuted }]}>Streak 🔥</Text>
                <Text style={[S.statsHeaderCell, { color: t.textMuted }]}>Best</Text>
              </View>
              {(stats ?? []).map((stat, i) => (
                <View key={stat.gameType} style={[S.statRow, i < (stats ?? []).length - 1 && { borderBottomWidth: 1, borderBottomColor: t.borderSubtle }]}>
                  <Text style={[S.statGame, { color: t.textPrimary }]} numberOfLines={1}>
                    {GAME_LABELS[stat.gameType] ?? stat.gameType}
                  </Text>
                  <Text style={[S.statCell, { color: t.textSecondary, fontFamily: 'JetBrainsMono-Regular' }]}>
                    {formatTime(stat.bestTime)}
                  </Text>
                  <Text style={[S.statCell, { color: stat.currentStreak > 0 ? '#f59e0b' : t.textMuted }]}>
                    {stat.currentStreak > 0 ? `${stat.currentStreak}🔥` : '—'}
                  </Text>
                  <Text style={[S.statCell, { color: t.textSecondary }]}>
                    {stat.longestStreak > 0 ? stat.longestStreak : '—'}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[S.streakNote, { color: t.textMuted }]}>
              🔥 Streak = consecutive days completing the daily puzzle for each game. Complete today's daily to maintain it.
            </Text>
          </>
        )}

        {/* Logout */}
        {!user?.isAnonymous && user != null && (
          <TouchableOpacity style={[S.dangerBtn, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => setShowLogoutConfirm(true)}>
            <Text style={S.dangerBtnText}>Log out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ConfirmModal
        visible={showLogoutConfirm}
        title="Log out?"
        message="You'll need to log back in to access your saved progress."
        confirmLabel="Log out"
        confirmDanger
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 },
  heading: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, marginBottom: 20 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  identityRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 },
  avatarText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 22 },
  nameText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 16, marginBottom: 3 },
  subText: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  usernameSection: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, marginBottom: 2 },
  fieldValue: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 15 },
  editBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  upgradeBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, borderWidth: 1, marginBottom: 16, alignItems: 'center' },
  upgradeBtnText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  sectionTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 16 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, marginBottom: 8, borderWidth: 1 },
  errorText: { color: '#ef4444', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 },
  saveBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 14 },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
  totalCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  totalValue: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 30 },
  totalLabel: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 },
  statsHeaderRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  statsHeaderGame: { flex: 1.2, fontFamily: 'SpaceGrotesk-Medium', fontSize: 11 },
  statsHeaderCell: { flex: 1, fontFamily: 'SpaceGrotesk-Medium', fontSize: 11, textAlign: 'center' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  statGame: { flex: 1.2, fontFamily: 'SpaceGrotesk-Medium', fontSize: 13 },
  statCell: { flex: 1, fontSize: 12, textAlign: 'center' },
  streakNote: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: -8, marginBottom: 16, paddingHorizontal: 8 },
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, marginBottom: 12 },
  secondaryBtnText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
  dangerBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  dangerBtnText: { color: '#f87171', fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 },
});