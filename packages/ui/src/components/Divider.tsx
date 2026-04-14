import { View, Text } from 'react-native';

interface DividerProps {
  label?: string;
}

export function Divider({ label }: DividerProps) {
  if (!label) {
    return (
      <View
        style={{ height: 1, backgroundColor: '#1f2937', marginVertical: 12 }}
        accessibilityRole="separator"
      />
    );
  }

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: '#1f2937' }} />
      <Text style={{ color: '#6b7280', fontFamily: 'SpaceGrotesk-Regular', fontSize: 12 }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: '#1f2937' }} />
    </View>
  );
}
