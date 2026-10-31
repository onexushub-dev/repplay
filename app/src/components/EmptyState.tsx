import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = {
  /** An icon in the accent color, about 40 px. */
  icon: ReactNode;
  title: string;
  message: string;
};

/**
 * The placeholder pattern for a screen or list with nothing to show yet: an icon in a dashed ring (the buffer that is
 * always listening, waiting for the first lance), a short title and one line that says what fills the space.
 */
export function EmptyState({ icon, title, message }: Props) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`${title}. ${message}`}>
      <View style={styles.ring}>
        <View style={styles.core}>{icon}</View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingTop: 64, paddingHorizontal: 24 },
  ring: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,176,0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  core: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayBold, fontSize: 28, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.text, textAlign: 'center' },
  message: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.soft, textAlign: 'center', maxWidth: 280 },
});
