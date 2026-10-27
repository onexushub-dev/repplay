/** The shortest cut a save can make: same as the trigger debounce, so any accepted trigger still yields a clip. */
export const MIN_CUT_MS = 3000;

/**
 * How much of a saved clip is kept as its cut: the clip length the player picked, but never reaching back
 * before `sinceMs`, the moment the previous clip ended (or the recording started). That way two saves close
 * together do not show the same moment twice.
 */
/**
 * What a save copies from the buffer beyond its cut: the buffer is kept in 1 s segments, so the copy can start up to
 * a second earlier than asked, and the rest is room for the editor's black-start check. Anything older than the cut
 * is never shown (the clip's `bounds` stop the editor there), so copying the whole buffer only filled the phone.
 */
export const KEEP_MARGIN_MS = 2000;

/** How much of the buffer a save of `cutMs` keeps in its file. */
export function keepMsFor(cutMs: number): number {
  return cutMs + KEEP_MARGIN_MS;
}

export function cutMsFor(clipSeconds: number, atMs: number, sinceMs: number): number {
  const sinceLast = atMs - sinceMs;
  return Math.max(MIN_CUT_MS, Math.min(clipSeconds * 1000, sinceLast));
}
