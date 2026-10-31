import { StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';

/**
 * What a tap on the battery-saving button did, over the preview for a moment (like the zoom bubble). `remote`: the
 * remote phone's own battery saving (its own wait and words).
 */
export function EconomyToast({ on, bottom, remote = false }: { on: boolean; bottom: number; remote?: boolean }) {
  const { t } = useT();
  const title = remote ? (on ? 'remote.economyOnTitle' : 'remote.economyOffTitle') : on ? 'setup.economyOnTitle' : 'setup.economyOffTitle';
  const body = remote ? (on ? 'remote.economyOnBody' : 'remote.economyOffBody') : on ? 'setup.economyOnBody' : 'setup.economyOffBody';
  return (
    <View testID="economy-toast" accessibilityRole="alert" pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <Text style={styles.title}>{t(title)}</Text>
      <Text style={styles.body}>{t(body)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 28,
    right: 28,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(15,16,13,0.82)',
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.soft, textAlign: 'center' },
});
