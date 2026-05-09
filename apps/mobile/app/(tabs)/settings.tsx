import { View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useSettingsStore, ThemeOption } from '../../src/stores/settings.store';
import { useAuthStore } from '../../src/stores/auth.store';
import { useTheme } from '../_layout';
import { themes } from '../../src/lib/theme';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: string }[] = [
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
  { value: 'system', label: 'System', icon: '📱' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

interface UserSettingsResponse {
  settings: {
    notificationEnabled: boolean;
    notificationHour: number;
    soundEnabled: boolean;
    hapticsEnabled: boolean;
    autoRemoveNotes: boolean;
    timezone: string;
  } | null;
}

export default function SettingsScreen() {
  const {
    soundEnabled, setSoundEnabled,
    hapticsEnabled, setHapticsEnabled,
    autoRemoveNotes, setAutoRemoveNotes,
    queensAutoMark, setQueensAutoMark,
    theme, setTheme,
  } = useSettingsStore();
  const { user } = useAuthStore();
  const { registerForPushNotifications } = usePushNotifications();
  const resolvedTheme = useTheme();
  const t = themes[resolvedTheme];
  const queryClient = useQueryClient();

  // ─── Server-side notification settings ──────────────────────────────────────
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(8);
  const [permissionStatus, setPermissionStatus] = useState<string>('unavailable');

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: queryKeys.user.me,
    queryFn: () => apiClient.get<UserSettingsResponse>('/users/me'),
    enabled: !!user && !user.isAnonymous,
  });

  useEffect(() => {
    if (meData?.settings) {
      setNotifEnabled(meData.settings.notificationEnabled);
      setNotifHour(meData.settings.notificationHour ?? 8);
    }
  }, [meData]);

  // Check device permission status — skipped entirely in Expo Go
  useEffect(() => {
    if (IS_EXPO_GO) return;
    import('expo-notifications').then(({ getPermissionsAsync }) => {
      getPermissionsAsync()
        .then(({ status }) => setPermissionStatus(status))
        .catch(() => {});
    }).catch(() => {});
  }, []);

  const { mutate: saveNotifSettings, isPending: savingNotif } = useMutation({
    mutationFn: (payload: { notificationEnabled: boolean; notificationHour: number }) =>
      apiClient.patch('/users/me/notifications', {
        ...payload,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffsetMinutes: -(new Date().getTimezoneOffset()),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.me });
    },
  });

  const handleToggleNotifications = async (value: boolean) => {
    if (IS_EXPO_GO) return;
    setNotifEnabled(value);
    if (value && permissionStatus !== 'granted') {
      const { status } = await import('expo-notifications').then((m) =>
        m.requestPermissionsAsync()
      ).catch(() => ({ status: 'denied' }));
      setPermissionStatus(status);
      if (status !== 'granted') {
        setNotifEnabled(false);
        return;
      }
      await registerForPushNotifications();
    }
    saveNotifSettings({ notificationEnabled: value, notificationHour: notifHour });
  };

  const handleHourChange = (hour: number) => {
    setNotifHour(hour);
    saveNotifSettings({ notificationEnabled: notifEnabled, notificationHour: hour });
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function SettingRow({ label, description, value, onChange, disabled }: {
    label: string; description?: string; value: boolean;
    onChange: (v: boolean) => void; disabled?: boolean;
  }) {
    return (
      <View style={[styles.row, disabled && { opacity: 0.45 }]}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.rowLabel, { color: t.textPrimary }]}>{label}</Text>
          {description ? <Text style={[styles.rowDesc, { color: t.textMuted }]}>{description}</Text> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: t.surface3, true: t.accent }}
          thumbColor="#ffffff"
        />
      </View>
    );
  }

  const isLoggedIn = !!user && !user.isAnonymous;
  const isDark = resolvedTheme === 'dark';
  const notificationsUnavailable = IS_EXPO_GO || permissionStatus === 'unavailable';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: t.textPrimary }]}>Settings</Text>

        {/* ── Appearance ─────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <Text style={[styles.themeTitle, { color: t.textPrimary }]}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setTheme(opt.value)}
                  style={[
                    styles.themeOption,
                    {
                      borderColor: active ? t.accent : t.borderSubtle,
                      backgroundColor: active ? t.accent + '22' : t.surface2,
                    },
                  ]}
                  accessibilityLabel={`Theme: ${opt.label}`}
                  accessibilityRole="radio"
                >
                  <Text style={styles.themeIcon}>{opt.icon}</Text>
                  <Text style={[styles.themeLabel, { color: active ? t.accent : t.textSecondary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ height: 14 }} />
        </View>

        {/* ── Audio & Feedback ────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Audio & Feedback</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <SettingRow
            label="Sound effects"
            description="Play sounds on cell interactions and completion"
            value={soundEnabled}
            onChange={setSoundEnabled}
          />
          <View style={[styles.divider, { backgroundColor: t.borderSubtle }]} />
          <SettingRow
            label="Haptics"
            description="Vibrate on tap and puzzle completion"
            value={hapticsEnabled}
            onChange={setHapticsEnabled}
          />
        </View>

        {/* ── Sudoku ─────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Sudoku</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <SettingRow
            label="Auto-remove notes"
            description="Erase pencil marks from related cells when you place a digit"
            value={autoRemoveNotes}
            onChange={setAutoRemoveNotes}
          />
        </View>

        {/* ── Queens ─────────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Queens</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <SettingRow
            label="Auto-place markers"
            description="Automatically mark × in cells that conflict with a placed queen"
            value={queensAutoMark}
            onChange={setQueensAutoMark}
          />
        </View>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Notifications</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          {IS_EXPO_GO ? (
            <View style={styles.row}>
              <Text style={[styles.rowDesc, { color: t.textMuted, flex: 1 }]}>
                Push notifications are not available in Expo Go. Use a development build to enable them.
              </Text>
            </View>
          ) : !isLoggedIn ? (
            <View style={styles.row}>
              <Text style={[styles.rowDesc, { color: t.textMuted, flex: 1 }]}>
                Sign in to enable daily puzzle reminders and streak alerts.
              </Text>
            </View>
          ) : meLoading ? (
            <View style={[styles.row, { justifyContent: 'center' }]}>
              <ActivityIndicator color={t.accent} />
            </View>
          ) : (
            <>
              {permissionStatus === 'denied' && (
                <View style={[styles.permissionBanner, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderBottomColor: t.borderSubtle }]}>
                  <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Medium', fontSize: 12 }}>
                    Notifications are blocked. Enable them in your device Settings app.
                  </Text>
                </View>
              )}

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.rowLabel, { color: t.textPrimary }]}>Daily reminders</Text>
                  <Text style={[styles.rowDesc, { color: t.textMuted }]}>
                    Get notified when today's puzzles are ready
                  </Text>
                </View>
                <Switch
                  value={notifEnabled}
                  onValueChange={handleToggleNotifications}
                  disabled={savingNotif || permissionStatus === 'denied'}
                  trackColor={{ false: t.surface3, true: t.accent }}
                  thumbColor="#ffffff"
                />
              </View>

              {notifEnabled && (
                <>
                  <View style={[styles.divider, { backgroundColor: t.borderSubtle }]} />
                  <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <Text style={[styles.rowLabel, { color: t.textPrimary, marginBottom: 4 }]}>
                      Reminder time
                    </Text>
                    <Text style={[styles.rowDesc, { color: t.textMuted, marginBottom: 12 }]}>
                      Notifications fire in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                    >
                      {HOURS.map((h) => {
                        const active = notifHour === h;
                        return (
                          <TouchableOpacity
                            key={h}
                            onPress={() => handleHourChange(h)}
                            style={[
                              styles.hourChip,
                              {
                                backgroundColor: active ? t.accent : t.surface2,
                                borderColor: active ? t.accent : t.borderSubtle,
                              },
                            ]}
                            accessibilityLabel={`Set reminder to ${formatHour(h)}`}
                            accessibilityRole="radio"
                          >
                            <Text style={[
                              styles.hourChipText,
                              { color: active ? '#ffffff' : t.textSecondary },
                            ]}>
                              {formatHour(h)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </>
              )}
            </>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 },
  heading: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, marginBottom: 24 },
  sectionLabel: {
    fontFamily: 'SpaceGrotesk-Medium', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4,
  },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 24, overflow: 'hidden' },
  themeTitle: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 15, padding: 16, paddingBottom: 10 },
  themeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  themeOption: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  themeIcon: { fontSize: 22, marginBottom: 4 },
  themeLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 15, marginBottom: 2 },
  rowDesc: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, lineHeight: 16 },
  divider: { height: 1, marginHorizontal: 16 },
  permissionBanner: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  hourChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
    minWidth: 80, alignItems: 'center',
  },
  hourChipText: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 12 },
});