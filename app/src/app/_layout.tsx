import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { isRemoteSupported, remoteHostStart, remoteHostStop } from '../../modules/replay-camera';
import { startFocusQueue } from '../focus/appFocusQueue';
import { useLocaleSync } from '../i18n/useT';
import { payments } from '../payments';
import { RemoteStartListener } from '../session/RemoteStartListener';
import { SessionProvider } from '../session/SessionContext';
import { clearExportsFolder } from '../share/exportCache';
import { colors } from '../theme/tokens';

SplashScreen.preventAutoHideAsync();
// Exports from the last run (a crash or a kill leaves them) go once per start; within a run they are reused.
clearExportsFolder();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  // The app language follows the device (Android can change it while the app runs).
  useLocaleSync();

  useEffect(() => {
    payments.start();
    // The month may have turned while the app was in the background: the free allowance starts over.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') payments.recheckMonth();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Modo Foco in the background: clips are analysed while the app is open and no recording runs.
  useEffect(() => startFocusQueue(), []);

  // The camera phone answers its paired remotes for as long as the app is open, whatever screen is in front: tying it to
  // one screen dropped the link every time the player moved between the setup, the recording and the summary.
  // Coming back to the front starts the advertising over, since iOS may have dropped it while the app was away.
  useEffect(() => {
    if (!isRemoteSupported()) return;
    remoteHostStart();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') remoteHostStart();
    });
    return () => {
      sub.remove();
      remoteHostStop();
    };
  }, []);

  if (!loaded && !error) return null;

  return (
    <SessionProvider>
      <StatusBar style="light" />
      <RemoteStartListener />
      {/* Back by swiping right from anywhere on the screen, not only the edge (iOS). */}
      <Stack screenOptions={{ headerShown: false, fullScreenGestureEnabled: true, contentStyle: { backgroundColor: colors.ground } }}>
        {/* The clip screen does its own swipe (between clips; on the first clip, back) and its trim handles drag sideways. */}
        <Stack.Screen name="clip/[id]" options={{ gestureEnabled: false }} />
        {/* Dispositivos: a sheet over the setup screen, closed by swiping down. */}
        <Stack.Screen name="devices" options={{ presentation: 'modal' }} />
      </Stack>
    </SessionProvider>
  );
}
