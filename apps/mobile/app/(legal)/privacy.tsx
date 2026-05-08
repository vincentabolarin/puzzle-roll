import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function PrivacyScreen() {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top', 'bottom']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Text style={{ color: '#6366f1', fontFamily: 'SpaceGrotesk-Medium', fontSize: 15 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={[S.heading, { color: t.textPrimary }]}>Privacy Policy</Text>
      </View>
      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        <Text style={[S.date, { color: t.textMuted }]}>Last updated: May 2026</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Information we collect</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>
          {'• Email address (if you create an account)\n• Username (optional)\n• Puzzle completion times and hint usage\n• Device platform (iOS/Android) for push notifications\n• Push notification token\n• Anonymous device ID for guest play'}
        </Text>

        <Text style={[S.section, { color: t.textPrimary }]}>How we use it</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>
          {'• To provide the game service and leaderboards\n• To send daily puzzle reminders (if opted in)\n• To send streak alerts (if opted in)\n• To display advertisements via Google AdMob'}
        </Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Advertising (Google AdMob)</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>We use Google AdMob to display ads. AdMob may collect device identifiers and usage data to serve personalised ads. You can opt out of personalised ads via your device settings or through the consent dialog shown at first launch. For EEA users, we use Google's User Messaging Platform for consent management.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Data sharing</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>We do not sell your personal data. We share data only with: Google (AdMob advertising, Firebase for push notifications on Android), and Expo (push notification delivery).</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Data retention</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>Account data is retained until you delete your account. On deletion, your email, username, and password are permanently removed. Anonymised game statistics may be retained for leaderboard integrity.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Your rights (EEA/UK)</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>You have the right to access, correct, or delete your personal data. To exercise these rights, delete your account in the app or email privacy@puzzleroll.com.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Security</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>Passwords are hashed using bcrypt. Data is transmitted over HTTPS. We do not store payment information.</Text>

        <Text style={[S.section, { color: t.textPrimary }]}>Contact</Text>
        <Text style={[S.body, { color: t.textSecondary }]}>privacy@puzzleroll.com</Text>
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