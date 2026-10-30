import { type ComponentRef, forwardRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme/tokens';
import { BRAND_LOGO, logoAspect } from './brandLogo';
import type { Rect as Box } from './layout';

/** Height of the dark gradient at the bottom of the video, so the mark reads on any video, capped at this share of the video height so a landscape clip is not mostly shadow. */
export const SAFE_BOTTOM = 340;
const GRADIENT_MAX = SAFE_BOTTOM + 520;
const GRADIENT_SHARE = 0.6;
/** The logo is this share of the frame's short side, so it reads the same in a 720 and in a 1080 export, vertical or landscape. */
export const LOGO_SHARE = 0.272;
/** Room around the logo inside the dark pill, as a share of the frame's short side. */
const PAD_X = 0.021;
const PAD_Y = 0.011;
/** Where the pill sits: the same distance from the right and from the bottom edge of the video image, as a share of the frame's short side (about 32 px in a 720 frame). */
const MARK_MARGIN = 0.045;

type Props = {
  frame: { width: number; height: number };
  layout: { video: Box; top: Box; bottom: Box };
  /** Screen points per frame pixel: 1/PixelRatio for the capture, smaller for the on-screen preview. */
  scale: number;
  /** Draw the "made with" mark. Free exports carry it; paid ones (pass, pro) do not. Bands and layout are unchanged. */
  watermark?: boolean;
};

/**
 * What every exported clip carries: dark bands where the video leaves room (landscape), a soft gradient
 * and the app logo in the video's bottom-right corner, so whoever sees a shared clip knows which app made it. The same component draws the
 * preview and, captured to PNG, the export overlay.
 */
export const ShareOverlay = forwardRef<ComponentRef<typeof View>, Props>(function ShareOverlay(
  { frame, layout, scale, watermark = true },
  ref,
) {
  const s = (n: number) => n * scale;
  const unit = Math.min(frame.width, frame.height);
  // The mark and the gradient belong to the video image, so they follow its corner whatever its shape
  // (a landscape clip sits in the middle of the frame, with bands above and below).
  const videoRight = layout.video.x + layout.video.width;
  const videoBottom = layout.video.y + layout.video.height;
  const gradientHeight = Math.min(GRADIENT_MAX, layout.video.height * GRADIENT_SHARE);
  const box = (r: Box) => ({
    position: 'absolute' as const,
    left: s(r.x),
    top: s(r.y),
    width: s(r.width),
    height: s(r.height),
  });

  return (
    <View ref={ref} collapsable={false} style={{ width: s(frame.width), height: s(frame.height) }}>
      {layout.top.height > 0 ? <View style={[box(layout.top), styles.band]} /> : null}
      {layout.bottom.height > 0 ? <View style={[box(layout.bottom), styles.band]} /> : null}
      <View testID="share-video-area" style={box(layout.video)} />

      <Svg width={s(frame.width)} height={s(frame.height)} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.75} />
          </LinearGradient>
        </Defs>
        <Rect
          x={s(layout.video.x)}
          y={s(videoBottom - gradientHeight)}
          width={s(layout.video.width)}
          height={s(gradientHeight)}
          fill="url(#bottom)"
        />
      </Svg>

      {watermark ? (
        <View
          style={[
            styles.mark,
            {
              bottom: s(frame.height - videoBottom + unit * MARK_MARGIN),
              right: s(frame.width - videoRight + unit * MARK_MARGIN),
              paddingHorizontal: s(unit * PAD_X),
              paddingVertical: s(unit * PAD_Y),
            },
          ]}>
          <Image
            accessibilityLabel="Revi"
            fadeDuration={0}
            resizeMode="contain"
            source={BRAND_LOGO}
            style={{ width: s(unit * LOGO_SHARE), height: s(unit * LOGO_SHARE) / logoAspect() }}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  band: { backgroundColor: colors.ground },
  mark: { position: 'absolute', backgroundColor: 'rgba(15,15,15,0.8)', borderRadius: 999 },
});
