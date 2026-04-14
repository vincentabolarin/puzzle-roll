import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../../src/services/auth.service';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || password.length < 8) {
      Alert.alert('Invalid input', 'Password must be at least 8 characters.');
      return;
    }
    setIsLoading(true);
    try {
      await authService.register(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      Alert.alert('Registration failed', message);
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

          <Text className="text-text-primary font-sans-bold text-3xl mb-2">Create account</Text>
          <Text className="text-text-secondary font-sans text-sm mb-8">
            Save your progress and compete on the daily leaderboard
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
              placeholder="Password (min 8 characters)"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              accessibilityLabel="Password"
            />
          </View>

          <TouchableOpacity
            onPress={handleRegister}
            disabled={isLoading || !email || password.length < 8}
            className={`rounded-xl py-4 items-center mb-4 ${
              isLoading || !email || password.length < 8 ? 'bg-surface-2' : 'bg-game-sudoku'
            }`}
            accessibilityLabel="Create account"
            accessibilityRole="button"
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-sans-bold text-base">Create account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            accessibilityLabel="Already have an account, log in"
          >
            <Text className="text-text-secondary font-sans text-sm text-center">
              Already have an account?{' '}
              <Text className="text-game-sudoku">Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
