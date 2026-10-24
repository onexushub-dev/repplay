import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteControllerForget,
  remoteControllerHost,
  remoteControllerPairWithCode,
  remoteControllerPairWithLink,
  remoteControllerStartRecording,
  remoteControllerEndRecording,
  remoteControllerSave,
  remoteControllerStart,
  remoteControllerStop,
} from '../../modules/replay-camera';
import type { RemoteLink, RemoteLinkReason, RemotePairFailure, RemotePeer } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { ConnectionBar } from '../components/ConnectionBar';
import { QrScanner } from '../components/QrScanner';
import { RequirementsChecklist } from '../components/RequirementsChecklist';
import { RemotePreview } from '../components/RemotePreview';
import { DeviceNameField } from '../components/DeviceNameField';
import { HoldButton } from '../components/HoldButton';
import { CameraIcon } from '../components/icons';
import { PulseRing } from '../components/PulseRing';
import { ResultFlash } from '../components/ResultFlash';
import { parseCode, parsePairUrl } from '../remote/pairLink';
import { canSave, connectionTone, remoteScreen } from '../remote/remoteScreen';
import { cooldownLeft, IDLE, onResult, onTap, tick, type SaveFeedback } from '../remote/saveFeedback';
import type { TFunction } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';

const KEEP_AWAKE_TAG = 'remote';
const TICK_MS = 250;
const CONNECT_TIMEOUT_MS = 12_000;
/** The camera phone has this long to show it is recording before the remote says it did not start. */
const START_WAIT_MS = 8000;
/** How long "Tentar reconexão" waits before it can be tapped again. */
const RETRY_WAIT_MS = 6000;

type Received = { recording: boolean; clipCount: number; startedAt: number | null; receivedAt: number };

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function failureText(reason: RemotePairFailure, t: TFunction): string {
  switch (reason) {
    case 'expired':
      return t('remote.failExpired');
    case 'locked':
      return t('remote.failLocked');
    case 'notFound':
      return t('remote.failNotFound');
    case 'denied':
      return t('remote.failUnpaired');
    case 'full':
      return t('remote.failFull');
    case 'used':
      return t('remote.failUsed');
    case 'closed':
      return t('remote.failClosed');
    default:
      return t('remote.failWrongCode');
  }
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{String(n)}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

/** Undoes the pairing with the camera phone. Looks like what it is (it forgets), and says whose pairing goes away. */
function ForgetCamera({ name, onPress }: { name: string; onPress: () => void }) {
  const { t } = useT();
  return (
    <View style={styles.forget}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('remote.forgetCamera')}
        accessibilityHint={t('remote.forgetCameraHint', { name })}
        hitSlop={8}
        onPress={onPress}
        style={styles.forgetButton}>
        <Text style={styles.forgetText}>{t('remote.forgetCamera')}</Text>
      </Pressable>
      <Text style={styles.forgetHint}>{t('remote.forgetCameraNote', { name })}</Text>
    </View>
  );
}

