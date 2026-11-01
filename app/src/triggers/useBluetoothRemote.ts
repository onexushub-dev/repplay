import { useEffect, useRef } from 'react';

import { bluetoothConnected } from '../../modules/replay-camera';
import { repo } from '../data/mmkv';
import { diag } from '../diag/diagLog'; // TEMP(diag-remote)
import { linkOf } from '../devices/bluetoothRemote';
import { useVolumeRemote } from './useVolumeRemote';
import { createWakeDetector } from './wakeDetector';

/** While listening, how often the remote's link is looked at (to catch the press that wakes it). One cheap call. */
export const WAKE_POLL_MS = 1000;

/**
 * The Bluetooth selfie remote: its presses (useVolumeRemote), plus the press that wakes it from sleep, counted from
 * its link coming back when that press itself is lost (wakeDetector). The link is only known for a BLE remote the app
 * has learnt (devices/bluetoothRemote); otherwise this is useVolumeRemote alone. No message is ever shown for the
 * remote falling asleep: that is normal.
 */
export function useBluetoothRemote(
  enabled: boolean,
  onPress: () => void,
  options: { requireSeenConnected: boolean },
): void {
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);
  const detector = useRef<ReturnType<typeof createWakeDetector> | undefined>(undefined);

  useVolumeRemote(enabled, () => {
    if (detector.current !== undefined) detector.current.press();
    onPressRef.current();
  });

  const { requireSeenConnected } = options;
  useEffect(() => {
    if (!enabled) return;
    const wake = createWakeDetector({
      onWake: () => {
        diag('controle: CLIQUE (acordou: a volta do controle conta como o clique)'); // TEMP(diag-remote)
        onPressRef.current();
      },
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      requireSeenConnected,
    });
    detector.current = wake;
    let active = true;
    let busy = false;
    const look = async () => {
      const knownId = repo.getPrefs().remoteBleId;
      if (knownId === undefined || busy) return;
      busy = true;
      try {
        const link = linkOf(await bluetoothConnected(false), knownId);
        if (active) wake.link(link === 'connected' ? true : link === 'missing' ? false : undefined);
      } catch {
        if (active) wake.link(undefined);
      } finally {
        busy = false;
      }
    };
    void look();
    const timer = setInterval(() => void look(), WAKE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
      wake.stop();
      detector.current = undefined;
    };
  }, [enabled, requireSeenConnected]);
}
