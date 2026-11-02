import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FreeLosses } from '../share/exportOptions';
import type { TFunction } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { Button } from './Button';
import { CheckIcon, ClipIcon, CloseIcon, FilmIcon, FocusIcon, SoundIcon } from './icons';

/** `pro`: buy PRO · `pass`: the Single Pass, "Liberar recursos PRO nessa gravação" (button: "Passe Avulso · só para esta gravação") · `go`: export on the free plan · `cancel`: nothing. */
export type FreeExportChoice = 'pro' | 'pass' | 'go' | 'cancel';

/** What the player tapped: the title speaks to it ("Salve…" or "Envie…"). */
export type FreeExportKind = 'save' | 'share';

type Props = {
  visible: boolean;
  kind: FreeExportKind;
  /** What this clip uses that only PRO takes into the video: those rows come first, marked, and the free summary names them. */
  losses: FreeLosses;
  onChoose: (choice: FreeExportChoice) => void;
  /** The sheet is fully gone (iOS only: Android has no such event). */
  onDismissed?: () => void;
};

/**
 * How the free video of this clip comes out, in words: always HD, without Modo Foco and with the watermark, plus no
 * sound when the clip has sound ("em HD, sem som, sem Modo Foco e com marca d’água").
 */
export function freeVideoItems(losses: FreeLosses, t: TFunction): string {
  const items = [t('freeExport.itemHd')];
  if (losses.sound) items.push(t('freeExport.itemNoSound'));
  items.push(t('freeExport.itemNoFocus'));
  items.push(t('freeExport.itemWatermark'));
  return `${items.slice(0, -1).join(', ')} ${t('freeExport.and')} ${items[items.length - 1]}`;
}

type RowProps = { icon: ReactNode; label: string; free: string | null; pro: string | null; used: boolean };

/** One line of the comparison: the free column in muted text or a dash, the PRO column in accent text or a check. */
function Row({ icon, label, free, pro, used }: RowProps) {
  const { t } = useT();
  const freeSpoken = free !== null ? free : t('freeExport.no');
  const proSpoken = pro !== null ? pro : t('freeExport.yes');
  const a11y = t('freeExport.rowA11y', { label, free: freeSpoken, pro: proSpoken });
  return (
    <View style={[styles.row, used && styles.rowUsed]} accessible accessibilityLabel={used ? `${a11y}. ${t('freeExport.usedHere')}` : a11y}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {used ? <Text style={styles.rowUsedText}>{t('freeExport.usedHere')}</Text> : null}
      </View>
      <View style={styles.cell}>
        <Text style={styles.freeText}>{free !== null ? free : '–'}</Text>
      </View>
      <View style={styles.cell}>
        {pro !== null ? <Text style={styles.proText}>{pro}</Text> : <CheckIcon color={colors.accent} size={18} />}
      </View>
    </View>
  );
}

/**
 * The full notice before a free recording leaves the app for the first time (save, share, a batch): what PRO puts in
 * the video, side by side with the free one, how the free video of this clip comes out, and the ways to unlock it. Later exports of the same recording get the
 * short note.
 */
export function FreeExportSheet({ visible, kind, losses, onChoose, onDismissed }: Props) {
  const { t } = useT();
  const rows = [
    { key: 'sound', used: losses.sound, icon: <SoundIcon color={colors.soft} size={18} />, label: t('freeExport.rowSound'), free: null, pro: null },
    { key: 'focus', used: losses.focus, icon: <FocusIcon color={colors.soft} size={18} />, label: t('freeExport.rowFocus'), free: null, pro: null },
    {
      key: 'quality',
      used: false,
      icon: <FilmIcon color={colors.soft} size={18} />,
      label: t('freeExport.rowQuality'),
      free: t('freeExport.freeQuality'),
      pro: t('freeExport.proQuality'),
    },
    { key: 'watermark', used: false, icon: <ClipIcon color={colors.soft} size={18} />, label: t('freeExport.rowWatermark'), free: null, pro: null },
  ];
  // What this clip uses first: that is what the player cares about.
  const ordered = [...rows.filter((r) => r.used), ...rows.filter((r) => !r.used)];
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            hitSlop={8}
            onPress={() => onChoose('cancel')}
            style={styles.close}>
            <CloseIcon color={colors.soft} size={18} />
          </Pressable>

          {/* Scrolls when the phone lies down and the whole sheet does not fit; the actions stay in view. */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false}>
            {/* One line on every phone: the font shrinks to fit rather than wrap. */}
            <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.title}>
              {t(kind === 'share' ? 'freeExport.titleShare' : 'freeExport.titleSave')}
            </Text>

            <View style={styles.table}>
              <View style={styles.head} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <View style={styles.headSpacer} />
                <Text style={[styles.cell, styles.headFree]}>{t('freeExport.colFree')}</Text>
                <Text style={[styles.cell, styles.headPro]}>{t('freeExport.colPro')}</Text>
              </View>
              {ordered.map((r) => (
                <Row key={r.key} icon={r.icon} label={r.label} free={r.free} pro={r.pro} used={r.used} />
              ))}
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryText}>{t('freeExport.freeSummary', { items: freeVideoItems(losses, t) })}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <View style={styles.proAction}>
              <Button label={t('freeExport.pro')} onPress={() => onChoose('pro')} />
              <Text style={styles.proCaption}>{t('freeExport.proCaption')}</Text>
            </View>
            <Button label={t('freeExport.pass')} variant="secondary" onPress={() => onChoose('pass')} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('freeExport.go')} hitSlop={8} onPress={() => onChoose('go')} style={styles.link}>
              <Text style={styles.linkText}>{t('freeExport.go')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/**
 * The short note on the later exports of a recording that already showed the full notice: one line over the screen
 * that never stops the export, with "Liberar" for the recording.
 */
export function FreeExportBrief({ losses, onUnlock }: { losses: FreeLosses | null; onUnlock: () => void }) {
  const { t } = useT();
  if (losses === null) return null;
  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.briefWrap}>
      <View style={styles.brief} accessibilityLiveRegion="polite">
        <Text style={styles.briefText} numberOfLines={2}>
          {t('freeExport.brief', { items: freeVideoItems(losses, t) })}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onUnlock} style={styles.briefAction}>
          <Text style={styles.briefActionText}>{t('freeExport.briefUnlock')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const CELL = 64;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '94%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ground,
  },
  body: { flexGrow: 0 },
  bodyContent: { gap: 12, paddingTop: 10, paddingBottom: 4 },
  title: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 28, color: colors.text, marginRight: 40 },
  table: { marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  headSpacer: { flex: 1 },
  headFree: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.muted, textAlign: 'center' },
  headPro: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.accent, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowUsed: { backgroundColor: 'rgba(255,176,0,0.08)', borderRadius: 10, borderBottomColor: 'transparent' },
  rowIcon: { width: 24, alignItems: 'center' },
  rowText: { flex: 1, minWidth: 0, paddingVertical: 8 },
  rowLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  rowUsedText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.accent, marginTop: 1 },
  cell: { width: CELL, alignItems: 'center', justifyContent: 'center' },
  freeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textAlign: 'center' },
  proText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent, textAlign: 'center' },
  summary: { padding: 12, borderRadius: 12, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.border },
  summaryText: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.text },
  actions: { gap: 8, marginTop: 12 },
  proAction: { gap: 6 },
  proCaption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
  briefWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 20 },
  brief: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  briefText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  briefAction: { minHeight: 32, justifyContent: 'center' },
  briefActionText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
});
