import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteHostBeginPairing,
  remoteHostCheck,
  remoteHostEndPairing,
  remoteHostPeers,
  remoteHostRemove,
} from '../../modules/replay-camera';
import type { RemotePairing, RemotePeer } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { CheckProgress, FAILED_VISIBLE_MS, OK_VISIBLE_MS, type CheckView } from '../components/CheckProgress';
import { DeviceNameField } from '../components/DeviceNameField';
import { CheckIcon, PhoneIcon } from '../components/icons';
import { PulseRing } from '../components/PulseRing';
import { RequirementsChecklist } from '../components/RequirementsChecklist';
import { StatusPill } from '../components/StatusPill';
import { type AppLocale, currentLocale, translate } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';

/** One remote per camera phone, as the remote has one camera (the native side holds the same rule). */
const MAX_REMOTES = 1;
/** A code is good for two minutes; building the QR image takes a moment, so the offer can look slightly longer. */
const VALID_SECONDS = 120;
const CLOSE_AFTER_MS = 1500;
/** The camera phone gives up on an unanswered "are you there?" after 3 s; this is only the net under that. */
const CHECK_NET_MS = 5000;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** The popup of a "Verificar conexão": which remote it is about, and where the question stands. */
type Popup = { id: string; name: string; view: CheckView };

/** The line under a remote's name: what its state means for the player. */
export function peerHint(linked: boolean, locale: AppLocale = currentLocale()): string {
  return translate(locale, linked ? 'pairing.peerReady' : 'pairing.peerReconnect');
}

