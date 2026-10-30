import { StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';

/** What a tap on the battery-saving button did, over the preview for a moment (like the zoom bubble). */
export function EconomyToast({ on, bottom }: { on: boolean; bottom: number }) {
  const { t } = useT();
  return (
    <View testID="economy-toast" accessibilityRole="alert" pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <Text style={styles.title}>{t(on ? 'setup.economyOnTitle' : 'setup.economyOffTitle')}</Text>
      <Text style={styles.body}>{t(on ? 'setup.economyOnBody' : 'setup.economyOffBody')}</Text>
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
    backgroundColor: 'rgba(15,15,15,0.82)',
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.soft, textAlign: 'center' },
});
