import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { CheckIcon, RemoteIcon } from '../components/icons';
import { PulseRing } from '../components/PulseRing';
import { StatusPill } from '../components/StatusPill';
import { StepList } from '../components/StepList';
import { useRemoteLink } from '../devices/bluetoothRemote';
import { repo } from '../data/mmkv';
import { remoteDeviceView } from '../devices/remoteDevice';
import { useSession } from '../session/SessionContext';
import { setRemoteSheetOpen } from '../devices/remoteTest';
import { useRemoteTest } from '../devices/useRemoteTest';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';

/** After this long without a press the sheet adds what to check. */
const WAITED_LONG_MS = 15_000;

/** The Bluetooth remote's side of the Dispositivos sheet: what to do to connect it, and proof when it works. */
export default function Devices() {
  const { t, locale } = useT();
  const { pressed, testedBefore, forget } = useRemoteTest();
  const [waitedLong, setWaitedLong] = useState(false);
  // "Não funciona? Parear de novo": the steps for a remote used before, which may have been unpaired in Ajustes since.
  const [repairOpen, setRepairOpen] = useState(false);

  // The remote presses "volume up". The setup screen under this sheet is the one listening (and keeps the camera and
  // the audio session as they were): two screens taking and handing back the volume buttons raced each other.
  useEffect(() => {
    setRemoteSheetOpen(true);
    return () => setRemoteSheetOpen(false);
  }, []);

  useEffect(() => {
    if (pressed) return;
    const id = setTimeout(() => setWaitedLong(true), WAITED_LONG_MS);
    return () => {
      clearTimeout(id);
      setWaitedLong(false);
    };
  }, [pressed]);

  // The remote's link as iOS shows it, looked at while the sheet is open (BLE remotes the app has learnt).
  const link = useRemoteLink(true);
  // Presses are heard through the camera: right after the app opens, it may still be starting under this sheet.
  const cameraReady = useSession().state.camera === 'on';
  const view = remoteDeviceView({ pressed, testedBefore, waitedLong, link, cameraReady }, locale);
  const remoteName = repo.getPrefs().remoteBleName;
  const steps = [t('devices.step1'), t('devices.step2'), t('devices.step3')];
  const remembered = pressed || testedBefore;

  const confirmForget = () =>
    Alert.alert(t('devices.forgetTitle'), t('devices.forgetHelp'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('remote.forget'), style: 'destructive', onPress: forget },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <RemoteIcon color={colors.accent} size={28} />
          <Text style={styles.title}>{t('setup.bluetoothRemote')}</Text>
        </View>
        <StatusPill text={view.statusText} tone={view.state === 'connected' ? 'on' : 'idle'} />

        {view.state === 'connected' ? (
          <View style={styles.done}>
            <View style={styles.doneBadge}>
              <CheckIcon size={56} />
            </View>
            <Text style={styles.success}>{t('devices.connected')}</Text>
          </View>
        ) : null}

        {view.showSteps || (view.stepsBehindRepair && repairOpen) ? <StepList steps={steps} /> : null}
        {view.stepsBehindRepair && !repairOpen ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setRepairOpen(true)} style={styles.repair}>
            <Text style={styles.repairText}>{t('devices.repair')}</Text>
          </Pressable>
        ) : null}

        {view.preparing ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.soft} />
            <Text style={styles.preparingText}>{t('devices.preparing')}</Text>
          </View>
        ) : null}

        {view.showWaiting ? (
          <View style={styles.waiting}>
            <PulseRing color={colors.accent} size={28} />
            <Text style={styles.waitingText}>{t('devices.waiting')}</Text>
          </View>
        ) : null}

        {view.showNote ? <Text style={styles.note}>{view.note}</Text> : null}

        {remembered ? (
          <View style={styles.row}>
            <Text style={styles.rowName}>
              {remoteName !== undefined ? t('devices.pairedNamed', { name: remoteName }) : t('devices.paired')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('devices.forgetA11y')}
              hitSlop={8}
              onPress={confirmForget}
              style={styles.forget}>
              <Text style={styles.forgetText}>{t('remote.forget')}</Text>
            </Pressable>
          </View>
        ) : null}

        <Button label={t('devices.done')} variant={view.state === 'connected' ? 'primary' : 'secondary'} onPress={() => router.back()} />

        {/* TEMP(diag-remote): link to the in-app diagnostic log. */}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/diag')} style={styles.diag}>
          <Text style={styles.diagText}>{t('devices.diagnostics')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, color: colors.text },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waitingText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.accent },
  preparingText: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.soft, flexShrink: 1 },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  done: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  doneBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  success: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.accent, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  repair: { minHeight: 44, justifyContent: 'center' },
  repairText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.accent, textDecorationLine: 'underline' },
  forget: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  forgetText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
  // TEMP(diag-remote)
  diag: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  diagText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft, textDecorationLine: 'underline' },
});
