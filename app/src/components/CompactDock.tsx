import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';

type Props = {
  onSettings: () => void;
  onStart: () => void;
  /** The camera is opening or the game is starting: "Gravar" waits. */
  busy: boolean;
  error?: string | null;
};

/**
 * What the setup controls shrink to when the phone is held on its side: two small buttons at the edge instead of
 * the settings sheet, so the camera and its positioning guide stay clear. The settings open on demand.
 */
export function CompactDock({ onSettings, onStart, busy, error }: Props) {
  const { t } = useT();
  return (
    <SafeAreaView edges={['bottom']} pointerEvents="box-none" style={styles.dock}>
      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View pointerEvents="box-none" style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('setup.dockSettings')}
          onPress={onSettings}
          style={[styles.button, styles.settings]}>
          <Text style={styles.settingsText}>{t('setup.dockSettings')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('setup.dockRecord')}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onStart}
          style={[styles.button, styles.record, busy && styles.busy]}>
          {busy ? <ActivityIndicator color={colors.onAccent} /> : null}
          <Text style={styles.recordText}>{t('setup.dockRecord')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  button: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  settings: { backgroundColor: 'rgba(15,15,15,0.75)' },
  settingsText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  record: { backgroundColor: colors.accent, paddingHorizontal: 30 },
  recordText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.onAccent },
  busy: { opacity: 0.5 },
  error: { backgroundColor: 'rgba(15,15,15,0.85)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, marginHorizontal: 16 },
  errorText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.warning },
});
