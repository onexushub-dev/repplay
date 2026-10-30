import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme/tokens';

export const SCRIM = 'rgba(15,15,15,0.74)';
export const EDGE = 'rgba(255,255,255,0.22)';

/** A round icon button over the video; `loading` shows a spinner in place of the icon while its job runs. */
export function IconButton({
  label,
  onPress,
  disabled,
  loading,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[styles.icon, disabled && !loading ? styles.off : null]}>
      {loading ? <ActivityIndicator color={colors.text} /> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SCRIM,
    borderWidth: 1,
    borderColor: EDGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: 0.4 },
});
