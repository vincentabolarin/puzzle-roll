import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../src/lib/api-client';
import { useAppTheme } from '../../src/hooks/useAppTheme';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!token) { setError('Invalid or missing reset token.'); return; }

    setError(null);
    setIsLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setError(msg.includes('expired') || msg.includes('invalid')
        ? 'This reset link has expired or already been used. Request a new one.'
        : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.container}>
          {!done && (
            <TouchableOpacity onPress={() => router.back()} style={S.backBtn} accessibilityLabel="Go back">
              <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 15 }}>← Back</Text>
            </TouchableOpacity>
          )}

          <Text style={[S.title, { color: t.textPrimary }]}>Reset password</Text>

          {done ? (
            <View style={{ alignItems: 'center', paddingTop: 16 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
              <Text style={[S.sentTitle, { color: t.textPrimary }]}>Password updated</Text>
              <Text style={[S.sentBody, { color: t.textSecondary }]}>
                Your password has been changed. You can now log in with your new password.
              </Text>
              <TouchableOpacity
                style={S.primaryBtn}
                onPress={() => router.replace('/(auth)/login' as never)}
                accessibilityLabel="Go to login"
              >
                <Text style={S.primaryBtnText}>Log in</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[S.subtitle, { color: t.textSecondary }]}>
                Choose a new password for your account.
              </Text>

              {!token && (
                <View style={[S.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: '#f87171' }]}>
                  <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>
                    Invalid reset link. Please request a new one.
                  </Text>
                </View>
              )}

              {error && (
                <View style={[S.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: '#f87171' }]}>
                  <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>{error}</Text>
                </View>
              )}

              <TextInput
                style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: error ? '#f87171' : t.border }]}
                placeholder="New password"
                placeholderTextColor={t.textMuted}
                value={password}
                onChangeText={v => { setPassword(v); setError(null); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="New password"
              />
              <TextInput
                style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: error ? '#f87171' : t.border, marginBottom: 24 }]}
                placeholder="Confirm new password"
                placeholderTextColor={t.textMuted}
                value={confirm}
                onChangeText={v => { setConfirm(v); setError(null); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Confirm new password"
              />

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!password || !confirm || isLoading || !token}
                style={[S.primaryBtn, { opacity: password && confirm && !isLoading && token ? 1 : 0.45 }]}
                accessibilityLabel="Set new password"
              >
                {isLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.primaryBtnText}>Set new password</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/(auth)/forgot-password' as never)}
                style={{ marginTop: 16, alignItems: 'center' }}
                accessibilityLabel="Request a new reset link"
              >
                <Text style={{ color: t.textMuted, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>
                  Link expired? Request a new one
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 16, left: 24 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, marginBottom: 8 },
  subtitle: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, marginBottom: 24, lineHeight: 19 },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, borderWidth: 1, marginBottom: 16 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
  sentTitle: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, marginBottom: 10, textAlign: 'center' },
  sentBody: { fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 28 },
});