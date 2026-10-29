import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { BackIcon, DownloadIcon, EditIcon, ShareIcon } from '../components/icons';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { PHOTOS } from './photos';
import { Photo, useLoop } from './motion';

/** The saved clip's screen: the clip full size with its position bar and the three actions, Edit, Save and Send. */
export function ShareMedia() {
  const { t } = useT();
  const head = useLoop(3200);
  const headStyle = useAnimatedStyle(() => ({ left: `${head.get() * 100}%` }));

  return (
    <View style={styles.frame} pointerEvents="none">
      <Photo photo={PHOTOS.play} focus={{ x: 0.5, y: 0.56 }} />
      <View style={styles.top}>
        <View style={styles.back}>
          <BackIcon size={20} />
        </View>
        <View style={styles.name}>
          <Text style={styles.nameText}>{t('onboarding.clipName')}</Text>
        </View>
      </View>
      <View style={styles.dock}>
        <Text style={styles.count}>{t('clip.ofTotal', { number: 1, total: 2 })}</Text>
        <View style={styles.bar}>
          <Animated.View style={[styles.dot, headStyle]} />
        </View>
        <View style={styles.actions}>
          <View style={styles.action}>
            <EditIcon size={20} />
            <Text style={styles.actionText}>{t('clip.edit')}</Text>
          </View>
          <View style={styles.action}>
            <DownloadIcon size={20} />
            <Text style={styles.actionText}>{t('clip.save')}</Text>
          </View>
          <View style={[styles.action, styles.send]}>
            <ShareIcon size={20} color={colors.onAccent} />
            <Text style={[styles.actionText, { color: colors.onAccent }]}>{t('clip.send')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 200, borderRadius: 18, overflow: 'hidden', backgroundColor: '#12130F' },
  top: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(11,11,9,0.6)', alignItems: 'center', justifyContent: 'center' },
  name: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(11,11,9,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(243,237,225,0.14)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  nameText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.soft },
  dock: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(11,11,9,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(243,237,225,0.14)',
    gap: 12,
  },
  count: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: colors.text, opacity: 0.85 },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(243,237,225,0.25)' },
  dot: { position: 'absolute', top: -4, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  send: { backgroundColor: colors.accent, borderWidth: 0 },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});
