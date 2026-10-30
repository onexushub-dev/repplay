import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type AppLocale, currentLocale, translate } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';

export type ExportJob = {
  kind: 'save' | 'share' | 'compile';
  stage: 'preparing' | 'joining' | 'delivering';
  /** A batch: how many clips are finished of how many. */
  step?: { done: number; total: number };
};

export function exportTitle(job: ExportJob, locale: AppLocale = currentLocale()): string {
  if (job.stage === 'joining') return translate(locale, 'batch.joining');
  if (job.stage === 'preparing') {
    if (job.step) return translate(locale, 'batch.preparing', { done: Math.min(job.step.done + 1, job.step.total), total: job.step.total });
    return translate(locale, 'clip.exportPreparing');
  }
  return translate(locale, job.kind === 'save' ? 'clip.exportSaving' : 'clip.exportSharing');
}

type Props = { job: ExportJob; /** A batch can be stopped: the card then takes touches and shows Cancelar. */ onCancel?: () => void };

/** A card over the screen while a video is made and handed over. */
export function ExportProgress({ job, onCancel }: Props) {
  const { t, locale } = useT();
  const title = exportTitle(job, locale);
  return (
    <View pointerEvents={onCancel ? 'box-none' : 'none'} style={styles.wrap}>
      <View accessibilityRole="progressbar" accessibilityLabel={title} style={styles.card}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
        {onCancel ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  card: {
    minWidth: 240,
    maxWidth: 320,
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderRadius: radius.card,
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text, textAlign: 'center', marginTop: 4 },
  cancel: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.soft },
});
