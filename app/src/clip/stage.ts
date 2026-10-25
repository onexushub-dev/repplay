import type { Clip } from '../data/schema';
import type { FocusTrack } from '../data/focusFile';
import { framingAt } from '../focus/framing';
import { NO_ZOOM, readEdit, turnedSize, type Zoom } from '../share/editing';
import { exportOptions } from '../share/exportOptions';
import { frameLayout } from '../share/layout';

type Tier = Parameters<typeof exportOptions>[0];
type Size = { width: number; height: number };

/**
 * The frame a clip is previewed (and exported) in, and where its video sits in it. The open clip and the stills of its
 * neighbours use this same reckoning, so that a swipe lands on exactly the picture that was sliding in.
 */
export function clipStage(tier: Tier, edit: Clip['edit'], trim: Clip['trim'], videoSize: Size, focusReady: string | false | undefined) {
  // The shape after the player's own turn; the clip's own rotation is already in the thumbnail's shape.
  const shape = turnedSize(videoSize, readEdit(edit).rotation);
  // A landscape clip is exported (and previewed) in a landscape frame; a vertical one in a vertical frame.
  const landscape = shape.width > shape.height;
  const options = exportOptions(tier, edit, trim, landscape, focusReady ? { path: focusReady, ready: true } : undefined);
  const frame = { width: options.width, height: options.height };
  return { shape, landscape, frame, watermark: options.watermark, layout: frameLayout(shape, frame) };
}

/** The frame as large as `area` allows (full width at most), and the video's box inside it, in screen points. */
export function previewBox(frame: Size, layout: ReturnType<typeof frameLayout>, area: Size) {
  const height = Math.min(area.height, (area.width * frame.height) / frame.width);
  const scale = height / frame.height;
  return {
    width: frame.width * scale,
    height,
    scale,
    video: {
      left: layout.video.x * scale,
      top: layout.video.y * scale,
      width: layout.video.width * scale,
      height: layout.video.height * scale,
    },
  };
}

/**
 * The picture at the clip's first frame: a zoom by hand, else Modo Foco's framing at the start of the cut (when on, ready
 * and not turned), else the whole video. The same rule the open clip follows.
 */
export function openingZoom(edit: Clip['edit'], track: FocusTrack | undefined, startMs: number): Zoom {
  const { zoom, rotation, focus } = readEdit(edit);
  if (zoom !== undefined && zoom.scale > 1) return zoom;
  if (track && focus && rotation === 0) return framingAt(track, startMs);
  return NO_ZOOM;
}

/** Moves `zoom`'s centre to the middle of a box this size, enlarged by its scale. */
export function pictureTransform(zoom: Zoom, box: Size) {
  return [
    { translateX: (0.5 - zoom.cx) * box.width * zoom.scale },
    { translateY: (0.5 - zoom.cy) * box.height * zoom.scale },
    { scale: zoom.scale },
  ];
}

/** The video laid out at its own shape in the middle of `box`, then turned, so that it fills `box` after the turn. */
export function turned(box: Size, rotation: number) {
  const sideways = rotation % 180 !== 0;
  const width = sideways ? box.height : box.width;
  const height = sideways ? box.width : box.height;
  return {
    position: 'absolute' as const,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    width,
    height,
    transform: [{ rotate: `${rotation}deg` }],
  };
}
