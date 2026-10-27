import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  getSpeechPermission,
  getWatchStatus,
  getZoomRange,
  isRemoteSupported,
  isVoiceSupported,
  remoteControllerForget,
  remoteControllerHost,
  remoteHostControllers,
  ReplayCameraView,
  requestSpeechPermission,
} from '../../modules/replay-camera';
import type { RemotePeer, ReplayErrorCode } from '../../modules/replay-camera/src/ReplayCamera.types';
import { useCameraPinch } from '../camera/useCameraPinch';
import { useDeviceLandscape } from '../camera/useDeviceLandscape';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { CompactDock } from '../components/CompactDock';
import { modeTip } from '../components/format';
import { sourceLabel } from '../components/sourceLabel';
import { PositionGuide } from '../components/PositionGuide';
import { RecordingPanel } from '../components/RecordingPanel';
import { ProBadge } from '../components/ProBadge';
import { ArmsUpIcon, MicIcon, QrIcon, RemoteIcon, TapIcon, WatchIcon } from '../components/icons';
import { TriggerTile } from '../components/TriggerTile';
import { ZoomBubble } from '../components/ZoomBubble';
import { ZoomButton } from '../components/ZoomButton';
import { repo } from '../data/mmkv';
import { useStartPreview } from '../payments/useStartPreview';
import { openPaywall } from '../payments/feedback';
import { FREE_MAX_SECONDS, triggerAllowed } from '../payments/limits';
import { usePlan } from '../share/entitlement';
import { type MessageKey, type TFunction, VOICE_WORDS, voiceLocale } from '../i18n';
import { useT } from '../i18n/useT';
import { remoteDeviceView } from '../devices/remoteDevice';
import { clearRemotePress } from '../devices/remoteTest';
import { useRemoteSheetOpen, useRemoteTest } from '../devices/useRemoteTest';
import { CLIP_SECONDS_OPTIONS, type ModeSettings, type Prefs } from '../data/schema';
import { effectiveSettings, modeById, offeredMode, withModeOverride } from '../modes/registry';
import { clampZoom, lensFor, nextZoomStep } from '../modes/zoom';
import { useSession } from '../session/SessionContext';
import { colors, fonts, radius } from '../theme/tokens';
import { useVolumeRemote } from '../triggers/useVolumeRemote';

/** How long the zoom value stays over the preview after the last pinch move. */
const BUBBLE_MS = 800;

const START_ERRORS: Partial<Record<ReplayErrorCode, MessageKey>> = {
  LOW_STORAGE: 'setup.lowStorage',
  CAMERA_PERMISSION: 'common.cameraDenied',
};

/** Under "Conectar um celular controle": how many remotes are linked right now. Nothing when none is. */
function controllersStatus(t: TFunction, linked: number): string | undefined {
  if (linked <= 0) return undefined;
  return linked === 1 ? t('setup.controllerLinkedOne') : t('setup.controllerLinkedMany', { count: linked });
}

/**
 * Under "Usar este celular como controle": the camera phone this one is paired with. It says "Pareado", not
 * "Conectado": this screen cannot tell if the link is up, because the remote side only connects while its own screen is open.
 */
function cameraStatus(t: TFunction, host: { name: string } | null): string | undefined {
  if (host === null) return undefined;
  return host.name.length > 0 ? t('setup.pairedWith', { name: host.name }) : t('setup.paired');
}

