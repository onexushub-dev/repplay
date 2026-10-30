import { Pressable, StyleSheet } from 'react-native';

import { useT } from '../i18n/useT';
import { colors } from '../theme/tokens';
import { BatteryIcon, BatteryOffIcon } from './icons';

type Props = { on: boolean; onPress: () => void };

/** Battery saving while recording, as one round button beside the zoom: lime when on, dark and crossed out when off. */
export function EconomyButton({ on, onPress }: Props) {
  const { t } = useT();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={t('setup.economy')}
      accessibilityHint={t('setup.economyHint')}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.button, on ? styles.on : styles.off]}>
      {on ? <BatteryIcon color={colors.onAccent} /> : <BatteryOffIcon color={colors.soft} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.accent },
  off: { backgroundColor: 'rgba(15,15,15,0.75)', borderWidth: 1, borderColor: colors.border },
});
