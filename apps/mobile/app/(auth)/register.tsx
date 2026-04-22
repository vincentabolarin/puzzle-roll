import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../src/services/auth.service';
import { apiClient } from '../../src/lib/api-client';
import { useAuthStore } from '../../src/stores/auth.store';
import { useAppTheme } from '../../src/hooks/useAppTheme';

export default function RegisterScreen() {
  const t = useAppTheme();
  const { setUsername } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsernameInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDark = t.background !== '#f9fafb';

  const validate = (): string | null => {
    if (!email.trim()) return 'Please enter your email.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) return 'Please enter a valid email.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (username.trim() && (username.trim().length < 2 || username.trim().length > 20)) return 'Username must be 2–20 characters.';
    if (username.trim() && !/^[a-zA-Z0-9_-]+$/.test(username.trim())) return 'Username may only contain letters, numbers, _ and -.';
    return null;
  };

  const handleRegister = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setIsLoading(true);
    try {
      await authService.register(email.trim().toLowerCase(), password);
      // Set optional username after account creation
      if (username.trim()) {
        try {
          await apiClient.patch('/users/me/username', { username: username.trim() });
          setUsername(username.trim());
        } catch {
          // Non-fatal — username can be set later from profile
        }
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = !!email && password.length >= 8 && !isLoading;

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.container}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn} accessibilityLabel="Go back">
            <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>

          <Text style={[S.title, { color: t.textPrimary }]}>Create account</Text>
          <Text style={[S.subtitle, { color: t.textSecondary }]}>
            Save your progress and compete on the daily leaderboard
          </Text>

          {error ? (
            <View style={[S.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: '#f87171' }]}>
              <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
            </View>
          ) : null}

          <View style={S.fields}>
            <TextInput
              style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: t.border }]}
              placeholder="Email"
              placeholderTextColor={t.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Email address"
            />
            <TextInput
              style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: t.border }]}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={t.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              accessibilityLabel="Password"
            />
            <TextInput
              style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: t.border }]}
              placeholder="Username (optional, 2–20 chars)"
              placeholderTextColor={t.textMuted}
              value={username}
              onChangeText={setUsernameInput}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Username (optional)"
            />
          </View>

          <TouchableOpacity
            onPress={handleRegister}
            disabled={!canSubmit}
            style={[S.primaryBtn, { opacity: canSubmit ? 1 : 0.45 }]}
            accessibilityLabel="Create account"
            accessibilityRole="button"
          >
            {isLoading
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={S.primaryBtnText}>Create account</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} accessibilityLabel="Already have an account, log in">
            <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center' }}>
              Already have an account?{' '}
              <Text style={{ color: '#6366f1' }}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 16, left: 24 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, marginBottom: 6 },
  subtitle: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, marginBottom: 24 },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  fields: { gap: 10, marginBottom: 20 },
  input: {
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, borderWidth: 1,
  },
  primaryBtn: {
    backgroundColor: '#6366f1', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
});