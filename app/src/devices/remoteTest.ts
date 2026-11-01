/**
 * What the app knows about the Bluetooth remote. iOS never says whether it is switched on, so the only proof of life
 * is a press: "connected" means one was heard recently, and it fades when none follows. The setup screen stays mounted
 * (and unfocused) under the Dispositivos sheet, so both read the same answer from here.
 */
type Listener = () => void;

/** How long a press keeps the remote shown as connected. */
export const CONNECTED_MS = 120_000;

let lastPressAt: number | undefined;
let sheetOpen = false;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((fn) => fn());

export function hasRemotePress(now: number = Date.now()): boolean {
  return lastPressAt !== undefined && now - lastPressAt < CONNECTED_MS;
}

/** Milliseconds until the last press stops counting, or undefined when nothing is counting now. */
export function remotePressExpiresIn(now: number = Date.now()): number | undefined {
  return hasRemotePress(now) && lastPressAt !== undefined ? lastPressAt + CONNECTED_MS - now : undefined;
}

export function markRemotePress(now: number = Date.now()): void {
  lastPressAt = now;
  notify();
}

export function clearRemotePress(): void {
  lastPressAt = undefined;
  notify();
}

/** If the sheet asked for by `openingRemoteSheet` has not shown up by then, the setup lets the camera go as usual. */
export const OPENING_GRACE_MS = 3000;
let openingTimer: ReturnType<typeof setTimeout> | undefined;

/** The Dispositivos sheet is in front: the setup screen keeps listening to the remote for it. */
export function setRemoteSheetOpen(open: boolean): void {
  if (openingTimer !== undefined) clearTimeout(openingTimer);
  openingTimer = undefined;
  sheetOpen = open;
  notify();
}

/**
 * Call right before opening the Dispositivos sheet. The setup screen loses focus as the sheet starts to open, before
 * the sheet itself says it is in front: without this the camera under it was stopped and reopened, which took 8-10 s
 * (2026-11-01 field test) and left presses going to the ringer volume meanwhile.
 */
export function openingRemoteSheet(): void {
  setRemoteSheetOpen(true);
  openingTimer = setTimeout(() => {
    openingTimer = undefined;
    sheetOpen = false;
    notify();
  }, OPENING_GRACE_MS);
}

export function isRemoteSheetOpen(): boolean {
  return sheetOpen;
}

export function subscribeRemotePress(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
