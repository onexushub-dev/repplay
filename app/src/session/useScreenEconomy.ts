import { useCallback, useEffect, useRef, useState } from 'react';

import type { ThermalLevel } from '../../modules/replay-camera/src/ReplayCamera.types';

/** Without a touch for this long while recording, the screen goes dark (thermal spec, item 2). */
export const ECONOMY_IDLE_MS = 20_000;
/** The same once the phone is warm (`fair` or hotter). */
export const ECONOMY_WARM_IDLE_MS = 5_000;

export type ScreenEconomy = {
  /** True while the screen is dark: the preview is off and the brightness is down. */
  asleep: boolean;
  /** A touch: the screen comes back (if it was dark) and the wait starts again. */
  wake: () => void;
};

/**
 * Screen economy while a game is recorded: after a while without a touch the preview goes away, the screen turns
 * black and the brightness goes down (`setNative(true)`); a touch brings it back. The camera, the triggers and the
 * saves keep working. Outside a recording, or when the screen goes away, the brightness is given back.
 */
export function useScreenEconomy(active: boolean, thermal: ThermalLevel, setNative: (on: boolean) => void): ScreenEconomy {
  const [asleep, setAsleep] = useState(false);
  const [touches, setTouches] = useState(0);
  const warm = thermal !== 'nominal';

  // A recording that ends wakes the screen, so the next one starts awake.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setAsleep(false);
  }

  // Every change of the dark state reaches the native side once; leaving gives the brightness back.
  const shown = useRef(false);
  useEffect(() => {
    const dark = active && asleep;
    if (dark === shown.current) return;
    shown.current = dark;
    setNative(dark);
  }, [active, asleep, setNative]);

  useEffect(
    () => () => {
      if (shown.current) setNative(false);
      shown.current = false;
    },
    [setNative],
  );

  useEffect(() => {
    if (!active || asleep) return;
    const timer = setTimeout(() => setAsleep(true), warm ? ECONOMY_WARM_IDLE_MS : ECONOMY_IDLE_MS);
    return () => clearTimeout(timer);
  }, [active, asleep, warm, touches]);

  const wake = useCallback(() => {
    setAsleep(false);
    setTouches((n) => n + 1);
  }, []);

  return { asleep: active && asleep, wake };
}
