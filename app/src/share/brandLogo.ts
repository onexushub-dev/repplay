import { Image, type ImageSourcePropType } from 'react-native';

/**
 * The mark every exported clip carries. To change the brand image, replace this file (or point `BRAND_LOGO` at
 * another one): the overlay reads its proportions from the image itself.
 */
export const BRAND_LOGO: ImageSourcePropType = require('../../assets/images/brand/revi-logo.png');

/** Used only when the image size cannot be read (tests, a source without dimensions). */
const FALLBACK_ASPECT = 6;

/** Width divided by height of the logo image. */
export function logoAspect(source: ImageSourcePropType = BRAND_LOGO): number {
  const resolved = Image.resolveAssetSource(source);
  if (resolved && typeof resolved.width === 'number' && typeof resolved.height === 'number') {
    if (resolved.width > 0 && resolved.height > 0) return resolved.width / resolved.height;
  }
  return FALLBACK_ASPECT;
}

/** How long an export waits for the logo before capturing anyway. */
export const LOGO_WAIT_MS = 1500;

/**
 * Makes sure the logo is in the image cache before the overlay is captured to PNG: an image that is still loading
 * would leave the export without the mark. Never rejects and never waits longer than `LOGO_WAIT_MS`.
 */
export async function preloadLogo(source: ImageSourcePropType = BRAND_LOGO): Promise<void> {
  const resolved = Image.resolveAssetSource(source);
  if (!resolved || typeof resolved.uri !== 'string' || typeof Image.prefetch !== 'function') return;
  const wait = new Promise<void>((done) => setTimeout(done, LOGO_WAIT_MS));
  const load = Image.prefetch(resolved.uri).then(
    () => undefined,
    () => undefined,
  );
  await Promise.race([load, wait]);
}
