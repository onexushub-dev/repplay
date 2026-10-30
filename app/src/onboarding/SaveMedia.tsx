import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ArmsUpIcon, CheckIcon, MicIcon, QrIcon, RemoteIcon, TapIcon, WatchIcon } from '../components/icons';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { PHOTOS } from './photos';
import { Photo, Reveal } from './motion';
import type { WayId } from './slides';

type IconType = ComponentType<{ color?: string; size?: number }>;

const WAYS: Record<WayId, { Icon: IconType; source: MessageKey; pro: boolean }> = {
  tap: { Icon: TapIcon, source: 'sources.screen', pro: false },
  wave: { Icon: ArmsUpIcon, source: 'sources.gesture', pro: false },
  voice: { Icon: MicIcon, source: 'sources.voice', pro: false },
  phone: { Icon: QrIcon, source: 'sources.phone', pro: false },
  watch: { Icon: WatchIcon, source: 'sources.watch', pro: true },
  bluetooth: { Icon: RemoteIcon, source: 'sources.remote', pro: true },
};

type Props = {
  ways: readonly WayId[];
  /** Index of the way shown in the card. */
  card: number;
  onPick: (index: number) => void;
};

/** The ways to save a play: a photo of the moment with the saved clip confirmed, the options as tabs and the open one as a card. */
export function SaveMedia({ ways, card, onPick }: Props) {
  const { t } = useT();
  const current = ways[Math.min(card, ways.length - 1)];
  const { source, pro } = WAYS[current];

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.photo} pointerEvents="none">
        <Photo photo={PHOTOS.play} />
        <View style={styles.recording}>
          <View style={styles.recDot} />
          <Text style={styles.recordingText}>{t('recording.recording')}</Text>
        </View>
        <Reveal key={current} delay={250} style={styles.saved}>
          <View style={styles.savedInner}>
            <View style={styles.check}>
              <CheckIcon size={16} />
            </View>
            <View>
              <Text style={styles.savedTitle}>{t('recording.savedTitle', { number: 1 })}</Text>
              <Text style={styles.savedVia}>{t('recording.savedVia', { source: t(source), seconds: 15 })}</Text>
            </View>
            {pro ? (
              <View style={styles.undo}>
                <Text style={styles.undoText}>{t('recording.undo')}</Text>
              </View>
            ) : null}
          </View>
        </Reveal>
      </View>

      <View style={styles.tabs} accessibilityLabel={t('onboarding.ways')}>
        {ways.map((id, i) => {
          const on = i === Math.min(card, ways.length - 1);
          const { Icon } = WAYS[id];
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t(`onboarding.${id}.name`)}
              accessibilityState={{ selected: on }}
              onPress={() => onPick(i)}
              style={[styles.tab, on && styles.tabOn]}>
              <Icon size={24} color={on ? colors.onAccent : colors.text} />
            </Pressable>
          );
        })}
      </View>

      <Reveal key={`card-${current}`} style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardName}>{t(`onboarding.${current}.name`)}</Text>
          <View style={[styles.plan, pro && styles.planPro]}>
            <Text style={[styles.planText, pro && styles.planTextPro]}>{pro ? t('onboarding.pro') : t('onboarding.free')}</Text>
          </View>
        </View>
        <Text style={styles.how}>{t(`onboarding.${current}.how`)}</Text>
        <Text style={styles.when}>{t(`onboarding.${current}.when`)}</Text>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 10 },
  photo: { flex: 1, minHeight: 120, borderRadius: 18, overflow: 'hidden', backgroundColor: '#121212' },
  recording: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,15,15,0.72)',
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.rec },
  recordingText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  saved: { position: 'absolute', left: 10, bottom: 10 },
  savedInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(15,15,15,0.9)',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  check: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  savedTitle: { fontFamily: fonts.displayBold, fontSize: 19, lineHeight: 20, color: colors.text },
  savedVia: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
  undo: { marginLeft: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  undoText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    height: 52,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  card: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  plan: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  planPro: { backgroundColor: colors.accent, borderColor: colors.accent },
  planText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  planTextPro: { color: colors.onAccent },
  how: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.text, marginTop: 2 },
  when: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
});
