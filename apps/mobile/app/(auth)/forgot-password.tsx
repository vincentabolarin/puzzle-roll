import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../src/lib/api-client';
import { useAppTheme } from '../../src/hooks/useAppTheme';

export default function ForgotPasswordScreen() {
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Please enter a valid email.'); return; }
    setError(null); setIsLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: clean });
    } catch {
      // Always show success — prevents email enumeration
    } finally {
      setIsLoading(false);
      setSent(true);
    }
  };

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.container}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn} accessibilityLabel="Go back">
            <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>

          <Text style={[S.title, { color: t.textPrimary }]}>Forgot password</Text>

          {sent ? (
            <View style={{ alignItems: 'center', paddingTop: 16 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📬</Text>
              <Text style={[S.sentTitle, { color: t.textPrimary }]}>Check your email</Text>
              <Text style={[S.sentBody, { color: t.textSecondary }]}>
                If that email is registered, we've sent a reset link. It expires in 1 hour.
              </Text>
              <TouchableOpacity style={S.primaryBtn} onPress={() => router.replace('/(auth)/login' as never)}>
                <Text style={S.primaryBtnText}>Back to login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[S.subtitle, { color: t.textSecondary }]}>
                Enter your email and we'll send a link to reset your password.
              </Text>
              {error && (
                <View style={[S.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: '#f87171' }]}>
                  <Text style={{ color: '#ef4444', fontFamily: 'SpaceGrotesk-Regular', fontSize: 13 }}>{error}</Text>
                </View>
              )}
              <TextInput
                style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: error ? '#f87171' : t.border }]}
                placeholder="Email"
                placeholderTextColor={t.textMuted}
                value={email}
                onChangeText={v => { setEmail(v); setError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Email address"
              />
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!email || isLoading}
                style={[S.primaryBtn, { opacity: email && !isLoading ? 1 : 0.45 }]}
                accessibilityLabel="Send reset link"
              >
                {isLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={S.primaryBtnText}>Send reset link</Text>
                }
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