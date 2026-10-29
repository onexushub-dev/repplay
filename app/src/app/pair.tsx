import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteControllerPairWithLink,
  remoteControllerStart,
  remoteControllerStop,
} from '../../modules/replay-camera';
import type { RemotePairFailure } from '../../modules/replay-camera/src/ReplayCamera.types';
import { track } from '../analytics';
import { Button } from '../components/Button';
import { CheckIcon, CloseIcon } from '../components/icons';
import { PulseRing } from '../components/PulseRing';
import { RequirementsChecklist } from '../components/RequirementsChecklist';
import type { TFunction } from '../i18n';
import { useT } from '../i18n/useT';
import { parsePairLink } from '../remote/pairLink';
import { colors, fonts } from '../theme/tokens';

const REDIRECT_AFTER_MS = 1200;
/** The camera phone may never answer (out of range, app closed): stop waiting and say so. */
const CONNECT_TIMEOUT_MS = 15_000;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
  return value;
}

function failureText(reason: RemotePairFailure, t: TFunction): string {
  switch (reason) {
    case 'expired':
      return t('remote.failExpired');
    case 'locked':
      return t('remote.failLocked');
    case 'notFound':
      return t('remote.failNotFound');
    case 'denied':
      return t('remote.failUnpairedRepair');
    case 'full':
      return t('remote.failFull');
    case 'used':
      return t('remote.failUsed');
    case 'closed':
      return t('remote.failClosed');
    default:
      return t('remote.failWrongCodeLink');
  }
}

/** Where the `repplay://pair?...` link (read by the Camera app from the QR code) lands. */
export default function Pair() {
  const { t } = useT();
  const params = useLocalSearchParams<{ h?: string; s?: string; n?: string }>();
  const h = one(params.h);
  const s = one(params.s);
  const n = one(params.n);
  const link = parsePairLink({ h, s, n });
  const hostId = link === null ? null : link.hostId;
  const secret = link === null ? null : link.secret;
  const [hostName, setHostName] = useState(link === null ? '' : link.hostName);
  const [paired, setPaired] = useState(false);
  const [failure, setFailure] = useState<RemotePairFailure | null>(null);
  const pairedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hostId === null || secret === null) return;
    const parsed = parsePairLink({ h, s, n });
    if (parsed === null) return;
    const sub = addReplayListener('onRemotePairing', (e) => {
      if (e.phase === 'paired') {
        pairedRef.current = true;
        setHostName(e.peer.name);
        setFailure(null);
        setPaired(true);
        track('pairing_completed', { method: 'qr', kind: 'remote' });
      } else if (e.phase === 'failed') {
        setFailure(e.reason);
        track('pairing_failed', { reason: e.reason });
      }
    });
    remoteControllerStart();
    remoteControllerPairWithLink(parsed.hostId, parsed.secret, parsed.hostName);
    return () => {
      sub.remove();
      if (!pairedRef.current) remoteControllerStop();
    };
    // The link is read once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, secret]);

  // No answer for a while becomes "not found" (a new attempt starts the wait over).
  useEffect(() => {
    if (link === null || paired || failure !== null) return;
    const id = setTimeout(() => {
      setFailure('notFound');
      track('pairing_failed', { reason: 'notFound' });
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [link, paired, failure, attempt]);

  // A link that is not a pairing link is a failed pairing too (a mangled QR code, an old link).
  const invalidLink = link === null;
  useEffect(() => {
    if (invalidLink) track('pairing_failed', { reason: 'invalid_link' });
  }, [invalidLink]);

  // Opened straight from the QR code there is no screen behind this one: go to the start instead of doing nothing.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const retry = () => {
    if (link === null) return;
    setFailure(null);
    setAttempt((n) => n + 1);
    remoteControllerPairWithLink(link.hostId, link.secret, link.hostName);
  };

  useEffect(() => {
    if (!paired) return;
    const id = setTimeout(() => router.replace('/remote'), REDIRECT_AFTER_MS);
    return () => clearTimeout(id);
  }, [paired]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.role}>{t('remote.roleRemote')}</Text>
        {link === null ? (
          <>
            <View style={[styles.badge, styles.badgeBad]}>
              <CloseIcon color={colors.ground} size={56} />
            </View>
            <Text style={styles.warning}>{t('remote.invalidLink')}</Text>
            <Button label={t('remote.enterCode')} onPress={() => router.replace('/remote')} />
          </>
        ) : paired ? (
          <>
            <View style={styles.badge}>
              <CheckIcon size={64} />
            </View>
            <Text style={styles.success}>{t('remote.pairedWith', { name: hostName })}</Text>
          </>
        ) : failure !== null ? (
          <>
            <View style={[styles.badge, styles.badgeBad]}>
              <CloseIcon color={colors.ground} size={56} />
            </View>
            <Text style={styles.warning}>{failureText(failure, t)}</Text>
            {failure === 'notFound' ? <RequirementsChecklist /> : null}
            {failure === 'notFound' ? <Button label={t('common.tryAgain')} onPress={retry} /> : null}
            {failure !== 'notFound' ? (
              <Button label={t('remote.enterCode')} onPress={() => router.replace('/remote')} />
            ) : null}
          </>
        ) : (
          <>
            <PulseRing color={colors.accent} />
            <Text style={styles.status}>{t('remote.connectingTo', { name: hostName })}</Text>
          </>
        )}
        {paired ? null : <Button label={t('common.close')} variant="secondary" onPress={leave} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, padding: 20, gap: 16, justifyContent: 'center', alignItems: 'stretch' },
  role: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: colors.muted, textAlign: 'center' },
  badge: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBad: { backgroundColor: colors.warning },
  status: { fontFamily: fonts.bodySemi, fontSize: 20, lineHeight: 28, color: colors.text, textAlign: 'center' },
  success: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 28, color: colors.accent, textAlign: 'center' },
  warning: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.warning, textAlign: 'center' },
});
