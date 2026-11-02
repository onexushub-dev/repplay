import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FreeLosses } from '../share/exportOptions';
import type { TFunction } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { Button } from './Button';
import { CheckIcon, ClipIcon, CloseIcon, FocusIcon, MutedIcon, SoundIcon } from './icons';
import { useClipThumbnail } from './useClipThumbnail';

/** `pro`: buy PRO · `pass`: the Single Pass for the whole recording ("Liberar só esta gravação") · `go`: export on the free plan · `cancel`: nothing. */
export type FreeExportChoice = 'pro' | 'pass' | 'go' | 'cancel';

/** What the player tapped: the title speaks to it ("Salve…" or "Envie…"). */
export type FreeExportKind = 'save' | 'share';

type Props = {
  visible: boolean;
  kind: FreeExportKind;
  /** What this clip uses that only PRO takes into the video: those items come first, marked, and the chip under the title names them. */
  losses: FreeLosses;
  /** A frame of the clip for the two previews; without one they show a plain frame. */
  preview?: { path: string; atMs: number } | null;
  /** More than one clip leaves at once (a batch): the chip says "Seus clipes…". */
  many?: boolean;
  /** How many clips the recording has: the Single Pass covers all of them, and the button says so. */
  clipCount: number;
  onChoose: (choice: FreeExportChoice) => void;
  /** The sheet is fully gone (iOS only: Android has no such event). */
  onDismissed?: () => void;
};

/**
 * The free video of this clip, in words: always HD, without Modo Foco and with the watermark, plus no sound when the clip
 * has sound ("HD, sem som, sem Modo Foco e com marca d’água"). Used by the short note.
 */
export function freeVideoItems(losses: FreeLosses, t: TFunction): string {
  const items = [t('freeExport.itemHd')];
  if (losses.sound) items.push(t('freeExport.itemNoSound'));
  items.push(t('freeExport.itemNoFocus'));
  items.push(t('freeExport.itemWatermark'));
  return `${items.slice(0, -1).join(', ')} ${t('freeExport.and')} ${items[items.length - 1]}`;
}

type Item = { key: 'sound' | 'focus' | 'quality' | 'watermark'; used: boolean };

/** The line under the title that names what this clip has and the free video leaves out; none when it has neither. */
function usedLine(losses: FreeLosses, many: boolean, t: TFunction): string | null {
  const suffix = many ? 'Many' : '';
  if (losses.sound && losses.focus) return t(`freeExport.usedBoth${suffix}` as 'freeExport.usedBoth');
  if (losses.sound) return t(`freeExport.usedSound${suffix}` as 'freeExport.usedSound');
  if (losses.focus) return t(`freeExport.usedFocus${suffix}` as 'freeExport.usedFocus');
  return null;
}

const FREE_KEY = { sound: 'freeExport.freeSound', focus: 'freeExport.freeFocus', quality: 'freeExport.freeQuality', watermark: 'freeExport.freeWatermark' } as const;
const PRO_KEY = { sound: 'freeExport.proSound', focus: 'freeExport.proFocus', quality: 'freeExport.proQuality', watermark: 'freeExport.proWatermark' } as const;

type CardProps = { pro: boolean; items: Item[]; thumb: string | undefined; focus: boolean };

/**
 * One preview of the clip: the frame as that plan exports it (free: dimmed, HD, muted, with the mark; PRO: Full HD, sound
 * and the Modo Foco frame when the clip uses it) and the four things that change, side by side with the other plan.
 */