/** The second iPhone: shows the camera phone's game and taps Salvar for it. */
export default function Remote() {
  const { t } = useT();
  const [host, setHost] = useState<RemotePeer | null>(() => remoteControllerHost());
  const [link, setLink] = useState<RemoteLink>('idle');
  const [linkReason, setLinkReason] = useState<RemoteLinkReason | undefined>(undefined);
  // "Tentar reconexão" was tapped: the button waits (and cannot be tapped again) until the link is back or a few seconds pass.
  const [retrying, setRetrying] = useState(false);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [received, setReceived] = useState<Received | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<SaveFeedback>(IDLE);
  const [lastSave, setLastSave] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<RemotePairFailure | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [code, setCode] = useState('');
  const lastSaveRef = useRef<number | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [startAskedAt, setStartAskedAt] = useState<number | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopConnectTimer = () => {
    if (connectTimer.current !== null) clearTimeout(connectTimer.current);
    connectTimer.current = null;
  };

  useEffect(() => {
    remoteControllerStart();
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      remoteControllerStop();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (connectTimer.current !== null) clearTimeout(connectTimer.current);
    };
  }, []);

  // Time moves everything on: the clock, and the save feedback (sending times out, results clear by themselves).
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setFeedback((current) => tick(current, at));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (feedback.phase === 'timeout') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [feedback.phase]);

  useEffect(() => {
    const status = addReplayListener('onRemoteStatus', (e) => {
      // This phone also runs the camera side (it starts whenever the app comes to the front): its status is not ours.
      if (e.side !== 'remote') return;
      setLink(e.link);
      setLinkReason(e.reason);
      if (e.peerName !== undefined) setPeerName(e.peerName);
    });
    const state = addReplayListener('onRemoteState', (e) => {
      const at = Date.now();
      setNow(at);
      if (e.recording) setStartAskedAt(null);
      setReceived({
        recording: e.recording,
        clipCount: e.clipCount,
        startedAt: e.startedAt === undefined ? null : e.startedAt,
        receivedAt: at,
      });
    });
    const saved = addReplayListener('onRemoteResult', (e) => {
      setFeedback((current) => onResult(current, e.saved, Date.now()));
      Haptics.notificationAsync(
        e.saved ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
    });
    const pairing = addReplayListener('onRemotePairing', (e) => {
      if (e.phase !== 'paired' && e.phase !== 'failed') return; // the other phases are for the camera phone
      stopConnectTimer();
      setConnecting(false);
      if (e.phase === 'paired') {
        setNotice(null);
        setFailure(null);
        setReceived(null);
        setHost(remoteControllerHost());
        return;
      }
      if (e.reason === 'denied') {
        setHost(null);
        setReceived(null);
      }
      setFailure(e.reason);
      setNotice(failureText(e.reason, t));
    });
    return () => {
      status.remove();
      state.remove();
      saved.remove();
      pairing.remove();
    };
  }, [t]);

  const beginConnecting = () => {
    setNotice(null);
    setFailure(null);
    setConnecting(true);
    stopConnectTimer();
    // The camera phone may never answer (out of range, app closed): do not spin forever.
    connectTimer.current = setTimeout(() => {
      connectTimer.current = null;
      setConnecting(false);
      setFailure('notFound');
      setNotice(failureText('notFound', t));
    }, CONNECT_TIMEOUT_MS);
  };

  const submit = (digits: string) => {
    setLastCode(digits);
    beginConnecting();
    remoteControllerPairWithCode(digits);
  };

  // The QR code shown on the camera phone, read right here.
  const onQr = (text: string) => {
    if (connecting) return;
    const link = parsePairUrl(text);
    if (link === null) return;
    setLastCode(null);
    beginConnecting();
    remoteControllerPairWithLink(link.hostId, link.secret, link.hostName);
  };

  const startRecording = () => {
    setStartAskedAt(Date.now());
    setNotice(null);
    remoteControllerStartRecording();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const typeCode = (text: string) => {
    setCode(text);
    const digits = parseCode(text);
    if (digits !== null && !connecting) submit(digits);
  };

  const connect = () => {
    const digits = parseCode(code);
    if (digits === null) {
      setNotice(t('remote.enterSix'));
      return;
    }
    submit(digits);
  };

  const retry = () => {
    if (lastCode !== null) submit(lastCode);
  };

  // Opened straight from the QR code there is no screen behind this one: go to the start instead of doing nothing.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // The link looks lost: start the search over now instead of waiting for the next automatic try.
  const retryNow = () => {
    if (retrying) return;
    setRetrying(true);
    remoteControllerStop();
    remoteControllerStart();
  };

  useEffect(() => {
    if (!retrying) return;
    const timer = setTimeout(() => setRetrying(false), RETRY_WAIT_MS);
    return () => clearTimeout(timer);
  }, [retrying]);

  // Unpair from this side (the camera phone is told too, when it is in reach) and go back to asking for a code.
  const forgetCamera = () => {
    const name = host === null || host.name.length === 0 ? t('remote.theCamera') : host.name;
    Alert.alert(
      t('remote.forgetTitle', { name }),
      t('remote.forgetBodyBoth', { name }),
      [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('remote.forgetAndRepair'),
        style: 'destructive',
        onPress: () => {
          remoteControllerForget();
          setHost(null);
          setReceived(null);
          setFailure(null);
          setNotice(null);
        },
      },
    ],
    );
  };

  const save = () => {
    const at = Date.now();
    if (!canSave(at, lastSaveRef.current)) {
      // Inside the gap between two saves: nothing is sent, but the tap is acknowledged.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    lastSaveRef.current = at;
    setLastSave(at);
    setNow(at);
    setFeedback((current) => onTap(current, at));
    remoteControllerSave();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  if (host === null) {
    return (
      <SafeAreaView style={styles.root}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.role}>{t('remote.roleRemote')}</Text>
          <Text style={styles.title}>{t('remote.title')}</Text>
          {notice !== null ? <Text style={styles.warning}>{notice}</Text> : null}
          <Step n={1} text={t('remote.step1')} />
          <Step n={2} text={t('remote.step2')} />
          <QrScanner active={!connecting} onCode={onQr} />
          {connecting ? (
            <View style={styles.connecting}>
              <ActivityIndicator color={colors.text} />
              <Text style={styles.text}>{t('remote.connecting')}</Text>
            </View>
          ) : null}
          {failure === 'notFound' && !connecting && lastCode !== null ? (
            <Button label={t('common.tryAgain')} variant="secondary" onPress={retry} />
          ) : null}
          <RequirementsChecklist />
          <Text style={styles.text}>{t('remote.cantScan')}</Text>
          <TextInput
            accessibilityLabel={t('remote.codeLabel')}
            editable={!connecting}
            keyboardType="number-pad"
            maxLength={7}
            onChangeText={typeCode}
            placeholder="000000"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={code}
          />
          <Button label={connecting ? t('remote.connecting') : t('remote.connect')} loading={connecting} onPress={connect} />
          <DeviceNameField />
          <Button label={t('common.close')} variant="secondary" onPress={leave} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // The button only shows while the link is down or silent, so it simply waits out RETRY_WAIT_MS.
  const retryShown = retrying;
  const hostLabel = host.name.length > 0 ? host.name : peerName === null ? t('remote.genericHost') : peerName;
  const screenModel = remoteScreen({
    link,
    reason: linkReason,
    hostName: hostLabel,
    state:
      received === null
        ? null
        : {
            recording: received.recording,
            clipCount: received.clipCount,
            startedAt: received.startedAt,
            ageSec: Math.max(0, (now - received.receivedAt) / 1000),
          },
  });
  const recordingDetail =
    screenModel.kind === 'recording'
      ? t('remote.detail', {
          time: screenModel.startedAt === null ? '0:00' : clock((now - screenModel.startedAt) / 1000),
          plays: t('remote.plays', { count: screenModel.clipCount }),
        })
      : undefined;
  const startWaiting = startAskedAt !== null && !(received !== null && received.recording);
  const startPending = startWaiting && now - startAskedAt < START_WAIT_MS;
  const startFailed = startWaiting && now - startAskedAt >= START_WAIT_MS;
  const sending = feedback.phase === 'sending';
  const left = cooldownLeft(lastSave, now);
  const flash = feedback.phase === 'saved' || feedback.phase === 'failed' || feedback.phase === 'timeout';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <ConnectionBar tone={connectionTone(screenModel)} name={hostLabel} detail={recordingDetail} />
        {screenModel.kind === 'recording' ? null : <Text style={styles.role}>{t('remote.roleRemote')}</Text>}
        {notice !== null ? <Text style={styles.warning}>{notice}</Text> : null}

        {screenModel.kind === 'denied' ? (
          <View style={styles.center}>
            {screenModel.reason === 'unauthorized' ? (
              <>
                <Text style={styles.text}>{t('remote.bluetoothDenied')}</Text>
                <Button label={t('common.openSettings')} onPress={() => Linking.openSettings()} />
              </>
            ) : (
              <Text style={styles.text}>{t('remote.bluetoothOff')}</Text>
            )}
          </View>
        ) : null}

        {screenModel.kind === 'searching' ? (
          <View style={styles.center}>
            <PulseRing color={colors.warning} />
            <Text style={styles.status}>{t('remote.searching', { name: screenModel.hostName === null ? hostLabel : screenModel.hostName })}</Text>
            <ForgetCamera name={hostLabel} onPress={forgetCamera} />
          </View>
        ) : null}

        {screenModel.kind === 'waiting' ? (
          <View style={styles.center}>
            <PulseRing color={colors.accent} />
            <Text style={styles.status}>{t('remote.ready')}</Text>
            <Button
              label={startPending ? t('remote.starting') : t('remote.startRecording')}
              loading={startPending}
              onPress={startRecording}
            />
            {startFailed ? (
              <Text style={styles.warning}>{t('remote.startFailed')}</Text>
            ) : (
              <Text style={styles.hint}>{t('remote.orStartThere')}</Text>
            )}
            <ForgetCamera name={hostLabel} onPress={forgetCamera} />
          </View>
        ) : null}

        {screenModel.kind === 'reconnecting' ? (
          <View style={styles.center}>
            <PulseRing color={colors.warning} size={64} />
            <Text style={styles.status}>{t('remote.reconnectingScreen', { name: screenModel.hostName })}</Text>
            <Text style={styles.hint}>{t('remote.keepOpen')}</Text>
            <Button label={retryShown ? t('remote.reconnecting') : t('remote.retryLink')} loading={retryShown} onPress={retryNow} />
            <ForgetCamera name={hostLabel} onPress={forgetCamera} />
          </View>
        ) : null}

        {screenModel.kind === 'stale' ? (
          <>
            <View style={styles.center}>
              <PulseRing color={colors.warning} size={64} />
              <Text style={styles.status}>{t('remote.noSignal', { name: screenModel.hostName })}</Text>
              <Text style={styles.sub}>{t('remote.checkingLink')}</Text>
              <Button label={retryShown ? t('remote.reconnecting') : t('remote.retryLink')} loading={retryShown} onPress={retryNow} />
              <ForgetCamera name={hostLabel} onPress={forgetCamera} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('remote.save')}
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.save, styles.saveOff]}>
              <Text style={styles.saveText}>{t('remote.save')}</Text>
            </Pressable>
          </>
        ) : null}

        {screenModel.kind === 'recording' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('remote.save')}
            accessibilityState={{ busy: sending }}
            onPress={save}
            style={({ pressed }) => [styles.save, pressed && styles.savePressed]}>
            {sending ? (
              <>
                <ActivityIndicator size="large" color={colors.onAccent} />
                <Text style={styles.sendingText}>{t('remote.sending')}</Text>
              </>
            ) : (
              <Text style={styles.saveText}>{t('remote.save')}</Text>
            )}
            {left > 0 ? <View testID="cooldown" pointerEvents="none" style={[styles.cooldown, { width: `${Math.round(left * 100)}%` }]} /> : null}
          </Pressable>
        ) : null}

        {screenModel.kind === 'recording' ? (
          <HoldButton
            label={t('remote.holdToEnd')}
            holdingLabel={t('remote.holding')}
            onComplete={remoteControllerEndRecording}
          />
        ) : null}

        <View style={styles.footer}>
          {screenModel.kind === 'recording' || screenModel.kind === 'waiting' ? (
            <View style={styles.footerItem}>
              <Button
                label={t('remote.seeCamera')}
                variant="secondary"
                icon={<CameraIcon />}
                onPress={() => setPreviewOpen(true)}
              />
            </View>
          ) : null}
          <View style={styles.footerItem}>
            <Button label={t('common.close')} variant="secondary" onPress={leave} />
          </View>
        </View>
      </View>
      <RemotePreview visible={previewOpen} onClose={() => setPreviewOpen(false)} />
      {flash ? <ResultFlash kind={feedback.phase as 'saved' | 'failed' | 'timeout'} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, padding: 20, gap: 16 },
  scrollBody: { flexGrow: 1, padding: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  role: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: colors.muted },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, color: colors.text },
  text: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text },
  status: { fontFamily: fonts.bodySemi, fontSize: 22, lineHeight: 30, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.warning, textAlign: 'center' },
  hint: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: 'center' },
  forget: { alignItems: 'center', gap: 2, marginTop: 8 },
  forgetButton: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  forgetText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.warning, textDecorationLine: 'underline' },
  forgetHint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
  connecting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  footer: { flexDirection: 'row', gap: 12 },
  footerItem: { flex: 1 },
  warning: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.warning },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onAccent },
  stepText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text },
  input: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    letterSpacing: 4,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    minHeight: 64,
    textAlign: 'center',
  },
  save: {
    flex: 1,
    minHeight: 220,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  savePressed: { transform: [{ scale: 0.97 }] },
  saveOff: { opacity: 0.25 },
  saveText: { fontFamily: fonts.displayBold, fontSize: 72, letterSpacing: 2, color: colors.onAccent },
  sendingText: { fontFamily: fonts.displayBold, fontSize: 40, letterSpacing: 1, color: colors.onAccent },
  // A thin line along the bottom edge that shortens over the 3 s gap: it says "wait a moment" without looking like a loader.
  cooldown: { position: 'absolute', bottom: 0, left: 0, height: 8, backgroundColor: 'rgba(15,16,13,0.55)' },
});
