import { useEffect, useSyncExternalStore } from 'react';

import { bluetoothConnected } from '../../modules/replay-camera';
import type { BluetoothConnected } from '../../modules/replay-camera/src/ReplayCamera.types';
import { repo } from '../data/mmkv';

/**
 * The Bluetooth selfie remote's link as iOS shows it (2026-11-01 field test: the AB Shutter3 is BLE and iOS returns it
 * while it is connected, under the Battery and Device Information services). The app learns which device is the
 * remote at a press, then follows it without one:
 * - `connected`: iOS holds it connected now;
 * - `missing`: it is not connected (switched off, out of range, asleep, or unpaired in Ajustes);
 * - `bluetoothOff`: the iPhone's Bluetooth is off;
 * - undefined: unknown (no remote learnt, a classic-Bluetooth remote, no permission, Android): only presses tell.
 */
export type RemoteLink = 'connected' | 'missing' | 'bluetoothOff' | undefined;

/** How often the screens that show the remote look again. One cheap system call. */
export const POLL_MS = 2500;

type Device = BluetoothConnected['devices'][number];

/** The connected devices that could be a selfie remote: they offer Battery or HID (AirPods only show Device Information). */
export function remoteCandidates(devices: Device[]): Device[] {
  return devices.filter((d) => d.services.includes('battery') || d.services.includes('hid'));
}

/** The link of the remote learnt as `knownId`, from one look at the connected devices. */
export function linkOf(result: BluetoothConnected | undefined, knownId: string | undefined): RemoteLink {
  if (result === undefined || knownId === undefined) return undefined;
  if (result.state === 'off') return 'bluetoothOff';
  if (result.state !== 'on') return undefined;
  return result.devices.some((d) => d.id === knownId) ? 'connected' : 'missing';
}

let link: RemoteLink;
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function setLink(next: RemoteLink): void {
  if (next === link) return;
  link = next;
  listeners.forEach((fn) => fn());
}

/** One look, never asking for Bluetooth (it was granted when the remote was learnt). */
async function look(): Promise<void> {
  const knownId = repo.getPrefs().remoteBleId;
  if (knownId === undefined) return setLink(undefined);
  try {
    setLink(linkOf(await bluetoothConnected(false), knownId));
  } catch {
    setLink(undefined);
  }
}

/**
 * A press was heard: learn which device is the remote when exactly one connected device could be it (asking for
 * Bluetooth the first time; the player is using the remote right now). Several candidates: nothing is guessed.
 */
export async function learnRemoteAtPress(): Promise<void> {
  try {
    const result = await bluetoothConnected(true);
    if (result === undefined || result.state !== 'on') return;
    const candidates = remoteCandidates(result.devices);
    const known = repo.getPrefs().remoteBleId;
    if (known !== undefined && result.devices.some((d) => d.id === known)) {
      setLink('connected');
      return;
    }
    if (candidates.length !== 1) return;
    const [remote] = candidates;
    repo.setPrefs({ remoteBleId: remote.id, remoteBleName: remote.name === '' ? undefined : remote.name });
    setLink('connected');
  } catch {
    // the press still counts: only the link stays unknown
  }
}

/** "Esquecer o controle": the app no longer knows which device it is. */
export function forgetRemoteLink(): void {
  repo.setPrefs({ remoteBleId: undefined, remoteBleName: undefined });
  setLink(undefined);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The remote's link, looked at every `POLL_MS` while `active` (any screen showing it; the looks are shared). */
export function useRemoteLink(active: boolean): RemoteLink {
  useEffect(() => {
    if (!active) return;
    users += 1;
    if (users === 1) {
      void look();
      timer = setInterval(() => void look(), POLL_MS);
    }
    return () => {
      users -= 1;
      if (users === 0 && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, [active]);
  return useSyncExternalStore(subscribe, () => link);
}

/** Tests only. */
export function resetRemoteLinkForTests(): void {
  link = undefined;
  users = 0;
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
  listeners.clear();
}
