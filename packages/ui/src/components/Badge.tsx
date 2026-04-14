import { View, Text } from 'react-native';

interface BadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
}

export function Badge({
  label,
  color = '#a5b4fc',
  backgroundColor = '#1e1b4b',
}: BadgeProps) {
  return (
    <View
      style={{
        backgroundColor,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color,
          fontFamily: 'SpaceGrotesk-Medium',
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
