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
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

/** One open-cross-open of the arms. */
const CYCLE_MS = 900;
/** How far each arm turns in, from the open V to crossed over the head. */
const CROSS_DEG = 38;
/** The shoulders in the 24-unit drawing: each arm turns around its own. */
const LEFT_SHOULDER = { x: 10.6, y: 12.6 };
const RIGHT_SHOULDER = { x: 13.4, y: 12.6 };

const stroke = (color: string, width: number) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

/** 0 with the arms open, 1 crossed: there and back once per loop (`t` from 0 to 1). */
function crossing(t: number): number {
  'worklet';
  return 1 - Math.abs(2 * t - 1);
}

/** The motion marks beside the hands: on while the arms are open, gone while they cross. */
function marks(t: number): number {
  'worklet';
  if (t < 0.25) return 1 - t / 0.25;
  if (t > 0.75) return (t - 0.75) / 0.25;
  return 0;
}

type Props = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  /** Line width in the 24-unit drawing (1.6 for the big figure, 1.8 as an icon, like the other icons). */
  strokeWidth?: number;
};

/**
 * The wave gesture, moving (2026-11-01, option C5): a player whose arms open in a V and cross over the head, again and
 * again, with motion marks beside the hands while they are open. A still picture of raised arms would teach the wrong
 * gesture. With Reduce Motion on it stays open, with the marks.
 */
export function WavingFigure({ size = 96, color = colors.accent, accessibilityLabel, strokeWidth = 1.6 }: Props) {
  const reduce = useReducedMotion();
  const loop = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      loop.set(0);
      return;
    }
    loop.set(0);
    // `ReduceMotion.Never`: the system setting is handled above (it would otherwise play one repeat and stop).
    loop.set(
      withRepeat(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(loop);
  }, [reduce, loop]);

  const k = size / 24;
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${crossing(loop.get()) * CROSS_DEG}deg` }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${-crossing(loop.get()) * CROSS_DEG}deg` }] }));
  const ticks = useAnimatedStyle(() => ({ opacity: marks(loop.get()) }));
  const lines = stroke(color, strokeWidth);

  return (
    <View
      style={{ width: size, height: size }}
      importantForAccessibility={accessibilityLabel !== undefined ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Circle cx={12} cy={9} r={2.3} {...lines} />
        <Path d="M12 11.8v5.2M8.4 22.2l3.6-5.2 3.6 5.2" {...lines} />
      </Svg>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ticks]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M2.6 5.2c-.5-1.2-.4-2.4.3-3.4M21.4 5.2c.5-1.2.4-2.4-.3-3.4" {...lines} />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transformOrigin: [LEFT_SHOULDER.x * k, LEFT_SHOULDER.y * k, 0] }, left]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M10.6 12.6 5.6 3.4" {...lines} />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transformOrigin: [RIGHT_SHOULDER.x * k, RIGHT_SHOULDER.y * k, 0] }, right]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M13.4 12.6l5-9.2" {...lines} />
        </Svg>
      </Animated.View>
    </View>
  );
}
