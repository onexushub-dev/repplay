import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';

import { diag } from '../diag/diagLog'; // TEMP(diag-remote): every diag() call in this file

/** Where the volume is parked: room above and below, so any remote press changes it. */
const PARK = 0.5;
const TOLERANCE = 0.01;
/** Volume events this soon after our own setVolume are its echo (Android reports a rounded step). */
const ECHO_MS = 300;
/**
 * After the hook starts, or the app comes back to the front, volume changes are the system's, not a press: the screen
 * that stops listening puts the phone's volume back, and iOS moves it when the camera's audio restarts. They are adopted
 * as the parked level instead of saving a clip.
 */
export const ARM_MS = 1500;

/**
 * Bluetooth selfie remotes press "volume up". While enabled, each volume change counts as one press;
 * the volume is parked back at a fixed level (and the system HUD hidden) so the next press registers too.
 * The phone's own volume is restored when the hook stops.
 */
export function useVolumeRemote(enabled: boolean, onPress: () => void): void {
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let original: number | undefined;
    let parked = PARK;
    let lastOwnSet = -Infinity;
    let armedAt = Date.now() + ARM_MS;

    const setOwn = async (volume: number) => {
      lastOwnSet = Date.now();
      await VolumeManager.setVolume(volume, { showUI: false, playSound: false });
    };

    // Park, then adopt the level the OS actually set (volume comes in steps on Android).
    const park = async () => {
      await setOwn(parked);
      const { volume } = await VolumeManager.getVolume();
      parked = volume;
    };

    const listener = VolumeManager.addVolumeListener(({ volume }) => {
      if (!active) return;
      const level = volume.toFixed(2);
      const away = AppState.currentState === 'background' || AppState.currentState === 'inactive';
      if (Date.now() < armedAt || away) {
        diag(`controle: volume ${level} ignorado (${away ? 'app fora da tela' : 'armando'})`);
        parked = volume;
        return;
      }
      const echo = Date.now() - lastOwnSet < ECHO_MS || Math.abs(volume - parked) < TOLERANCE;
      if (echo) return;
      diag(`controle: CLIQUE (volume ${level})`);
      onPressRef.current();
      park().catch(() => diag('controle: FALHOU ao devolver o volume'));
    });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') armedAt = Date.now() + ARM_MS;
    });

    diag('controle: escutando');
    VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {});
    VolumeManager.getVolume()
      .then(({ volume }) => {
        original = volume;
        // At the top or bottom a press can't move the volume, so park in the middle.
        parked = volume > 1 - 0.1 || volume < 0.1 ? PARK : volume;
        return active ? park() : undefined;
      })
      .catch(() => {});

    return () => {
      diag('controle: parou de escutar');
      active = false;
      listener.remove();
      appState.remove();
      VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => {});
      if (original !== undefined) setOwn(original).catch(() => {});
    };
  }, [enabled]);
}
