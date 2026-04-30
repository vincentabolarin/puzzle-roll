import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../src/services/auth.service';
import { useAppTheme } from '../../src/hooks/useAppTheme';

export default function LoginScreen() {
  const t = useAppTheme();
  const isDark = t.background !== '#f9fafb';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setError(null);
    setIsLoading(true);
    try {
      await authService.login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = !!email && !!password && !isLoading;

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: t.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.container}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn} accessibilityLabel="Go back">
            <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 15 }}>← Back</Text>
          </TouchableOpacity>

          <Text style={[S.title, { color: t.textPrimary }]}>Welcome back</Text>
          <Text style={[S.subtitle, { color: t.textSecondary }]}>
            Log in to sync your progress across devices
          </Text>

          {error && (
            <View style={[S.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: '#f87171' }]}>
              <Text style={{ fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, color: '#ef4444' }}>{error}</Text>
            </View>
          )}

          <View style={S.fields}>
            <TextInput
              style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: error ? '#f87171' : t.border }]}
              placeholder="Email"
              placeholderTextColor={t.textMuted}
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Email address"
            />
            <TextInput
              style={[S.input, { backgroundColor: t.surface, color: t.textPrimary, borderColor: error ? '#f87171' : t.border }]}
              placeholder="Password"
              placeholderTextColor={t.textMuted}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              secureTextEntry
              accessibilityLabel="Password"
            />
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={!canSubmit}
            style={[S.primaryBtn, { opacity: canSubmit ? 1 : 0.45 }]}
            accessibilityLabel="Log in"
            accessibilityRole="button"
          >
            {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={S.primaryBtnText}>Log in</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/register')} accessibilityLabel="Create an account">
            <Text style={{ color: t.textSecondary, fontFamily: 'SpaceGrotesk-Regular', fontSize: 13, textAlign: 'center' }}>
              Don't have an account?{' '}
              <Text style={{ color: '#6366f1' }}>Sign up</Text>
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
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontFamily: 'SpaceGrotesk-Regular', fontSize: 14, borderWidth: 1 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  primaryBtnText: { color: '#fff', fontFamily: 'SpaceGrotesk-Bold', fontSize: 15 },
});