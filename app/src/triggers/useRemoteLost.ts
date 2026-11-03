import { useEffect, useState } from 'react';

import type { RemoteLink } from '../devices/bluetoothRemote';

/**
 * How long the remote must be gone before the recording screen says so. A walk out of range and back is shorter; the
 * 2026-11-03 field test showed iOS itself giving up on the remote after a while out of range, and then only switching
 * the remote off and on brings it back: until then every press is lost, and nothing on the screen told the player.
 */
export const REMOTE_LOST_MS = 30_000;

/**
 * True while `active` (a game) once the remote, seen connected in this game, has been gone for `REMOTE_LOST_MS`
 * (out of range, iOS gave up, or asleep: pressing a button or switching it off and on brings it back). A remote never
 * seen connected in the game is not being used: never reported. An unknown look keeps what was known.
 */
export function useRemoteLost(link: RemoteLink, active: boolean): boolean {
  // The last known link (an unknown look keeps it), whether the remote was seen connected in this game, and which
  // stretch of absence this is: each new one restarts the wait, and only the timer sets `lostEpisode`.
  const [known, setKnown] = useState<'connected' | 'missing' | undefined>(undefined);
  const [seen, setSeen] = useState(false);
  const [episode, setEpisode] = useState(0);
  const [lostEpisode, setLostEpisode] = useState(-1);

  if (!active) {
    if (known !== undefined) setKnown(undefined);
    if (seen) setSeen(false);
  } else {
    const next = link === 'connected' || link === 'missing' ? link : known;
    if (next !== known) {
      setKnown(next);
      if (next === 'connected') setSeen(true);
      if (next === 'missing' && seen) setEpisode((n) => n + 1);
    }
  }

  const gone = active && seen && known === 'missing';
  useEffect(() => {
    if (!gone) return;
    const timer = setTimeout(() => setLostEpisode(episode), REMOTE_LOST_MS);
    return () => clearTimeout(timer);
  }, [gone, episode]);

  return gone && lostEpisode === episode;
}
