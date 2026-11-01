import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = {
  icon: ReactNode;
  title: string;
  /** Optional second line; without it the title carries the whole action and turns accent when active. */
  status?: string;
  active?: boolean;
  disabled?: boolean;
  /** A paid trigger the player does not have: `lockedHint` is read out after the status (the group around it shows the "Pro" badge). */
  lockedHint?: string;
  onPress?: () => void;
};

/** One way of saving a lance, with its live status (setup screen). */
export function TriggerTile({ icon, title, status, active = false, disabled = false, lockedHint, onPress }: Props) {
  const body = (
    <>
      {icon}
      <View style={styles.text}>
        <Text style={[styles.title, status === undefined && active && { color: colors.accent }]}>{title}</Text>
        {status === undefined ? null : (
          <Text style={[styles.status, active && { color: colors.accent }]}>{status}</Text>
        )}
      </View>
    </>
  );
  const label = [title, status, lockedHint].filter((part) => part !== undefined).join(', ');
  if (!onPress) {
    return (
      <View style={[styles.tile, disabled && styles.disabled]} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tile, disabled && styles.disabled]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.5 },
  // minWidth 0: a long title wraps inside the tile instead of running past its edge.
  text: { flex: 1, flexShrink: 1, minWidth: 0 },
  title: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