export default function Setup() {
  const session = useSession();
  const { t, locale } = useT();
  // This screen stays mounted under Minhas gravações, the editor and the save screen: only hold the camera,
  // the volume buttons and the screen awake while it is the visible one.
  const focused = useIsFocused();
  // The Dispositivos sheet over this screen does not take the camera or the volume buttons away: this screen keeps both.
  const sheetOpen = useRemoteSheetOpen();
  const live = focused || sheetOpen;
  const [prefs, setPrefsState] = useState<Prefs>(() => repo.getPrefs());
  const update = (patch: Partial<Prefs>) => setPrefsState(repo.setPrefs(patch));
  // What this mode runs with (defaults + the player's changes for this mode).
  // A sport saved before the two modes opens as its group (Quadra or Academia).
  const modeId = offeredMode(prefs.sport);
  const settings = effectiveSettings(modeId, prefs);
  const updateMode = (patch: Partial<ModeSettings>) => update(withModeOverride(prefs, modeId, patch));
  // Zoom: the button goes through the stops, two fingers on the preview zoom freely. Saved per mode when the gesture ends;
  // while pinching the live value is only shown (and sent to the camera), so the screen does not rewrite the prefs per frame.
  const [zoomRange] = useState(() => getZoomRange());
  const savedZoom = clampZoom(settings.zoom, zoomRange);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  const zoom = liveZoom !== null ? liveZoom : savedZoom;
  // With two fixed lenses (Android) crossing 1x means opening the other lens; with continuous zoom the session ignores it.
  const lens = lensFor(savedZoom);
  const [bubble, setBubble] = useState(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showBubble = () => {
    setBubble(true);
    if (bubbleTimer.current !== undefined) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(false), BUBBLE_MS);
  };
  useEffect(() => () => clearTimeout(bubbleTimer.current), []);
  const pinch = useCameraPinch({
    zoom,
    range: zoomRange,
    onChange: (next) => {
      setLiveZoom(next);
      session.setZoom(next, false);
      showBubble();
    },
    onCommit: (next) => {
      setLiveZoom(null);
      if (Math.abs(next - savedZoom) > 1e-6) updateMode({ zoom: next });
    },
  });
  const cycleZoom = () => {
    const next = nextZoomStep(zoom, zoomRange);
    session.setZoom(next, true);
    updateMode({ zoom: next });
  };
  // The Bluetooth remote: the app cannot see the iOS pairing, only presses (this launch, or heard before).
  const remoteTest = useRemoteTest();
  const remoteView = remoteDeviceView(
    { pressed: remoteTest.pressed, testedBefore: remoteTest.testedBefore, waitedLong: false },
    locale,
  );
  // Paired counts as ready: a remote heard before works in the recording (which always listens to it), so its icon and
  // tile show it on like the recording screen does; only a remote never heard in the app stays grey. The texts still
  // tell paired from connected.
  const remoteReady = remoteView.state !== 'setup';
  // The sheet opens collapsed so the camera and its guide stay visible; mode and triggers sit behind the summary.
  const [expanded, setExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  // Swipe up on the sheet opens it, swipe down closes it; taps still reach the controls inside.
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => setExpanded(g.dy < 0),
    }),
  );
  const [speechDenied, setSpeechDenied] = useState(false);
  // Offline recognition only: court audio is never streamed to a server.
  // Asked again if the language changes: the on-device model is per language.
  const voiceSupported = useMemo(() => isVoiceSupported(voiceLocale(locale)), [locale]);
  const [speech, setSpeech] = useState(() => getSpeechPermission());
  const speechGranted = speech === 'granted';
  const mode = modeById(modeId);
  // The watch link: paired watch with the app → ready. Informational: the watch itself starts a save.
  const [watch, setWatch] = useState(() => getWatchStatus());
  useEffect(() => {
    const sub = addReplayListener('onWatchStatus', (e) => setWatch(e.status));
    return () => sub.remove();
  }, []);
  const watchStatus =
    watch === 'ready' ? t('setup.watchReady') : watch === 'notInstalled' ? t('setup.watchNotInstalled') : t('setup.watchNone');
  // The watch trigger is paid: before a game the next start's plan decides; the lock opens the paywall.
  const plan = usePlan();
  // Apple Watch only: no Android smartwatch was tested, so the tile stays visible but disabled there.
  const watchSupported = Platform.OS === 'ios';
  const watchAllowed = triggerAllowed('watch', plan);
  const watchOn = watchSupported && watchAllowed && watch === 'ready';
  // Only the watch is paid; the Bluetooth remote and the phone remote are free for every plan.
  const watchLocked = watchSupported && !watchAllowed;
  // The free plan cuts clips at 15 s: a longer pick is paid, and what the screen shows is what the game will get.
  const isAllowed = (seconds: number) => plan === 'paid' || seconds <= FREE_MAX_SECONDS;
  const lockedSeconds = CLIP_SECONDS_OPTIONS.filter((seconds) => !isAllowed(seconds));
  const clipSeconds = plan === 'paid' ? settings.cutSeconds : Math.min(settings.cutSeconds, FREE_MAX_SECONDS);
  // The phone remote (a second iPhone that taps Salvar for this one). The camera phone waits for its paired remotes for
  // as long as the app is open (see the root layout); pairing happens on its own sheet (/pairing).
  const [remoteSupported] = useState(() => isRemoteSupported());
  const [controlHost, setControlHost] = useState<RemotePeer | null>(() =>
    isRemoteSupported() ? remoteControllerHost() : null,
  );
  const [remoteLinked, setRemoteLinked] = useState(() => remoteHostControllers());
  useEffect(() => {
    if (!remoteSupported) return;
    const sub = addReplayListener('onRemoteStatus', (e) => {
      if (e.side === 'remote') return; // this phone used as a remote, not its own remotes
      setRemoteLinked(e.controllers === undefined ? 0 : e.controllers);
    });
    return () => sub.remove();
  }, [remoteSupported]);
  useEffect(() => {
    if (!remoteSupported || !focused) return;
    setControlHost(remoteControllerHost()); // it may have been paired or forgotten on the remote screen
    setRemoteLinked(remoteHostControllers()); // the status events of a remote that connected meanwhile were not heard
  }, [remoteSupported, focused]);
  const disconnectControl = () => {
    const name = controlHost === null ? '' : controlHost.name;
    Alert.alert(
      t('remote.forgetTitle', { name }),
      t('remote.forgetBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('remote.forget'),
          style: 'destructive',
          onPress: () => {
            remoteControllerForget();
            setControlHost(null);
          },
        },
      ],
    );
  };
  // Voice counts as on only when this mode wants it and the phone may listen.
  const voiceOn = voiceSupported && settings.voiceEnabled && speechGranted;
  const voiceStatus = !voiceSupported
    ? t('setup.voiceUnavailable')
    : !settings.voiceEnabled
      ? t('setup.off')
      : speechGranted
        ? t('setup.voiceSay', { first: VOICE_WORDS[locale][0], second: VOICE_WORDS[locale][1] })
        : speech === 'denied'
          ? t('setup.voiceDenied')
          : t('setup.tapToAllow');

  async function toggleVoice() {
    if (voiceOn) return updateMode({ voiceEnabled: false });
    const granted = speechGranted || (await requestSpeechPermission());
    setSpeech(granted ? 'granted' : 'denied');
    setSpeechDenied(!granted);
    if (granted) updateMode({ voiceEnabled: true });
  }

  const summary = t('setup.summary', {
    items: [
      t('setup.summaryClip', { seconds: clipSeconds }),
      t(voiceOn ? 'setup.summaryVoiceOn' : 'setup.summaryVoiceOff'),
      t(settings.gestureEnabled ? 'setup.summaryGestureOn' : 'setup.summaryGestureOff'),
      t(
        remoteView.state === 'connected'
          ? 'setup.summaryRemoteConnected'
          : remoteView.state === 'offline'
            ? 'setup.summaryRemotePaired'
            : 'setup.summaryRemoteNotConnected',
      ),
      ...(watchOn ? [t('setup.summaryWatchReady')] : []),
    ].join(', '),
  });

  const { phase, error, camera } = session.state;
  const { prepare, release } = session;

  // Live preview while positioning; the buffer starts filling now, so "Começar gravação" is instant.
  useEffect(() => {
    if (live) void prepare(modeId, plan);
    else void release();
  }, [live, prepare, release, modeId, lens, plan]);

  useEffect(() => {
    if (!focused) return;
    void activateKeepAwakeAsync('setup');
    return () => void deactivateKeepAwake('setup');
  }, [focused]);

  // A press of the Bluetooth remote here proves it is paired and reaching the app.
  useVolumeRemote(live && phase === 'idle', remoteTest.press);

  // Coming back from another app, whether the remote is still on is unknown: until it is pressed again it shows as paired.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') clearRemotePress();
    });
    return () => sub.remove();
  }, []);

  const preview = useStartPreview();
  const startNote =
    preview.decision.kind === 'credit' ? t('setup.passCredits', { count: preview.credits }) : null;
  const busy = useRef(false);
  async function onStart() {
    if (busy.current) return;
    busy.current = true;
    try {
      if ((await session.start(modeId)) !== 'blocked') return;
      const outcome = await openPaywall(t);
      // One retry right after a purchase: the player already asked to start. A purchase that shows up later
      // (SDK lag) only changes the status line; the next tap starts.
      if (outcome === 'purchased' || outcome === 'restored') await session.start(modeId);
    } finally {
      busy.current = false;
    }
  }

  const opening = camera === 'starting';
  const starting = phase === 'starting' || opening;
  const errorText = error ? t(START_ERRORS[error] ?? 'setup.cameraFailed') : null;

  // On its side the phone shows only two small buttons (the settings open on demand), so the sheet does not cover the camera.
  const landscape = useDeviceLandscape(live && phase === 'idle');
  const compact = landscape && !expanded;

  const inGame = phase === 'recording' || phase === 'stopping' || (phase === 'ended' && error !== undefined);

  // One camera view for the whole game: setup and recording only swap the controls drawn over it.
  return (
    <View style={styles.root}>
      <ReplayCameraView style={StyleSheet.absoluteFill} />
      {inGame ? (
        <RecordingPanel clipSeconds={settings.cutSeconds} gesture={settings.gestureEnabled} voice={voiceOn} />
      ) : (
        renderSetupControls()
      )}
    </View>
  );

  function renderSetupControls() {
    return (
      <>
        {zoomRange.continuous ? <View testID="zoom-pinch" style={StyleSheet.absoluteFill} {...pinch} /> : null}
        {bubble ? <ZoomBubble value={zoom} bottom={(compact ? 72 : sheetHeight) + 16} /> : null}
        <View testID="guide-area" pointerEvents="none" style={[styles.guideArea, { bottom: compact ? 72 : sheetHeight }]}>
          <PositionGuide guide={mode.guide} />
        </View>

        <SafeAreaView edges={['top']} style={styles.top}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('setup.myRecordings')}
              onPress={() => router.push('/games')}
              style={[styles.pill, styles.pillButton]}>
              <Text style={styles.pillText}>{t('setup.myRecordings')}</Text>
            </Pressable>
            <ZoomButton value={zoom} onPress={cycleZoom} />
          </View>
          {mode.tip && !compact ? (
            <View style={styles.tip}>
              <Text style={styles.tipText}>{modeTip(mode.group, locale)}</Text>
            </View>
          ) : null}
        </SafeAreaView>

        {compact ? (
          <CompactDock
            busy={starting}
            error={errorText}
            onSettings={() => setExpanded(true)}
            onStart={() => session.start(modeId)}
          />
        ) : (
        <View testID="setup-sheet" style={styles.sheet} onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}>
          <SafeAreaView edges={['bottom']} style={styles.sheetBody} {...swipe.panHandlers}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? t('setup.closeSettings') : t('setup.openSettings')}
              onPress={() => setExpanded(!expanded)}
              hitSlop={12}
              style={styles.handleArea}>
              <View style={styles.handle} />
            </Pressable>
            {expanded ? renderSettings() : renderSummary()}

            {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
            {startNote ? <Text style={styles.startNote}>{startNote}</Text> : null}
            <Button
              label={opening ? t('setup.openingCamera') : t('setup.start')}
              icon={starting ? <ActivityIndicator color={colors.onAccent} /> : undefined}
              disabled={starting}
              onPress={() => void onStart()}
            />
          </SafeAreaView>
        </View>
        )}
      </>
    );
  }

  function renderSummary() {
    const iconColor = (on: boolean) => (on ? colors.accent : colors.muted);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        onPress={() => setExpanded(true)}
        style={styles.summary}>
        <View style={styles.summaryHead}>
          <Text style={styles.section}>{t('setup.howToSave')}</Text>
        </View>
        <View style={styles.summaryIcons}>
          <MicIcon color={iconColor(voiceOn)} size={32} />
          <ArmsUpIcon color={iconColor(settings.gestureEnabled)} size={32} />
          <RemoteIcon color={iconColor(remoteReady)} size={32} />
          <WatchIcon color={iconColor(watchOn)} size={32} />
          {remoteSupported ? <QrIcon color={iconColor(remoteLinked > 0)} size={32} /> : null}
        </View>
      </Pressable>
    );
  }

  function renderSettings() {
    return (
      <>
        <View style={styles.clipLength}>
          <Text style={styles.section}>{t('setup.clipLength')}</Text>
          <View style={styles.chips}>
            {CLIP_SECONDS_OPTIONS.filter(isAllowed).map((seconds) => (
              <Chip
                key={seconds}
                label={`${seconds}s`}
                selected={clipSeconds === seconds}
                onPress={() => updateMode({ cutSeconds: seconds })}
              />
            ))}
            {lockedSeconds.length === 0 ? null : (
              // The paid lengths share one outline and one "Pro" badge instead of one each.
              <View style={styles.proGroup}>
                {lockedSeconds.map((seconds) => (
                  <Chip
                    key={seconds}
                    label={`${seconds}s`}
                    grouped
                    lockedHint={t('setup.proOnly')}
                    onPress={() => void openPaywall(t)}
                  />
                ))}
                <ProBadge label={t('setup.proBadge')} right={6} />
              </View>
            )}
          </View>
        </View>

        <Text style={styles.section}>{t('setup.triggers')}</Text>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <TriggerTile
              icon={<MicIcon />}
              title={sourceLabel('voice', locale)}
              status={voiceStatus}
              active={voiceOn}
              disabled={!voiceSupported}
              onPress={voiceSupported ? () => void toggleVoice() : undefined}
            />
            <TriggerTile
              icon={<ArmsUpIcon />}
              title={sourceLabel('gesture', locale)}
              status={settings.gestureEnabled ? t('setup.on') : t('setup.off')}
              active={settings.gestureEnabled}
              onPress={() => updateMode({ gestureEnabled: !settings.gestureEnabled })}
            />
          </View>
        </View>

        <View style={styles.triggerPlain}>
          <View style={styles.gridRow}>
            <View style={styles.tileSlot}>
              <TriggerTile
                icon={<RemoteIcon />}
                title={t('setup.bluetoothRemote')}
                status={remoteView.statusText}
                active={remoteReady}
                onPress={() => router.push({ pathname: '/devices', params: { kind: 'remote' } })}
              />
            </View>
            {/* The watch is the one paid trigger: it carries its own outline and "Pro" badge. */}
            <View style={styles.tileSlot}>
              {watchLocked ? <View pointerEvents="none" style={styles.watchOutline} /> : null}
              <TriggerTile
                icon={<WatchIcon />}
                title={sourceLabel('watch', locale)}
                status={watchSupported ? watchStatus : t('setup.watchIosOnly')}
                active={watchOn}
                disabled={!watchSupported || (watchAllowed && watch === 'unsupported')}
                lockedHint={watchLocked ? t('setup.watchProOnly') : undefined}
                onPress={watchLocked ? () => void openPaywall(t) : undefined}
              />
              {watchLocked ? <ProBadge label={t('setup.proBadge')} top={-9} right={6} /> : null}
            </View>
          </View>
          {remoteSupported ? (
            <>
              <View style={styles.gridRow}>
                <TriggerTile
                  icon={<QrIcon />}
                  title={t('setup.connectPhoneRemote')}
                  status={controllersStatus(t, remoteLinked)}
                  active={remoteLinked > 0}
                  onPress={() => router.push('/pairing')}
                />
                <TriggerTile
                  icon={<TapIcon />}
                  title={t('setup.useAsRemote')}
                  status={cameraStatus(t, controlHost)}
                  active={controlHost !== null}
                  onPress={() => router.push('/remote')}
                />
              </View>
              {controlHost !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('setup.disconnectThisPhone')}
                  hitSlop={8}
                  onPress={disconnectControl}
                  style={styles.remoteLinkBox}>
                  <Text style={styles.remoteLink}>{t('setup.disconnectThisPhone')}</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>

        {speechDenied ? <Text style={styles.error}>{t('setup.speechDenied')}</Text> : null}

        <View style={styles.feedbackRow}>
          <Text style={styles.section}>{t('setup.saveAlerts')}</Text>
          <View style={styles.chips}>
            <Chip
              label={t('setup.sound')}
              selected={prefs.soundOnSave}
              onPress={() => update({ soundOnSave: !prefs.soundOnSave })}
            />
            <Chip
              label={t('setup.flash')}
              selected={prefs.flashOnSave}
              onPress={() => update({ flashOnSave: !prefs.flashOnSave })}
            />
          </View>
        </View>
      </>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  top: { position: 'absolute', top: 0, left: 16, right: 16, gap: 8 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  pill: {
    backgroundColor: 'rgba(15,16,13,0.75)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  pillButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.onAccent,
  },
  tip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15,16,13,0.8)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  tipText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetBody: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  guideArea: { position: 'absolute', top: 0, left: 0, right: 0 },
  handleArea: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 40,
    minHeight: 24,
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  summary: { gap: 8, minHeight: 44 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  summaryChevron: { fontSize: 12, color: colors.muted },
  summaryIcons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', minHeight: 48 },
  clipLength: { gap: 8 },
  clipLengthHint: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
  },
  proGroup: { flexDirection: 'row', borderWidth: 1, borderColor: colors.accent, borderRadius: radius.chip },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remoteLinkBox: { minHeight: 48, justifyContent: 'center' },
  remoteLink: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.soft,
    textDecorationLine: 'underline',
  },
  // The outline is drawn around the tiles, out in the sheet's side padding, so the tiles keep the width of the free ones.
  tileSlot: { flex: 1, minWidth: 0, flexDirection: 'row' },
  watchOutline: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderWidth: 1, borderColor: colors.accent, borderRadius: 14 },
  triggerPlain: { gap: 8 },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
  startNote: { fontFamily: fonts.body, fontSize: 13, color: colors.soft, textAlign: 'center' },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
