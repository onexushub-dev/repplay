import type { Clip } from '../data/schema';
import type { Plan } from '../payments/types';
import { cropRect, readEdit } from './editing';

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
 * Free: 720x1280 and no sound (the clip may have both: they are locked here, so a recording already made can be
 * unlocked later), paid (a paid plan, pass, pro): 1080x1920 with its sound. A landscape clip gets the same frame turned on
 * its side, so it fills the screen when the phone is held sideways, like any video in Photos. Every export carries the
 * app mark, in both plans. Any speed other than 1x plays without sound. Modo Foco applies when on, ready, not turned
 * and not zoomed by hand. It is a paid edit: a free export never follows.
 */
export function exportOptions(
  tier: Tier,
  edit: Clip['edit'],
  trim: Clip['trim'],
  landscape = false,
  focus?: { path: string; ready: boolean },
): ExportOptions {
  const paid = tier !== 'free';
  const short = paid ? 1080 : 720;
  const long = paid ? 1920 : 1280;
  const { speed, muted, zoom, rotation, focus: focusOn } = readEdit(edit);
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
    watermark: true,
    ...(follow ? { focus: { path: focus.path, aspect: landscape ? ('landscape' as const) : ('portrait' as const) } } : {}),
  };
}
