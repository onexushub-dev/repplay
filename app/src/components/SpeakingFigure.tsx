import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

/** 1 at `center` of the loop, fading to 0 within `width` on either side. */
function peak(v: number, center: number, width: number): number {
  'worklet';
  return Math.max(0, 1 - Math.abs(v - center) / width);
}

type Props = { size?: number; color?: string; accessibilityLabel?: string };

/**
 * The voice trigger, moving: a microphone with sound waves going out from it, the inner ones first, in a loop. With
 * Reduce Motion on the waves stay drawn, still.
 */
export function SpeakingFigure({ size = 96, color = colors.accent, accessibilityLabel }: Props) {
  const reduce = useReducedMotion();
  const wave = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    wave.set(0);
    wave.set(
      withRepeat(
        withTiming(1, { duration: 1200, easing: Easing.linear, reduceMotion: ReduceMotion.Never }),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(wave);
  }, [reduce, wave]);

  const inner = useAnimatedStyle(() => ({ opacity: reduce ? 1 : peak(wave.get(), 0.3, 0.35) }));
  const outer = useAnimatedStyle(() => ({ opacity: reduce ? 1 : peak(wave.get(), 0.6, 0.35) }));

  return (
    <View
      style={{ width: size, height: size }}
      importantForAccessibility={accessibilityLabel !== undefined ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Rect x={9.6} y={4} width={4.8} height={9.5} rx={2.4} {...stroke(color)} />
        <Path d="M7.4 11.5a4.6 4.6 0 0 0 9.2 0M12 16.1v3.4M9.6 19.5h4.8" {...stroke(color)} />
      </Svg>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, inner]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5.6 6.4a6.6 6.6 0 0 0 0 7.2M18.4 6.4a6.6 6.6 0 0 1 0 7.2" {...stroke(color)} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, outer]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 4.6a9.6 9.6 0 0 0 0 10.8M21 4.6a9.6 9.6 0 0 1 0 10.8" {...stroke(color)} />
        </Svg>
      </Animated.View>
    </View>
  );
}
