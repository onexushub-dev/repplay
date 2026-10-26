import { File } from 'expo-file-system';

/** Where a clip's Modo Foco framing is kept: next to it, same name, .focus.json. Written by the native analysis. */
export function focusPath(clipPath: string): string {
  return clipPath.replace(/\.[^./]+$/, '') + '.focus.json';
}

export type FocusAspect = 'landscape' | 'portrait';

/** One crop rect `[x, y, width, height]` (0..1 of the video, origin top-left) every `stepMs` from `startMs` (clip time). */
export type FocusTrack = { startMs: number; stepMs: number; rects: [number, number, number, number][] };

function isRow(row: unknown): row is [number, number, number, number] {
  return Array.isArray(row) && row.length === 4 && row.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** What a v2 framing follows. A v1 file always follows the players. */
export type FocusFollow = 'ball' | 'players';

/** About a focus file, for the Foco panel: `hasBall` = a ball-led file with both framings (the `Seguir` control). */
export type FocusInfo = { v: 1 | 2; follow: FocusFollow; hasBall: boolean };

function isRows(rows: unknown): rows is [number, number, number, number][] {
  return Array.isArray(rows) && rows.length > 0 && rows.every(isRow);
}

function asFile(text: string): Record<string, unknown> | undefined {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof file !== 'object' || file === null) return undefined;
  const f = file as Record<string, unknown>;
  if (f.v !== 1 && f.v !== 2) return undefined;
  if (typeof f.stepMs !== 'number' || f.stepMs <= 0 || typeof f.startMs !== 'number') return undefined;
  return f;
}

/** The shape the clip was recorded in (the one whose framing zooms), from the file's `size`. */
function mainAspect(f: Record<string, unknown>): FocusAspect | undefined {
  const size = f.size;
  if (!Array.isArray(size) || size.length !== 2 || typeof size[0] !== 'number' || typeof size[1] !== 'number') {
    return undefined;
  }
  return size[0] >= size[1] ? 'landscape' : 'portrait';
}

function hasBallTrack(f: Record<string, unknown>): boolean {
  const ball = f.ball;
  if (f.v !== 2 || f.follow !== 'ball' || !Array.isArray(ball) || !isRows(f.players)) return false;
  // Rows [x, y, state, conf]; state 0 = seen, 1 = predicted.
  return ball.some((row) => Array.isArray(row) && (row[2] === 0 || row[2] === 1));
}

/**
 * The track of `aspect` in a focus file's text (v1 or v2); anything broken, another version or an empty track gives
 * undefined. `follow: 'players'` on a ball-led v2 file reads its players framing for the recorded shape; anything else
 * reads the file's own framing.
 */
export function parseFocusFile(text: string, aspect: FocusAspect, follow?: FocusFollow): FocusTrack | undefined {
  const f = asFile(text);
  if (!f || typeof f.stepMs !== 'number' || typeof f.startMs !== 'number') return undefined;
  let rows = f[aspect];
  if (follow === 'players' && f.v === 2 && f.follow === 'ball' && aspect === mainAspect(f) && isRows(f.players)) {
    rows = f.players;
  }
  if (!isRows(rows)) return undefined;
  return { startMs: f.startMs, stepMs: f.stepMs, rects: rows };
}

/** Version, what the file follows and whether `Seguir` can switch it; undefined for a broken file. */
export function parseFocusInfo(text: string): FocusInfo | undefined {
  const f = asFile(text);
  if (!f) return undefined;
  const v = f.v === 2 ? 2 : 1;
  return { v, follow: v === 2 && f.follow === 'ball' ? 'ball' : 'players', hasBall: hasBallTrack(f) };
}

function readText(path: string): string | undefined {
  try {
    return new File(`file://${path}`).textSync();
  } catch {
    return undefined;
  }
}

/** Reads the file at `path` (a plain path); undefined when it is missing or unreadable. */
export function readFocusFile(path: string, aspect: FocusAspect, follow?: FocusFollow): FocusTrack | undefined {
  const text = readText(path);
  return text === undefined ? undefined : parseFocusFile(text, aspect, follow);
}

export function readFocusInfo(path: string): FocusInfo | undefined {
  const text = readText(path);
  return text === undefined ? undefined : parseFocusInfo(text);
}