function PlanCard({ pro, items, thumb, focus }: CardProps) {
  const { t } = useT();
  const labels = items.map((i) => t(pro ? PRO_KEY[i.key] : FREE_KEY[i.key]));
  const plan = t(pro ? 'freeExport.colPro' : 'freeExport.colFree');
  return (
    <View style={[styles.card, pro && styles.cardPro]} accessible accessibilityLabel={t('freeExport.cardA11y', { plan, items: labels.join(', ') })}>
      <View style={styles.thumb}>
        {thumb ? <Image testID="export-preview-frame" source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ClipIcon color={colors.border} size={28} />}
        {!pro ? <View style={styles.dim} /> : null}
        {pro && focus ? <View style={styles.focusFrame} /> : null}
        <View style={styles.badge}>
          <Text style={[styles.badgeText, pro && { color: colors.accent }]}>{t(pro ? 'freeExport.proQuality' : 'freeExport.freeQuality')}</Text>
        </View>
        <View style={styles.soundBadge}>{pro ? <SoundIcon color={colors.accent} size={14} /> : <MutedIcon color={colors.soft} size={14} />}</View>
        {!pro ? <Text style={styles.mark}>Reprize</Text> : null}
      </View>
      <Text style={[styles.cardHead, pro && { color: colors.accent }]}>{plan}</Text>
      <View style={styles.items}>
        {items.map((i, n) => (
          <View key={i.key} style={styles.item}>
            <View style={styles.itemIcon}>
              {pro ? (
                <CheckIcon color={colors.accent} size={14} />
              ) : i.used ? (
                <CloseIcon color={colors.rec} size={12} />
              ) : (
                <Text style={styles.dash}>–</Text>
              )}
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.itemText, pro && styles.itemTextPro, i.used && (pro ? styles.itemUsedPro : styles.itemUsedFree)]}>
              {labels[n]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The full notice before a free recording leaves the app for the first time (save, share, a batch): the clip twice, as
 * the free plan and as PRO export it, a line naming what this clip has that the free video leaves out, and the ways to
 * unlock it. Later exports of the same recording get the short note.
 */
export function FreeExportSheet({ visible, kind, losses, preview, many = false, clipCount, onChoose, onDismissed }: Props) {
  const { t } = useT();
  const thumb = useClipThumbnail(preview ? preview.path : '', preview ? preview.atMs : 0);
  const all: Item[] = [
    { key: 'sound', used: losses.sound },
    { key: 'focus', used: losses.focus },
    { key: 'quality', used: false },
    { key: 'watermark', used: false },
  ];
  // What this clip uses first: that is what the player cares about.
  const items = [...all.filter((i) => i.used), ...all.filter((i) => !i.used)];
  const used = usedLine(losses, many, t);
  const passScope = t('freeExport.passScope', { count: Math.max(1, clipCount) });
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
            {used !== null ? (
              <View style={styles.chip}>
                {losses.sound ? <SoundIcon color={colors.accent} size={14} /> : <FocusIcon color={colors.accent} size={14} />}
                <Text style={styles.chipText}>{used}</Text>
              </View>
            ) : null}
            <View style={styles.cards}>
              <PlanCard pro={false} items={items} thumb={thumb} focus={losses.focus} />
              <PlanCard pro items={items} thumb={thumb} focus={losses.focus} />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button label={t('freeExport.pro')} onPress={() => onChoose('pro')} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('freeExport.pass')}
              accessibilityHint={passScope}
              onPress={() => onChoose('pass')}
              style={({ pressed }) => [styles.pass, pressed && { opacity: 0.85 }]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.passText}>
                {t('freeExport.pass')}
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.passScope}>
                {passScope}
              </Text>
            </Pressable>
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
export function FreeExportBrief({ losses, kind, onUnlock }: { losses: FreeLosses | null; kind: FreeExportKind; onUnlock: () => void }) {
  const { t } = useT();
  if (losses === null) return null;
  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.briefWrap}>
      <View style={styles.brief} accessibilityLiveRegion="polite">
        <Text style={styles.briefText} numberOfLines={2}>
          {t(kind === 'share' ? 'freeExport.briefShare' : 'freeExport.briefSave', { items: freeVideoItems(losses, t) })}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onUnlock} style={styles.briefAction}>
          <Text style={styles.briefActionText}>{t('freeExport.briefUnlock')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

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
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,176,0,0.12)' },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
  cards: { flexDirection: 'row', gap: 10, marginTop: 2 },
  card: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.ground, overflow: 'hidden' },
  cardPro: { borderWidth: 1.5, borderColor: colors.accent },
  thumb: { aspectRatio: 16 / 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, overflow: 'hidden' },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,10,0.45)' },
  focusFrame: { position: 'absolute', top: '14%', bottom: '14%', left: '30%', right: '30%', borderWidth: 1.5, borderColor: colors.accent, borderRadius: 10 },
  badge: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(10,10,10,0.75)' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.5, color: colors.text },
  soundBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,10,10,0.75)' },
  mark: { position: 'absolute', right: 6, bottom: 4, fontFamily: fonts.bodyBold, fontSize: 9, color: 'rgba(255,255,255,0.85)' },
  cardHead: { paddingHorizontal: 10, paddingTop: 8, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.muted },
  items: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 10, gap: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  itemIcon: { width: 14, alignItems: 'center' },
  dash: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  itemText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  itemTextPro: { color: colors.text },
  itemUsedFree: { fontFamily: fonts.bodyBold, color: colors.rec },
  itemUsedPro: { fontFamily: fonts.bodyBold },
  actions: { gap: 8, marginTop: 14 },
  pass: { minHeight: 58, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  passText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  passScope: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted, marginTop: 2 },
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