function RowButton({ label, accessibilityLabel, tone, disabled, onPress }: {
  label: string;
  accessibilityLabel: string;
  tone: 'accent' | 'warning';
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = tone === 'accent' ? colors.accent : colors.warning;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled === true}
      onPress={onPress}
      style={({ pressed }) => [styles.rowButton, { borderColor: color }, (pressed || disabled === true) && styles.rowButtonDim]}>
      <Text style={[styles.rowButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
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

/**
 * The camera phone's side of pairing. It opens on the paired remote (is it linked right now? "Verificar" asks it,
 * "Remover" forgets it). One remote at a time: a new one takes its place through "Esquecer e parear outro", which asks
 * first, like the remote's own "Esquecer esta câmera". The QR and the 6-digit code only exist once the player asks for
 * them, or at once when no remote is paired, so a code never runs out while the player is just looking.
 */
export default function Pairing() {
  const { t, locale } = useT();
  const [offer, setOffer] = useState<RemotePairing | null>(null);
  const [pairing, setPairing] = useState(false);
  // Read once, when the sheet opens: with nobody paired yet it goes straight to the code.
  const [initialPeers] = useState<RemotePeer[]>(() => remoteHostPeers());
  const [peers, setPeers] = useState<RemotePeer[]>(initialPeers);
  const [paired, setPaired] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const peersRef = useRef<RemotePeer[]>(initialPeers);
  const pairingRef = useRef(false);
  const nets = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /** Reads the paired remotes; returns the one that was not there before, if any. */
  const readPeers = useCallback((): RemotePeer | undefined => {
    const list = remoteHostPeers();
    const added = list.find((p) => !peersRef.current.some((before) => before.id === p.id));
    peersRef.current = list;
    setPeers(list);
    return added;
  }, []);

  /** Opens a pairing (a new code each time). */
  const open = useCallback(() => {
    readPeers();
    setPaired(null);
    setConnecting(null);
    setLocked(false);
    setNow(Date.now());
    pairingRef.current = true;
    setPairing(true);
    setOffer(remoteHostBeginPairing());
  }, [readPeers]);

  const cancelPairing = () => {
    remoteHostEndPairing();
    pairingRef.current = false;
    setPairing(false);
    setOffer(null);
    setConnecting(null);
    setLocked(false);
    readPeers();
  };

  useEffect(() => {
    // Opening a pairing asks the native module for a code, so it belongs in an effect even though it sets state too.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialPeers.length === 0) open();
    const timers = nets.current;
    return () => {
      remoteHostEndPairing();
      Object.keys(timers).forEach((id) => clearTimeout(timers[id]));
    };
  }, [open, initialPeers]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Once a remote has paired the sheet has done its job: show the check for a moment and go back to the setup screen.
  useEffect(() => {
    if (paired === null) return;
    const id = setTimeout(() => router.back(), CLOSE_AFTER_MS);
    return () => clearTimeout(id);
  }, [paired]);

  // The camera phone tells us when a remote connected or left: that is how the list stays true, and how we know a new
  // remote was paired.
  useEffect(() => {
    const sub = addReplayListener('onRemoteStatus', (e) => {
      if (e.side === 'remote') return;
      const added = readPeers();
      if (added && pairingRef.current) setPaired(added.name);
    });
    return () => sub.remove();
  }, [readPeers]);

  // Pairing the same remote again replaces its entry, so it is not "a new peer": the host says so itself.
  useEffect(() => {
    const sub = addReplayListener('onRemotePairing', (e) => {
      if (e.phase === 'paired') {
        readPeers();
        setPaired(e.peer.name);
      } else if (e.phase === 'connecting') {
        setConnecting(e.peer.name);
      } else if (e.phase === 'released') {
        setConnecting(null);
      } else if (e.phase === 'offerEnded') {
        setLocked(true);
        setConnecting(null);
      }
    });
    return () => sub.remove();
  }, [readPeers]);

  useEffect(() => {
    const sub = addReplayListener('onRemoteCheck', (e) => {
      clearTimeout(nets.current[e.id]);
      setPopup((current) =>
        current !== null && current.id === e.id ? { ...current, view: e.ok ? { phase: 'ok', ms: e.ms } : { phase: 'failed' } } : current,
      );
    });
    return () => sub.remove();
  }, []);

  // The answer closes by itself: quickly when the remote is fine, after a longer look when it did not answer.
  const popupPhase = popup === null ? null : popup.view.phase;
  useEffect(() => {
    if (popupPhase !== 'ok' && popupPhase !== 'failed') return;
    const id = setTimeout(() => setPopup(null), popupPhase === 'ok' ? OK_VISIBLE_MS : FAILED_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [popupPhase]);

  const verify = (peer: RemotePeer) => {
    setPopup({ id: peer.id, name: peer.name, view: { phase: 'checking' } });
    clearTimeout(nets.current[peer.id]);
    nets.current[peer.id] = setTimeout(() => {
      setPopup((current) =>
        current !== null && current.id === peer.id && current.view.phase === 'checking' ? { ...current, view: { phase: 'failed' } } : current,
      );
    }, CHECK_NET_MS);
    remoteHostCheck(peer.id);
  };

  // The paired remote goes (it is told, and forgets this camera too) and the code for the new one opens right away.
  const confirmReplace = (peer: RemotePeer) => {
    Alert.alert(
      t('pairing.replaceTitle', { name: peer.name }),
      t('pairing.replaceBody', { name: peer.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pairing.replaceAndPair'),
          style: 'destructive',
          onPress: () => {
            peersRef.current.forEach((each) => remoteHostRemove(each.id));
            readPeers();
            open();
          },
        },
      ],
    );
  };

  const confirmRemove = (peer: RemotePeer) => {
    Alert.alert(
      t('pairing.removeTitle', { name: peer.name }),
      t('pairing.removeBody', { name: peer.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pairing.remove'),
          style: 'destructive',
          onPress: () => {
            remoteHostRemove(peer.id);
            readPeers();
          },
        },
      ],
    );
  };

  const full = peers.length >= MAX_REMOTES;
  const current = peers.length > 0 ? peers[peers.length - 1] : null;
  const secondsLeft = offer === null ? 0 : Math.min(VALID_SECONDS, Math.max(0, Math.ceil((offer.expiresAt - now) / 1000)));
  const expired = offer !== null && secondsLeft === 0;
  const dead = expired || locked;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.role}>{t('pairing.roleCamera')}</Text>
        <Text style={styles.title}>{t('pairing.title')}</Text>

        {paired !== null ? (
          <View style={styles.done}>
            <View style={styles.doneBadge}>
              <CheckIcon size={64} />
            </View>
            <Text style={styles.success}>{t('pairing.paired', { name: paired })}</Text>
          </View>
        ) : (
          <>
            {peers.length > 0 ? (
              <View style={styles.list}>
                <Text style={styles.section}>{t('pairing.remote')}</Text>
                {peers.map((peer) => {
                  const linked = peer.connected === true;
                  const checking = popup !== null && popup.view.phase === 'checking';
                  return (
                    <View key={peer.id} style={styles.peer}>
                      <View style={styles.peerTop}>
                        <View style={styles.peerIcon}>
                          <PhoneIcon color={linked ? colors.accent : colors.muted} size={24} />
                        </View>
                        <View style={styles.peerInfo}>
                          <Text style={styles.peerName}>{peer.name}</Text>
                          <Text style={styles.peerHint}>{peerHint(linked, locale)}</Text>
                        </View>
                        <StatusPill text={linked ? t('pairing.linked') : t('pairing.offline')} tone={linked ? 'on' : 'idle'} />
                      </View>
                      <View style={styles.peerActions}>
                        <RowButton
                          label={t('pairing.verify')}
                          accessibilityLabel={t('pairing.verifyName', { name: peer.name })}
                          tone="accent"
                          disabled={checking}
                          onPress={() => verify(peer)}
                        />
                        <RowButton
                          label={t('pairing.remove')}
                          accessibilityLabel={t('pairing.removeName', { name: peer.name })}
                          tone="warning"
                          onPress={() => confirmRemove(peer)}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {!pairing ? (
              full && current !== null ? (
                <View style={styles.replace}>
                  <Button label={t('pairing.replaceAndPair')} variant="secondary" onPress={() => confirmReplace(current)} />
                  <Text style={styles.note}>{t('pairing.oneRemote')}</Text>
                </View>
              ) : (
                <Button label={t('pairing.pairOne')} onPress={open} />
              )
            ) : (
              <>
                <View style={styles.steps}>
                  <Step n={1} text={t('pairing.step1')} />
                  <Step n={2} text={t('pairing.step2')} />
                </View>
                {offer !== null ? (
                  <>
                    <View style={[styles.qr, dead && styles.dim]}>
                      <Image
                        accessibilityLabel={t('pairing.qrLabel')}
                        source={{ uri: `file://${offer.qrPath}` }}
                        style={styles.qrImage}
                      />
                    </View>
                    <Text style={styles.fallback}>{t('pairing.typeInstead')}</Text>
                    <Text style={[styles.code, dead && styles.dim]}>{offer.code}</Text>
                    {dead ? null : (
                      <View style={styles.waiting}>
                        <PulseRing color={colors.accent} size={28} />
                        <Text style={styles.waitingText}>
                          {connecting === null ? t('pairing.waiting') : t('pairing.connectingWith', { name: connecting })}
                        </Text>
                      </View>
                    )}
                    <Text style={dead ? styles.warning : styles.countdown}>
                      {locked
                        ? t('pairing.tooManyWrong')
                        : expired
                          ? t('pairing.expired')
                          : t('pairing.validFor', { time: clock(secondsLeft) })}
                    </Text>
                    <Text style={styles.note}>{t('pairing.needsApp')}</Text>
                  </>
                ) : (
                  <Text style={styles.warning}>{t('pairing.codeFailed')}</Text>
                )}
                <RequirementsChecklist />
                <Button label={t('pairing.newCode')} variant="secondary" onPress={open} />
                {peers.length > 0 ? <Button label={t('common.cancel')} variant="secondary" onPress={cancelPairing} /> : null}
              </>
            )}
          </>
        )}

        <DeviceNameField />

        <Button label={t('common.close')} variant="secondary" onPress={() => router.back()} />
      </ScrollView>
      {popup !== null ? <CheckProgress name={popup.name} view={popup.view} onDismiss={() => setPopup(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: 20, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, color: colors.text },
  role: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: colors.muted },
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onAccent },
  stepText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waitingText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.accent },
  done: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  doneBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: radius.card },
  qrImage: { width: 220, height: 220 },
  fallback: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  code: { fontFamily: fonts.displayBold, fontSize: 56, letterSpacing: 6, color: colors.accent, textAlign: 'center' },
  countdown: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textAlign: 'center' },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  dim: { opacity: 0.35 },
  success: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 28, color: colors.accent, textAlign: 'center' },
  warning: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.warning },
  list: { gap: 8 },
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  replace: { gap: 8 },
  peer: { gap: 12, backgroundColor: colors.surface, borderRadius: radius.card, padding: 14 },
  peerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  peerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  peerInfo: { flex: 1, gap: 2 },
  peerName: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  peerHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  peerActions: { flexDirection: 'row', gap: 10 },
  rowButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  rowButtonDim: { opacity: 0.5 },
  rowButtonText: { fontFamily: fonts.bodyBold, fontSize: 15 },
});
