import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { ArmsUpIcon, BatteryIcon, MicIcon, QrIcon, RemoteIcon, WatchIcon } from '../components/icons';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { Photo, useLoop } from './motion';

const CAMERA = require('../../assets/images/onboarding/camera.jpg');

/** The recording screen as it opens: the camera view, the top buttons and the panel with the ways to save and Start. */
export function RecordMedia() {
  const { t } = useT();
  const tap = useLoop(3200);
  // A ring spreads out of the button now and then, as if a finger had just pressed it.
  const ring = useAnimatedStyle(() => {
    const at = tap.get();
    return { opacity: at < 0.3 ? 0 : 0.85 * (1 - (at - 0.3) / 0.7), transform: [{ scale: 0.3 + 1.4 * at }] };
  });

  return (
    <View style={styles.frame} pointerEvents="none">
      <Photo source={CAMERA} />
      <View style={styles.top}>
        <View style={styles.recordings}>
          <Text style={styles.recordingsText}>{t('setup.myRecordings')}</Text>
        </View>
        <View style={styles.topRight}>
          <View style={styles.round}>
            <BatteryIcon size={24} />
          </View>
          <View style={[styles.round, styles.zoom]}>
            <Text style={styles.zoomText}>1x</Text>
          </View>
        </View>
      </View>
      <View style={styles.panel}>
        <View style={styles.handle} />
        <Text style={styles.panelTitle}>{t('setup.howToSave')}</Text>
        <View style={styles.ways}>
          <MicIcon size={30} color={colors.accent} />
          <ArmsUpIcon size={30} color={colors.accent} />
          <RemoteIcon size={30} color={colors.muted} />
          <WatchIcon size={30} color={colors.muted} />
          <QrIcon size={30} color={colors.muted} />
        </View>
        <View style={styles.start}>
          <Text style={styles.startText}>{t('setup.start')}</Text>
          <Animated.View style={[styles.ring, ring]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 160, borderRadius: 18, overflow: 'hidden', backgroundColor: '#12130F' },
  top: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordings: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.accent, justifyContent: 'center' },
  recordingsText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAccent },
  topRight: { flexDirection: 'row', gap: 8 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,16,13,0.75)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoom: { backgroundColor: colors.accent, borderWidth: 0 },
  zoomText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAccent },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.ground,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.muted, marginVertical: 2 },
  panelTitle: { textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  ways: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', minHeight: 40 },
  start: { height: 50, borderRadius: radius.button, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  startText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.onAccent },
  ring: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: colors.onAccent },
});
