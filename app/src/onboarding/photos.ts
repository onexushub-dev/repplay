import type { ImageSourcePropType } from 'react-native';

/** A photo, its size in pixels and the point of it (0 to 1 of each side) that should stay in view when it is cropped. */
export type PhotoSpec = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  focus: { x: number; y: number };
};

// Placeholders: replace the files (and keep the sizes and focus points in step) with the team's own footage.
export const PHOTOS = {
  camera: { source: require('../../assets/images/onboarding/camera.jpg'), width: 1200, height: 1800, focus: { x: 0.5, y: 0.5 } },
  play: { source: require('../../assets/images/onboarding/lance.jpg'), width: 1200, height: 1800, focus: { x: 0.5, y: 0.45 } },
  focus: { source: require('../../assets/images/onboarding/foco.jpg'), width: 900, height: 1200, focus: { x: 0.55, y: 0.5 } },
} satisfies Record<string, PhotoSpec>;

export type Placement = { width: number; height: number; left: number; top: number };

/**
 * Where to draw a photo so it covers a box of `boxW` by `boxH` with the `focus` point as close to the middle as the
 * edges allow. (`resizeMode="cover"` always centers, which crops a tall photo in a wide box to its middle.)
 */
export function coverPlacement(photo: Pick<PhotoSpec, 'width' | 'height'>, focus: { x: number; y: number }, boxW: number, boxH: number): Placement {
  const scale = Math.max(boxW / photo.width, boxH / photo.height);
  const width = photo.width * scale;
  const height = photo.height * scale;
  const clamp = (offset: number, spare: number) => Math.min(0, Math.max(-spare, offset));
  return {
    width,
    height,
    left: clamp(boxW / 2 - focus.x * width, width - boxW),
    top: clamp(boxH / 2 - focus.y * height, height - boxH),
  };
}
