import { View, ActivityIndicator, Text } from 'react-native';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
}

export function LoadingSpinner({
  message,
  size = 'large',
  color = '#6366f1',
}: LoadingSpinnerProps) {
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message ?? 'Loading'}
    >
      <ActivityIndicator size={size} color={color} />
      {message && (
        <Text style={{ color: '#9ca3af', fontFamily: 'SpaceGrotesk-Regular', fontSize: 14 }}>
          {message}
        </Text>
      )}
    </View>
  );
}
