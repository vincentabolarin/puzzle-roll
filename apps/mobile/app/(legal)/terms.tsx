import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function TermsScreen() {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top', 'bottom']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Text style={{ color: '#6366f1', fontFamily: 'SpaceGrotesk-Medium', fontSize: 15 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={[S.heading, { color: t.textPrimary }]}>Terms of Service</Text>
      </View>
      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        <Text style={[S.date, { color: t.textMuted }]}>Last updated: May 2026</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>1. Acceptance</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>By downloading and using Puzzle Roll, you agree to these Terms of Service. If you disagree, please uninstall the app.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>2. Use of the App</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>Puzzle Roll is a puzzle game for personal, non-commercial use. You agree not to reverse-engineer, modify, or distribute the app. You must be at least 13 years old to create an account.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>3. Accounts</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>You are responsible for maintaining the security of your account credentials. You may delete your account at any time from the Profile screen. On deletion, your personal information is removed; anonymised statistics may be retained for leaderboard integrity.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>4. Leaderboards and Fair Play</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>Manipulating puzzle times, using automated tools, or exploiting bugs to gain leaderboard advantage is prohibited and may result in account termination.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>5. Advertising</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>The app displays advertisements via Google AdMob. Ad personalisation is subject to your consent choices. You may see non-personalised ads if consent is not granted.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>6. Disclaimer</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>Puzzle Roll is provided "as is" without warranties of any kind. We are not liable for any data loss or interruption of service.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>7. Changes</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>We may update these terms. Continued use after changes constitutes acceptance. Material changes will be notified via the app.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>8. Contact</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>Questions? Email support@puzzleroll.com</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 8 },
  heading: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 24 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  date: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 12, marginBottom: 20 },
  section: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 15, marginTop: 20, marginBottom: 6 },
  body: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, lineHeight: 20 },
});