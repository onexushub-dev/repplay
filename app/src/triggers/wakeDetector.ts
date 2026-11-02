/**
 * The press that wakes the Bluetooth remote (2026-11-01 field tests): the AB Shutter3 drops its Bluetooth link after
 * about 4-5 minutes without a press, to save battery, and a press wakes it. That first press sometimes never reaches
 * the app (it was sent before the link came back), so a play could be lost after a long pause. But an asleep remote
 * only comes back when somebody presses it: the moment iOS shows it connected again, the comeback counts as the
 * press. If the remote's own press gets through too, it counts once: a press right after the comeback is dropped
 * (`WAKE_DEDUP_MS`, the trigger bus's own window), and one right before it means the comeback is not counted.
 *
 * 2026-11-01 field test: waiting 1.5 s for the remote's own press before counting the comeback felt slow. The wait
 * is gone: the dedup window does that job without delaying the save.
 */

/** A press this long before the comeback was seen already counted (the link is looked at every `WAKE_POLL_MS`). */
export const WAKE_LOOKBACK_MS = 2000;
/** After a comeback counted, the remote's own press arriving within this is the same press (the bus's 3 s window). */
export const WAKE_DEDUP_MS = 3000;

export type WakeDetectorOptions = {
  /** The comeback stands for a press. */
  onWake: () => void;
  now: () => number;
  /**
   * Only count a comeback once the remote was seen connected while listening (a recording: a remote switched on in
   * the middle of a game must not save a clip). Off for the connection test, where the first press may be a wake.
   */
  requireSeenConnected: boolean;
};

export type WakeDetector = {
  /** A press was heard (volume or capture event). False: it is the waking press already counted, drop it. */
  press(): boolean;
  /** One look at the link: connected now or not; undefined when unknown (resets, nothing is inferred from it). */
  link(connected: boolean | undefined): void;
};

export function createWakeDetector(o: WakeDetectorOptions): WakeDetector {
  let last: boolean | undefined;
  let seenConnected = false;
  let lastPressAt = -Infinity;
  let lastWakeAt = -Infinity;

  return {
    press() {
      const now = o.now();
      if (now - lastWakeAt < WAKE_DEDUP_MS) return false;
      lastPressAt = now;
      return true;
    },
    link(connected) {
      if (connected === undefined) {
        last = undefined;
        return;
      }
      const cameBack = connected && last === false;
      const allowed = seenConnected || !o.requireSeenConnected;
      if (connected) seenConnected = true;
      last = connected;
      if (cameBack && allowed && o.now() - lastPressAt > WAKE_LOOKBACK_MS) {
        lastWakeAt = o.now();
        o.onWake();
      }
    },
  };
}
