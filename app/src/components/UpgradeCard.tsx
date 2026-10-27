import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';
import { CrownIcon } from './icons';
import { ProBadge } from './ProBadge';

type Props = { title: string; message: string; action: string; badge: string; onPress: () => void };

/**
 * An invitation to unlock what the free plan holds back: the lime outline and the one small "Pro" pill of the paid
 * groups, a crown, a title, a short message and the action under it. The whole card is the button.
 */
export function UpgradeCard({ title, message, action, badge, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${message}`} onPress={onPress} style={styles.card}>
      <View style={styles.icon}>
        <CrownIcon color={colors.accent} size={26} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {/* Under the text, not beside it: the message keeps the card's whole width. */}
        <Text style={styles.action}>{`${action} →`}</Text>
      </View>
      <ProBadge label={badge} right={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 64,
    marginTop: 12, // the "Pro" pill rises 9 above the card: inside the list, not clipped by its top edge
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(214, 242, 63, 0.12)', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  message: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  action: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent, marginTop: 2 },
});
