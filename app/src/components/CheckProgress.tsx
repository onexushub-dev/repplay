import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type AppLocale, currentLocale, translate } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { CheckIcon, CloseIcon } from './icons';

/** Where a "are you there?" to a paired remote stands. */
export type CheckView = { phase: 'checking' } | { phase: 'ok'; ms: number } | { phase: 'failed' };

/** How long the answer stays on screen before it closes by itself. */
export const OK_VISIBLE_MS = 2000;
export const FAILED_VISIBLE_MS = 4000;

export function checkTitle(name: string, view: CheckView, locale: AppLocale = currentLocale()): string {
  if (view.phase === 'checking') return translate(locale, 'check.checking', { name });
  if (view.phase === 'ok') return translate(locale, 'check.answered', { name });
  return translate(locale, 'check.noAnswer', { name });
}

/** The line under the title; null while it is still checking. */
export function checkDetail(view: CheckView, locale: AppLocale = currentLocale()): string | null {
  if (view.phase === 'ok') return `${view.ms} ms`;
  if (view.phase === 'failed') return translate(locale, 'check.retryHint');
  return null;
}

type Props = { name: string; view: CheckView; onDismiss: () => void };

/**
 * A card over the screen while a paired remote is asked if it is there, in the same look as the one that says
 * "Preparando o vídeo…". While checking it lets touches through; once there is an answer a tap anywhere closes it.
 */
export function CheckProgress({ name, view, onDismiss }: Props) {
  const { t, locale } = useT();
  const title = checkTitle(name, view, locale);
  const detail = checkDetail(view, locale);
  const checking = view.phase === 'checking';
  return (
    <View pointerEvents={checking ? 'none' : 'auto'} style={styles.wrap}>
      {checking ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={t('check.dismiss')} onPress={onDismiss} style={StyleSheet.absoluteFill} />
      )}
      <View
        accessibilityRole={checking ? 'progressbar' : 'alert'}
        accessibilityLabel={detail === null ? title : `${title}. ${detail}`}
        accessibilityLiveRegion="polite"
        pointerEvents="none"
        style={styles.card}>
        {view.phase === 'checking' ? <ActivityIndicator size="large" color={colors.accent} /> : null}
        {view.phase === 'ok' ? (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <CheckIcon size={36} />
          </View>
        ) : null}
        {view.phase === 'failed' ? (
          <View style={[styles.badge, { backgroundColor: colors.warning }]}>
            <CloseIcon color={colors.ground} size={32} />
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {detail === null ? null : <Text style={view.phase === 'ok' ? styles.detailOk : styles.detail}>{detail}</Text>}
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
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text, textAlign: 'center', marginTop: 4 },
  detail: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft, textAlign: 'center' },
  detailOk: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.accent, textAlign: 'center' },
});
