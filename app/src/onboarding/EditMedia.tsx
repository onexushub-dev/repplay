import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { FocusIcon, PlayIcon, RotateIcon, SoundIcon, SpeedIcon, ZoomIcon } from '../components/icons';
import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';
import { PHOTOS } from './photos';
import { Photo, Reveal, useLoop } from './motion';

type IconType = ComponentType<{ color?: string; size?: number }>;

const TOOLS: { id: 'focus' | 'speed' | 'zoom' | 'rotate' | 'sound'; Icon: IconType; pro: boolean }[] = [
  { id: 'focus', Icon: FocusIcon, pro: true },
  { id: 'speed', Icon: SpeedIcon, pro: true },
  { id: 'zoom', Icon: ZoomIcon, pro: false },
  { id: 'rotate', Icon: RotateIcon, pro: false },
  { id: 'sound', Icon: SoundIcon, pro: true },
];

/** The editor: the clip in Focus Mode, the trim bar being adjusted, the tools, and which of them are Pro. */
export function EditMedia() {
  const { t } = useT();
  const trim = useLoop(4000, { bounce: true, rest: 0 });
  const head = useLoop(3200);
  const trimStyle = useAnimatedStyle(() => ({ left: `${4 + 16 * trim.get()}%` }));
  const headStyle = useAnimatedStyle(() => ({ left: `${22 + 62 * head.get()}%` }));
  const toolLabel = {
    focus: t('clip.toolFocus'),
    speed: t('clip.toolSpeed'),
    zoom: t('clip.toolZoom'),
    rotate: t('clip.toolRotate'),
    sound: t('clip.sound'),
  };

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.editor}>
        <View style={styles.header}>
          <Text style={styles.cancel}>{t('common.cancel')}</Text>
          <Text style={styles.title}>{t('clip.editTitle')}</Text>
          <Text style={styles.done}>{t('clip.done')}</Text>
        </View>
        <View style={styles.photo}>
          <Photo photo={PHOTOS.focus} />
          <View style={styles.focusTag}>
            <View style={styles.focusDot} />
            <Text style={styles.focusText}>{t('clip.focusMode')}</Text>
          </View>
        </View>
        <View style={styles.trimRow}>
          <View style={styles.play}>
            <PlayIcon size={16} />
          </View>
          <View style={styles.timeline}>
            <Animated.View style={[styles.trim, trimStyle]}>
              <View style={[styles.handle, { left: 2 }]} />
              <View style={[styles.handle, { right: 2 }]} />
            </Animated.View>
            <Animated.View style={[styles.head, headStyle]} />
            <View style={styles.mark} />
          </View>
        </View>
        <View style={styles.tools}>
          {TOOLS.map(({ id, Icon, pro }) => {
            const on = id === 'focus';
            return (
              <View key={id} style={styles.tool}>
                <View style={[styles.toolIcon, on && styles.toolIconOn]}>
                  <Icon size={20} color={on ? colors.onAccent : colors.text} />
                  {pro ? (
                    <View style={styles.proTag}>
                      <Text style={styles.proTagText}>{t('onboarding.pro')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.toolLabel, on && { color: colors.accent }]}>{toolLabel[id]}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <Reveal delay={200} style={styles.note}>
        <View style={styles.noteInner}>
          <View style={styles.noteTag}>
            <Text style={styles.noteTagText}>{t('onboarding.pro')}</Text>
          </View>
          <Text style={styles.noteText}>{t('onboarding.edit.proNote')}</Text>
        </View>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 10 },
  editor: { flex: 1, minHeight: 200, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.border },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  cancel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
  title: { fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: 0.8, color: colors.text },
  done: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  photo: { flex: 1, overflow: 'hidden' },
  focusTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(11,11,9,0.72)',
  },
  focusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  focusText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accent },
  trimRow: { paddingTop: 12, paddingHorizontal: 12, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  timeline: { flex: 1, height: 48, borderRadius: 10, backgroundColor: colors.surface },
  trim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '5%',
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 10,
    backgroundColor: 'rgba(214,242,63,0.12)',
  },
  handle: { position: 'absolute', top: 8, width: 11, height: 26, borderRadius: 4, backgroundColor: colors.accent },
  head: { position: 'absolute', top: -4, width: 2, height: 56, backgroundColor: colors.text },
  mark: { position: 'absolute', left: '66%', top: -7, width: 10, height: 10, marginLeft: -5, backgroundColor: colors.accent, transform: [{ rotate: '45deg' }] },
  tools: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 10, paddingTop: 4 },
  tool: { width: 64, alignItems: 'center', gap: 4 },
  toolIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  toolIconOn: { backgroundColor: colors.accent },
  proTag: { position: 'absolute', top: -6, right: -10, paddingHorizontal: 4, borderRadius: 4, backgroundColor: colors.accent },
  proTagText: { fontFamily: fonts.bodyBold, fontSize: 9, lineHeight: 14, color: colors.onAccent },
  toolLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.soft },
  note: { borderRadius: 14, borderWidth: 1, borderColor: colors.accent },
  noteInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  noteTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.accent },
  noteTagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onAccent },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: 'rgba(243,237,225,0.9)' },
});
