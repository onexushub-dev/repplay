import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestPermissions } from '../../modules/replay-camera';
import { Button } from '../components/Button';
import { PhoneIcon, ShareIcon, ShieldIcon, ArmsUpIcon } from '../components/icons';
import { repo } from '../data/mmkv';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n/useT';
import { BRAND_LOGO, logoAspect } from '../share/brandLogo';
import { colors, fonts } from '../theme/tokens';

const STEPS: { Icon: typeof PhoneIcon; text: MessageKey }[] = [
  { Icon: PhoneIcon, text: 'onboarding.step1' },
  { Icon: ArmsUpIcon, text: 'onboarding.step2' },
  { Icon: ShareIcon, text: 'onboarding.step3' },
];

export default function Onboarding() {
  const { t } = useT();
  const [denied, setDenied] = useState(false);

  async function allow() {
    if (await requestPermissions()) {
      repo.setPrefs({ onboardingDone: true });
      router.replace('/setup');
    } else {
      setDenied(true);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="Repplay" />

      <Text style={styles.title} accessibilityRole="header">
        {t('onboarding.titleTop')}
        {'\n'}
        <Text style={{ color: colors.accent }}>{t('onboarding.titleAccent')}</Text>
      </Text>

      <View style={styles.steps}>
        {STEPS.map(({ Icon, text }) => (
          <View key={text} style={styles.step}>
            <Icon />
            <Text style={styles.stepText}>{t(text)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <ShieldIcon />
        <Text style={styles.noteText}>{t('onboarding.privacy')}</Text>
      </View>

      <View style={styles.footer}>
        {denied ? (
          <>
            <Text style={styles.denied}>{t('common.cameraDenied')}</Text>
            <Button label={t('common.openSettings')} variant="secondary" onPress={() => Linking.openSettings()} />
          </>
        ) : null}
        <Button label={t('onboarding.allow')} onPress={allow} />
        <Text style={styles.caption}>{t('onboarding.caption')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 24, paddingTop: 24, gap: 28 },
  logo: { height: 30, aspectRatio: logoAspect(), alignSelf: 'flex-start' },
  title: { fontFamily: fonts.displayBold, fontSize: 46, lineHeight: 48, color: colors.text },
  steps: { gap: 14 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.text },
  note: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, padding: 14 },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.soft },
  footer: { marginTop: 'auto', gap: 10, paddingBottom: 16 },
  denied: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning, textAlign: 'center' },
  caption: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
