import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addReplayListener, setGestureEnabled, signalSaved } from '../../modules/replay-camera';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';
import { Button } from './Button';
import { WavingFigure } from './WavingFigure';

/** What the practice shows: nobody with the arms up yet, arms up (now wave), or the gesture recognized. */
export type PracticeState = 'waiting' | 'raised' | 'done';

/** Arms-up readings come about once a second: without one for this long, the arms are down again. */
export const RAISED_HOLD_MS = 1800;
/** How long "Gesto reconhecido" stays up. */
export const DONE_MS = 3000;

/**
 * Gesture practice on the setup screen: while on, the camera looks for the gesture (it does not otherwise before a
 * game starts) and the screen follows it: arms up, then recognized, with the save chime. Nothing is saved: the
 * session only saves while recording.
 */
export function useGesturePractice(on: boolean): PracticeState {
  const [state, setState] = useState<PracticeState>('waiting');

  useEffect(() => {
    if (!on) return;
    setGestureEnabled(true);
    let raisedTimer: ReturnType<typeof setTimeout> | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const debug = addReplayListener('onGestureDebug', (e) => {
      if (done || !(e.isX || e.raised === true)) return;
      setState('raised');
      if (raisedTimer !== undefined) clearTimeout(raisedTimer);
      raisedTimer = setTimeout(() => {
        if (!done) setState('waiting');
      }, RAISED_HOLD_MS);
    });
    const trigger = addReplayListener('onTrigger', (e) => {
      if (e.source !== 'gesture') return;
      done = true;
      setState('done');
      signalSaved({ sound: true, flash: false });
      if (doneTimer !== undefined) clearTimeout(doneTimer);
      doneTimer = setTimeout(() => {
        done = false;
        setState('waiting');
      }, DONE_MS);
    });
    return () => {
      debug.remove();
      trigger.remove();
      if (raisedTimer !== undefined) clearTimeout(raisedTimer);
      if (doneTimer !== undefined) clearTimeout(doneTimer);
      setGestureEnabled(false); // before a game the camera never looks for the gesture (heavy); the game turns it on
      setState('waiting');
    };
  }, [on]);

  return state;
}

type Props = { visible: boolean; onClose: () => void };

/** "?" of the wave gesture (setup screen): the gesture moving, how to do it, and practice with the live camera. */
export function GestureSheet({ visible, onClose }: Props) {
  const { t } = useT();
  const state = useGesturePractice(visible);
  const status = state === 'done' ? t('gestureGuide.done') : state === 'raised' ? t('gestureGuide.raised') : t('gestureGuide.waiting');

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel={t('common.close')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            {t('gestureGuide.title')}
          </Text>
          <View style={styles.howRow}>
            <WavingFigure size={88} accessibilityLabel={t('onboarding.wave.how')} />
            <View style={styles.howText}>
              <Text style={styles.how}>{t('onboarding.wave.how')}</Text>
              <Text style={styles.stay}>{t('gestureGuide.stay')}</Text>
            </View>
          </View>
          <Text style={styles.section}>{t('gestureGuide.practice')}</Text>
          <View
            accessibilityLiveRegion="polite"
            style={[styles.status, state === 'raised' && styles.statusRaised, state === 'done' && styles.statusDone]}>
            <Text
              testID="gesture-practice-status"
              style={[styles.statusText, state === 'waiting' && styles.statusTextWaiting, state === 'done' && styles.statusTextDone]}>
              {status}
            </Text>
          </View>
          <Button label={t('common.close')} variant="secondary" onPress={onClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
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
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  howText: { flex: 1, gap: 6 },
  how: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
  stay: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  section: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted, textTransform: 'uppercase' },
  // Big and colored: it is read from a few steps away, with the arms up.
  status: {
    minHeight: 92,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusRaised: { borderColor: colors.accent },
  statusDone: { borderColor: colors.accent, backgroundColor: colors.accent },
  statusText: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 32, color: colors.accent, textAlign: 'center' },
  statusTextWaiting: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
  statusTextDone: { color: colors.onAccent },
});
