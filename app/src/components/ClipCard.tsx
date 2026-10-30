import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Clip } from '../data/schema';
import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';
import { seconds, timeOfDay } from './format';
import { CheckIcon } from './icons';
import { sourceLabel } from './sourceLabel';
import { useClipThumbnail } from './useClipThumbnail';

type Props = {
  clip: Clip;
  number: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** Picking clips to delete: the card shows a check circle and is dimmed until picked. */
  selecting?: boolean;
  selected?: boolean;
};

export function ClipCard({ clip, number, onPress, onLongPress, selecting = false, selected = false }: Props) {
  const { t, locale } = useT();
  const thumb = useClipThumbnail(clip.path, clip.trim.startMs);
  const duration = seconds(clip.trim.endMs - clip.trim.startMs);
  const base = t('summary.clipA11y', {
    number,
    name: clip.name ? ` · ${clip.name}` : '',
    duration,
    source: sourceLabel(clip.source, locale),
  });
  const sent = clip.savedAt ? t('summary.savedA11y', { label: base }) : clip.sharedAt ? t('summary.sharedA11y', { label: base }) : base;
  const label = selecting ? t(selected ? 'summary.selectedA11y' : 'summary.notSelectedA11y', { label: sent }) : sent;
  // A hold that starts the selection ends with the finger lifting, and by then this card already counts as picked:
  // that release must not count as a tap, which would unpick it at once.
  const held = useRef(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selecting ? { checked: selected } : undefined}
      onPressIn={() => {
        held.current = false;
      }}
      onPress={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              held.current = true;
              onLongPress();
            }
          : undefined
      }
      style={[styles.card, selecting && !selected && styles.unpicked]}>
      <View style={styles.thumb}>
        {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[styles.tag, { left: 8, top: 8 }]}>
          <Text style={styles.tagText}>{`#${number}`}</Text>
        </View>
        <View style={[styles.tag, { right: 8, bottom: 8 }]}>
          <Text style={styles.tagText}>{duration}</Text>
        </View>
        {clip.savedAt || clip.sharedAt ? (
          <View style={[styles.tag, styles.done, { left: 8, bottom: 8 }]}>
            <CheckIcon color={colors.accent} size={12} />
            <Text style={styles.tagText}>{clip.savedAt ? t('summary.savedTag') : t('summary.sharedTag')}</Text>
          </View>
        ) : null}
        {selecting ? (
          <View style={[styles.check, selected && styles.checkOn]}>{selected ? <CheckIcon size={16} /> : null}</View>
        ) : null}
      </View>
      {clip.name ? (
        <Text style={styles.name} numberOfLines={1}>
          {clip.name}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <Text style={styles.metaText}>{timeOfDay(clip.createdAt, locale)}</Text>
        <Text style={styles.metaText}>{sourceLabel(clip.source, locale)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 8 },
  thumb: { height: 128, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  tag: {
    position: 'absolute',
    backgroundColor: 'rgba(15,15,15,0.85)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  unpicked: { opacity: 0.6 },
  check: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: 'rgba(15,15,15,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
});
