import { TouchableOpacity, Text, View } from 'react-native';

interface HintButtonProps {
  hintsRemaining: number;
  onPress: () => void;
  disabled?: boolean;
}

export default function HintButton({ hintsRemaining, onPress, disabled }: HintButtonProps) {
  const hasHints = hintsRemaining > 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 border ${
        hasHints
          ? 'bg-surface border-border-subtle'
          : 'bg-amber-900/20 border-amber-700/40'
      }`}
      accessibilityLabel={
        hasHints
          ? `Use hint, ${hintsRemaining} remaining`
          : 'Watch ad to earn a hint'
      }
      accessibilityRole="button"
    >
      <Text className="text-base">💡</Text>
      <Text
        className={`font-sans-medium text-sm ${
          hasHints ? 'text-text-primary' : 'text-amber-400'
        }`}
      >
        {hasHints ? hintsRemaining : '+'}
      </Text>
    </TouchableOpacity>
  );
}
