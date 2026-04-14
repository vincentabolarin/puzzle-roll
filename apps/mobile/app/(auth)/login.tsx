import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../src/services/auth.service';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setIsLoading(true);
    try {
      await authService.login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      Alert.alert('Login failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-navy-950" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 px-6 justify-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute top-4 left-6"
            accessibilityLabel="Go back"
          >
            <Text className="text-text-secondary font-sans text-base">← Back</Text>
          </TouchableOpacity>

          <Text className="text-text-primary font-sans-bold text-3xl mb-2">Welcome back</Text>
          <Text className="text-text-secondary font-sans text-sm mb-8">
            Log in to sync your progress across devices
          </Text>

          <View className="gap-3 mb-6">
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-text-primary font-sans text-base"
              placeholder="Email"
              placeholderTextColor="#6b7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Email address"
            />
            <TextInput
              className="bg-surface border border-border rounded-xl px-4 py-3.5 text-text-primary font-sans text-base"
              placeholder="Password"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              accessibilityLabel="Password"
            />
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={isLoading || !email || !password}
            className={`rounded-xl py-4 items-center mb-4 ${
              isLoading || !email || !password ? 'bg-surface-2' : 'bg-game-sudoku'
            }`}
            accessibilityLabel="Log in"
            accessibilityRole="button"
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-sans-bold text-base">Log in</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/register')}
            accessibilityLabel="Create an account"
          >
            <Text className="text-text-secondary font-sans text-sm text-center">
              Don't have an account?{' '}
              <Text className="text-game-sudoku">Sign up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
