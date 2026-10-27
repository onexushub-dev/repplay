/** A video's resolution by its short side in pixels. */
export type ShortSide = 1080 | 1440 | 2160;

/** The export choices, largest first. */
export const EXPORT_SIDES: readonly ShortSide[] = [2160, 1440, 1080];

const NAMES: Record<ShortSide, string> = { 2160: '4K', 1440: '2K', 1080: 'Full HD' };

/**
 * Bit rates assumed for the iOS "highest quality" H.264 export at 30 fps, in Mbit/s, for the size estimate only.
 * Rough figures: calibrate them against real exports when a phone test gives the file sizes.
 */
const VIDEO_MBPS: Record<ShortSide, number> = { 2160: 40, 1440: 18, 1080: 10 };
const AUDIO_MBPS = 0.128;

export function sideName(side: ShortSide): string {
  return NAMES[side];
}

/** Width × height of an export of `side` in the frame's orientation (16:9). */
export function sideSize(side: ShortSide, landscape: boolean): { width: number; height: number } {
  const long = Math.round((side * 16) / 9);
  return landscape ? { width: long, height: side } : { width: side, height: long };
}

/** What a clip of this resolution can be exported as: every size up to its own; Full HD alone below 4K. */
export function exportChoices(clipShortSide: number | undefined): ShortSide[] {
  const own = clipShortSide !== undefined ? clipShortSide : 1080;
  return own >= 2160 ? [...EXPORT_SIDES] : [1080];
}

/** Rough size in megabytes of an export `durationMs` long (after the speed change), with or without sound. */
export function estimateMegabytes(side: ShortSide, durationMs: number, sound: boolean): number {
  const mbps = VIDEO_MBPS[side] + (sound ? AUDIO_MBPS : 0);
  return Math.max(1, Math.round(((mbps / 8) * Math.max(durationMs, 0)) / 1000));
}
