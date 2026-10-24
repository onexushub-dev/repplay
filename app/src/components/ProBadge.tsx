import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';
import { LockIcon } from './icons';

/** The "Pro" mark of a paid option the player does not have: lock and text in an accent pill, pinned over the upper edge of its parent. */
export function ProBadge({ label, right = 10, top = -9 }: { label: string; right?: number; top?: number }) {
  return (
    <View pointerEvents="none" style={[styles.badge, { top, right }]}>
      <LockIcon color={colors.onAccent} size={9} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.onAccent },
});
