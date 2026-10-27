import type { Clip } from '../data/schema';
import type { Plan } from '../payments/types';
import { cropRect, readEdit } from './editing';
import { type ShortSide, sideSize } from './exportSize';

export type ExportOptions = {
  width: number;
  height: number;
  startMs: number;
  endMs: number;
  speed: number;
  muted: boolean;
  /** The visible part of the video (0..1 of its size) when the player zoomed in; absent = the whole video. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Extra clockwise turn on top of the one stored in the clip. */
  rotation: 0 | 90 | 180 | 270;
  watermark: boolean;
  /** Modo Foco: the framing file and the track of the clip's shape; absent = no moving framing. */
  focus?: { path: string; aspect: 'landscape' | 'portrait' };
};

/** Legacy tier names still accepted until the export takes only a `Plan`. */
type Tier = Plan | 'pass' | 'pro';

/**
 * Both plans export 1080x1920. Free: no sound (the clip may have it: it is locked here, so a recording already made can
 * be unlocked later), speed always 1x, no Modo Foco, and the app mark. Paid (a paid plan, pass, pro): its sound, any
 * speed, Modo Foco, no app mark. A landscape clip gets the same frame turned on its side, so it fills the screen when
 * the phone is held sideways, like any video in Photos. Any speed other than 1x plays without sound. Modo Foco applies
 * when on, ready, not turned and not zoomed by hand.
 */
/**
 * For now every clip carries the Repplay mark, on every plan (decided 2026-10-27; which plans drop it comes later).
 * false brings back the rule: free with the mark, paid without.
 */
export const WATERMARK_ON_EVERY_PLAN = true as boolean;

export function exportOptions(
  tier: Tier,
  edit: Clip['edit'],
  trim: Clip['trim'],
  landscape = false,
  focus?: { path: string; ready: boolean },
  /** The export's resolution (short side): Full HD unless a 4K clip is exported as 4K or 2K. */
  side: ShortSide = 1080,
): ExportOptions {
  const paid = tier !== 'free';
  const { width: frameWidth, height: frameHeight } = sideSize(side, true);
  const short = frameHeight;
  const long = frameWidth;
  const { speed: chosenSpeed, muted, zoom, rotation, focus: focusOn } = readEdit(edit);
  const speed = paid ? chosenSpeed : 1;
  const manualZoom = zoom !== undefined && zoom.scale > 1;
  const follow = paid && focus !== undefined && focus.ready && focusOn && rotation === 0 && !manualZoom;
  return {
    width: landscape ? long : short,
    height: landscape ? short : long,
    startMs: trim.startMs,
    endMs: trim.endMs,
    speed,
    muted: muted || speed !== 1 || !paid,
    crop: zoom && zoom.scale > 1 ? cropRect(zoom) : undefined,
    rotation,
    watermark: WATERMARK_ON_EVERY_PLAN || !paid,
    ...(follow ? { focus: { path: focus.path, aspect: landscape ? ('landscape' as const) : ('portrait' as const) } } : {}),
  };
}

/** What a free export drops from this clip: the framing, the speed, the sound (only what the clip actually had). */
export type FreeLosses = { focus: boolean; speed: boolean; sound: boolean };

export function freeLosses(clip: Pick<Clip, 'edit' | 'focus'>): FreeLosses {
  const { focus, rotation, zoom, speed, muted } = readEdit(clip.edit);
  return {
    focus: clip.focus !== undefined && clip.focus.status === 'ready' && focus && rotation === 0 && !(zoom !== undefined && zoom.scale > 1),
    speed: speed !== 1,
    // Away from 1x the video is silent anyway, so there is no sound to lose.
    sound: !muted && speed === 1,
  };
}
