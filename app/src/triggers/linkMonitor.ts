/**
 * The Bluetooth remote's link, followed for the diagnostic log only: a comeback never counts as a press.
 *
 * History: on 2026-11-01 a comeback counted as the press that woke the remote (the AB Shutter3 drops its link after
 * 4-5 idle minutes, and its waking press sometimes never reaches the app). On the 2026-11-02 society field test
 * (another remote, "selfie") an AWAKE remote dropped and regained its link whenever the player walked out of range and
 * back, sometimes every couple of seconds at the edge of range: 66 of 67 comebacks came less than 3 minutes after a
 * press, and they saved clips nobody pressed for. The decision (2026-11-03): no comeback ever saves a clip, whatever
 * the remote. Only the remote's own presses do; after a long pause the first press may only wake the remote, and the
 * player presses again.
 */

export type LinkEvent =
  | { kind: 'dropped'; idleMs: number }
  | {
      kind: 'back';
      /** How long the link was gone (undefined: never seen connected before, e.g. asleep from the start). */
      awayMs: number | undefined;
      /** How long after the last press (or the start of listening) it dropped. */
      idleAtDropMs: number | undefined;
    };

export type LinkMonitor = {
  /** A press was heard (the idle time starts again). */
  press(): void;
  /** One look at the link: connected now or not; undefined when unknown (forgets a pending drop). */
  link(connected: boolean | undefined): void;
};

export function createLinkMonitor(o: { now: () => number; onLink: (event: LinkEvent) => void }): LinkMonitor {
  let last: boolean | undefined;
  let lastPressAt = o.now();
  let droppedAt: number | undefined;
  let idleAtDrop: number | undefined;

  return {
    press() {
      lastPressAt = o.now();
    },
    link(connected) {
      if (connected === undefined) {
        last = undefined;
        droppedAt = undefined;
        idleAtDrop = undefined;
        return;
      }
      const now = o.now();
      if (!connected && last === true) {
        droppedAt = now;
        idleAtDrop = now - lastPressAt;
        o.onLink({ kind: 'dropped', idleMs: idleAtDrop });
      } else if (connected && last === false) {
        o.onLink({ kind: 'back', awayMs: droppedAt === undefined ? undefined : now - droppedAt, idleAtDropMs: idleAtDrop });
        droppedAt = undefined;
        idleAtDrop = undefined;
      }
      last = connected;
    },
  };
}
