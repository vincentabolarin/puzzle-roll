import { View, Text, TouchableOpacity } from 'react-native';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  emoji = '🔍',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}
    >
      <Text style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</Text>
      <Text
        style={{
          color: '#f9fafb',
          fontFamily: 'SpaceGrotesk-Bold',
          fontSize: 18,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            color: '#9ca3af',
            fontFamily: 'SpaceGrotesk-Regular',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={{
            marginTop: 16,
            backgroundColor: '#6366f1',
            borderRadius: 12,
            paddingHorizontal: 24,
            paddingVertical: 12,
          }}
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
        >
          <Text style={{ color: '#ffffff', fontFamily: 'SpaceGrotesk-Medium', fontSize: 14 }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
