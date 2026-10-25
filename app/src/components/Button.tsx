import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Shows a spinner and blocks presses while something is being done; the label should then say what ("Conectando…"). */
  loading?: boolean;
  icon?: ReactNode;
  /** Read by screen readers after the label ("Compilar é do plano pago"). */
  hint?: string;
};

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, icon, hint }: Props) {
  const primary = variant !== 'secondary';
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? (variant === 'danger' ? styles.danger : styles.primary) : styles.secondary,
        (pressed || blocked) && { opacity: disabled ? 0.4 : 0.85 },
      ]}>
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={primary ? colors.onAccent : colors.text} /> : icon}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.label, { color: primary ? colors.onAccent : colors.text }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 58,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.rec },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: fonts.bodyBold, fontSize: 17 },
});
