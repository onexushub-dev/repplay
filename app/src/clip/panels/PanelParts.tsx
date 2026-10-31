import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme/tokens';

/** A tool panel's name and its one plain sentence. */
export function PanelHead({ title, hint, right }: { title: string; hint: string; right?: ReactNode }) {
  return (
    <View style={styles.head}>
      <View style={styles.headText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      {right}
    </View>
  );
}

/** A choice in a panel row: amber when it is the current one. */
export function Choice({
  label,
  a11y,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  a11y?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ? a11y : label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected ? styles.choiceOn : null, disabled ? styles.choiceOff : null]}>
      <Text style={[styles.choiceText, selected ? styles.choiceTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

export const panelStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  value: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  choice: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceOff: { opacity: 0.45 },
  choiceText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  choiceTextOn: { color: colors.onAccent },
});
