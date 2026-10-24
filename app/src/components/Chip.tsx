import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

/** `lockedHint`: read out after the label of a paid option the player does not have. `grouped`: no outline of its own, because a group around several chips has it. */
type Props = { label: string; selected?: boolean; onPress?: () => void; lockedHint?: string; grouped?: boolean };

export function Chip({ label, selected = false, onPress, lockedHint, grouped = false }: Props) {
  const spoken = [label, lockedHint].filter((part) => part !== undefined).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : grouped ? styles.grouped : styles.idle]}>
      <Text style={[styles.label, { color: selected ? colors.onAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 44, paddingHorizontal: 14, borderRadius: radius.chip, justifyContent: 'center', flexDirection: 'row', alignItems: 'center' },
  selected: { backgroundColor: colors.accent },
  grouped: { height: 42 },
  idle: { borderWidth: 1, borderColor: colors.border },
  label: { fontFamily: fonts.bodySemi, fontSize: 14 },
});
