import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '../i18n/useT';
import { estimateMegabytes, type ShortSide, sideName, sideSize } from '../share/exportSize';
import { colors, fonts, radius } from '../theme/tokens';

/** What the sheet needs to describe each size: the frame's orientation, the export's length and whether it has sound. */
export type ExportQualityAsk = { choices: ShortSide[]; landscape: boolean; durationMs: number; sound: boolean };

type Props = {
  visible: boolean;
  ask: ExportQualityAsk;
  /** A size, or null for Cancelar. */
  onChoose: (side: ShortSide | null) => void;
};

/** Before a 4K clip leaves the app (save, share): 4K, 2K or Full HD, each with its pixels and a rough file size. */
export function ExportQualitySheet({ visible, ask, onChoose }: Props) {
  const { t } = useT();
  const largest = ask.choices[0];
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={() => onChoose(null)}
      supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel={t('common.cancel')} style={StyleSheet.absoluteFill} onPress={() => onChoose(null)} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            {t('exportQuality.title')}
          </Text>
          <Text style={styles.subtitle}>{t('exportQuality.subtitle')}</Text>

          <View style={styles.list}>
            {ask.choices.map((side) => {
              const { width, height } = sideSize(side, ask.landscape);
              const pixels = t('exportQuality.pixels', { width, height });
              const size = t('exportQuality.approx', { size: estimateMegabytes(side, ask.durationMs, ask.sound) });
              const note = side === largest ? t('exportQuality.original') : undefined;
              const spoken = [sideName(side), note, pixels, size].filter((part) => part !== undefined).join(', ');
              return (
                <Pressable
                  key={side}
                  accessibilityRole="button"
                  accessibilityLabel={spoken}
                  onPress={() => onChoose(side)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>
                      {sideName(side)}
                      {note !== undefined ? <Text style={styles.rowTag}>{`  ${note}`}</Text> : null}
                    </Text>
                    <Text style={styles.rowNote}>{pixels}</Text>
                  </View>
                  <Text style={styles.rowSize}>{size}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{t('exportQuality.hint')}</Text>

          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChoose(null)} style={styles.cancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  title: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.text, marginTop: 6 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.soft, marginTop: -6 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.ground,
  },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  rowTag: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.accent },
  rowNote: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },
  rowSize: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
});
