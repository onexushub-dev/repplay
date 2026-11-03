import { Pressable, StyleSheet } from 'react-native';

import { useT } from '../i18n/useT';
import { colors } from '../theme/tokens';
import { BatteryIcon, BatteryOffIcon } from './icons';

/** `size`: the setup screen's button beside the zoom is 52; the recording screen's, in the top row, is smaller. */
type Props = { on: boolean; onPress: () => void; size?: number };

/** Battery saving while recording, as one round button: amber when on, dark and crossed out when off. */
export function EconomyButton({ on, onPress, size = 52 }: Props) {
  const icon = Math.round(size / 2);
  const { t } = useT();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={t('setup.economy')}
      accessibilityHint={t('setup.economyHint')}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      style={[styles.button, { width: size, height: size, borderRadius: size / 2 }, on ? styles.on : styles.off]}>
      {on ? <BatteryIcon color={colors.onAccent} size={icon} /> : <BatteryOffIcon color={colors.soft} size={icon} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.accent },
  off: { backgroundColor: 'rgba(12,12,12,0.75)', borderWidth: 1, borderColor: colors.border },
});
