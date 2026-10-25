import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { Button } from './Button';
import { CheckIcon, ClipIcon, FocusIcon, LockIcon, SoundIcon } from './icons';

export type FreeExportChoice = 'unlock' | 'go' | 'cancel';

type Props = {
  visible: boolean;
  /** Modo Foco is on in the editor: the framing will not be in the video. */
  focusLost: boolean;
  onChoose: (choice: FreeExportChoice) => void;
  /** The sheet is fully gone (iOS only: Android has no such event). */
  onDismissed?: () => void;
};

function Row({ icon, title, note }: { icon: ReactNode; title: string; note: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}. ${note}`}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowNote}>{note}</Text>
      </View>
      <LockIcon color={colors.warning} size={16} />
    </View>
  );
}

/**
 * Shown before a free recording leaves the app (save, share, compile): what its video will not have, what it does,
 * and the way to unlock it. The same sheet serves every export path.
 */
export function FreeExportSheet({ visible, focusLost, onChoose, onDismissed }: Props) {
  const { t } = useT();
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={() => onChoose('cancel')}
      onDismiss={onDismissed}
      supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel={t('common.cancel')} style={StyleSheet.absoluteFill} onPress={() => onChoose('cancel')} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            {t('freeExport.title')}
          </Text>
          <Text style={styles.subtitle}>{t('freeExport.subtitle')}</Text>

          <View style={styles.included}>
            <CheckIcon color={colors.accent} size={16} />
            <Text style={styles.includedText}>{t('freeExport.included')}</Text>
          </View>

          <View style={styles.list}>
            <Row icon={<SoundIcon color={colors.soft} size={20} />} title={t('freeExport.sound')} note={t('freeExport.soundNote')} />
            {focusLost ? (
              <Row icon={<FocusIcon color={colors.soft} size={20} />} title={t('freeExport.focus')} note={t('freeExport.focusNote')} />
            ) : null}
            <Row icon={<ClipIcon color={colors.soft} size={20} />} title={t('freeExport.watermark')} note={t('freeExport.watermarkNote')} />
          </View>

          <View style={styles.actions}>
            <Button label={t('freeExport.unlock')} onPress={() => onChoose('unlock')} icon={<LockIcon color={colors.onAccent} size={16} />} />
            <Button label={t('freeExport.go')} variant="secondary" onPress={() => onChoose('go')} />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChoose('cancel')} style={styles.cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
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
  included: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  includedText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.accent },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.ground,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  rowNote: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },
  actions: { gap: 8, marginTop: 4 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
});
