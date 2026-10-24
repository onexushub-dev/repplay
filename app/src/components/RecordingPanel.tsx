import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addReplayListener } from '../../modules/replay-camera';
import { VOICE_WORDS } from '../i18n';
import { useT } from '../i18n/useT';
import { removeFile, repo } from '../data/mmkv';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';
import { Button } from './Button';
import { HoldButton } from './HoldButton';
import { ArmsUpIcon, MicIcon, RemoteIcon, TapIcon, WatchIcon } from './icons';
import { SavedOverlay } from './SavedOverlay';

const OVERLAY_MS = 2000;

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Controls shown over the live camera while a game is recorded. The camera view itself belongs to the
 * game screen and is never recreated, so starting the game is instant (and Android keeps its preview).
 */
type Props = {
  /** The clip length the player picked: how far back a save reaches. */
  clipSeconds?: number;
  /** Which hands-free triggers are on in this mode. */
  gesture?: boolean;
  voice?: boolean;
};

export function RecordingPanel({ clipSeconds = 30, gesture = true, voice = false }: Props) {
  const { state, trigger, undoLast, stop, reset } = useSession();
  const { t, locale } = useT();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string>();
  const last = state.lastSaved;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!last) return;
    const hide = setTimeout(() => setDismissed(last.clipId), OVERLAY_MS);
    return () => clearTimeout(hide);
  }, [last]);

  /** After a game: its summary, or — with no clip to show — straight to Minhas gravações, the empty game removed. */
  function leaveEnded(id: string) {
    if (repo.listClips(id).length > 0) return router.replace(`/session/${id}`);
    repo.deleteSession(id).forEach((path) => removeFile(path));
    reset();
    router.push('/games'); // the setup screen stays under it
  }

  async function end() {
    const id = await stop();
    if (id) leaveEnded(id);
  }

  // The remote phone's "Segure para encerrar a gravação" ends the game the same way the one on this screen does.
  useEffect(() => {
    const sub = addReplayListener('onRemoteStop', () => {
      if (state.phase === 'recording') void end();
    });
    return () => sub.remove();
  });

  // Android back = end the game, after a confirmation.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(t('recording.endConfirm'), undefined, [
        { text: t('recording.keepGoing'), style: 'cancel' },
        { text: t('recording.end'), style: 'destructive', onPress: () => void end() },
      ]);
      return true;
    });
    return () => sub.remove();
  });

  if (state.phase === 'ended' && state.error) {
    const reason = t(state.thermalStop ? 'recording.reasonHot' : 'recording.reasonError');
    return (
      <SafeAreaView style={styles.stopped}>
        <Text style={styles.stoppedText}>{t('recording.stopped', { reason })}</Text>
        <Button
          label={state.sessionId && repo.listClips(state.sessionId).length > 0 ? t('recording.seeClips') : t('recording.myRecordings')}
          onPress={() => {
            if (state.sessionId) leaveEnded(state.sessionId);
          }}
        />
      </SafeAreaView>
    );
  }

  const showOverlay = last !== undefined && dismissed !== last.clipId;
  const hintSub = [
    t('recording.lastReady', { seconds: clipSeconds }),
    ...(voice ? [t('recording.orSay', { word: VOICE_WORDS[locale][0] })] : []),
    ...(gesture ? [t('recording.orWave')] : []),
    t('recording.orRemote'),
  ].join(' · ');
  const clips = t('summary.clips', { count: state.clipCount });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* The whole screen is the save button; nothing covers the picture. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('recording.tapAnywhere')}
        onPress={() => trigger('screen')}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.content}>
        <View pointerEvents="none" style={styles.topRow}>
          <View style={styles.pill}>
            <View style={styles.recDot} />
            <Text style={styles.pillLabel}>{t('recording.recording')}</Text>
            <Text style={styles.elapsed}>{clock(now - (state.startedAt ?? now))}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.countText}>{clips}</Text>
          </View>
        </View>

        {state.thermal.degraded ? (
          <View pointerEvents="none" style={styles.banner}>
            <Text style={styles.bannerText}>
              <Text style={styles.bold}>{t('recording.hotTitle')}</Text>
              {t('recording.hotBody')}
            </Text>
          </View>
        ) : null}
        {state.paused ? (
          <View pointerEvents="none" style={styles.banner}>
            <Text style={styles.bannerText}>{t('recording.paused')}</Text>
          </View>
        ) : null}

        <View pointerEvents="box-none" style={styles.bottom}>
          <View pointerEvents="none" style={styles.hintCard}>
            <TapIcon color={colors.accent} size={28} />
            <View style={styles.hintText}>
              <Text style={styles.hint}>{t('recording.tapHint')}</Text>
              <Text style={styles.hintSub}>{hintSub}</Text>
            </View>
            <View style={styles.icons}>
              {voice ? <MicIcon color={colors.accent} size={20} /> : null}
              {gesture ? <ArmsUpIcon color={colors.accent} size={20} /> : null}
              <RemoteIcon color={colors.accent} size={20} />
              <WatchIcon color={colors.muted} size={20} />
            </View>
          </View>
          <HoldButton
            label={t('recording.holdToEnd')}
            holdingLabel={t('recording.keepHolding')}
            onComplete={() => void end()}
          />
        </View>
      </SafeAreaView>

      {showOverlay ? <SavedOverlay number={last.number} source={last.source} cutMs={last.cutMs} onUndo={undoLast} /> : null}
    </View>
  );
}

const glass = 'rgba(15,16,13,0.72)';

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: glass,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.rec },
  pillLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  elapsed: { fontFamily: fonts.display, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  countText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  banner: {
    backgroundColor: colors.warningGround,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  bannerText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
  bold: { fontFamily: fonts.bodyBold },
  bottom: { marginTop: 'auto', gap: 8, marginBottom: 12 },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: glass,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  hintText: { flex: 1, gap: 2 },
  hint: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 22, color: colors.text },
  hintSub: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
  icons: { flexDirection: 'column', gap: 6 },
  stopped: { flex: 1, backgroundColor: colors.recordingGround, justifyContent: 'center', padding: 24, gap: 20 },
  stoppedText: { fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 38, color: colors.text, textAlign: 'center' },
});
