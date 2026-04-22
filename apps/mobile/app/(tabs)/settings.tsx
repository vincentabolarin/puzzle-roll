import { View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsStore, ThemeOption } from '../../src/stores/settings.store';
import { useTheme } from '../_layout';
import { themes } from '../../src/lib/theme';

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: string }[] = [
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
  { value: 'system', label: 'System', icon: '📱' },
];

export default function SettingsScreen() {
  const {
    soundEnabled, setSoundEnabled,
    hapticsEnabled, setHapticsEnabled,
    autoRemoveNotes, setAutoRemoveNotes,
    theme, setTheme,
  } = useSettingsStore();

  const resolvedTheme = useTheme();
  const t = themes[resolvedTheme];

  function SettingRow({ label, description, value, onChange }: {
    label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
  }) {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.rowLabel, { color: t.textPrimary }]}>{label}</Text>
          {description ? <Text style={[styles.rowDesc, { color: t.textMuted }]}>{description}</Text> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: t.surface3, true: t.accent }}
          thumbColor="#ffffff"
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: t.textPrimary }]}>Settings</Text>

        {/* Theme */}
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

        {/* Audio */}
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

        {/* Sudoku */}
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Sudoku</Text>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.borderSubtle }]}>
          <SettingRow
            label="Auto-remove notes"
            description="Erase pencil marks from related cells when you place a digit"
            value={autoRemoveNotes}
            onChange={setAutoRemoveNotes}
          />
        </View>

        <Text style={[styles.footer, { color: t.textMuted }]}>
          More game settings coming soon.
        </Text>
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
  footer: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, textAlign: 'center', marginTop: 8 },
});