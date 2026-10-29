import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { analytics } from '../analytics';
import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';

/** The player's switch for the anonymous usage metrics: on by default, and off means nothing is collected or queued. */
export function MetricsSwitch() {
  const { t } = useT();
  const [on, setOn] = useState(() => analytics.isEnabled());

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{t('games.metrics')}</Text>
        <Text style={styles.note}>{t('games.metricsNote')}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={(next) => {
          analytics.setEnabled(next);
          setOn(next);
        }}
        trackColor={{ true: colors.accent, false: colors.surface }}
        accessibilityLabel={t('games.metrics')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 20 },
  text: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
});
