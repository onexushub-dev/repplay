/**
 * The press that wakes the Bluetooth remote (2026-11-01 field tests): the AB Shutter3 drops its Bluetooth link after
 * about 4-5 minutes without a press, to save battery, and a press wakes it. That first press sometimes never reaches
 * the app (it was sent before the link came back), so a play could be lost after a long pause. But an asleep remote
 * only comes back when somebody presses it: when iOS shows it connected again and no press arrives within `graceMs`,
 * the comeback itself counts as the press. When the press does arrive, it counts once.
 */

/** How long after the remote comes back its own press may still arrive. */
export const WAKE_GRACE_MS = 1500;
/** A press this long before the comeback was seen already counted (the link is looked at once a second). */
export const WAKE_LOOKBACK_MS = 4000;

export type WakeDetectorOptions = {
  /** The comeback stands for a press. */
  onWake: () => void;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /**
   * Only count a comeback once the remote was seen connected while listening (a recording: a remote switched on in
   * the middle of a game must not save a clip). Off for the connection test, where the first press may be a wake.
   */
  requireSeenConnected: boolean;
};

export type WakeDetector = {
  /** A press was heard (volume or capture event). */
  press(): void;
  /** One look at the link: connected now or not; undefined when unknown (resets, nothing is inferred from it). */
  link(connected: boolean | undefined): void;
  stop(): void;
};

export function createWakeDetector(o: WakeDetectorOptions): WakeDetector {
  let last: boolean | undefined;
  let seenConnected = false;
  let lastPressAt = -Infinity;
  let pending: unknown;

  const cancel = () => {
    if (pending !== undefined) o.clearTimeout(pending);
    pending = undefined;
  };

  return {
    press() {
      lastPressAt = o.now();
      cancel();
    },
    link(connected) {
      if (connected === undefined) {
        last = undefined;
        return;
      }
      const cameBack = connected && last === false;
      const allowed = seenConnected || !o.requireSeenConnected;
      if (cameBack && allowed && o.now() - lastPressAt > WAKE_LOOKBACK_MS) {
        cancel();
        // A press within the grace cancels it (`press`): the remote's own press got through.
        pending = o.setTimeout(() => {
          pending = undefined;
          o.onWake();
        }, WAKE_GRACE_MS);
      }
      if (connected) seenConnected = true;
      last = connected;
    },
    stop() {
      cancel();
    },
  };
}
