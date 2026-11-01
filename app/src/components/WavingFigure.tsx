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

/** How far each arm swings to either side, and how long one side-to-side takes. */
const SWING_DEG = 24;
const HALF_MS = 420;
/** The shoulders in the 24-unit drawing: each arm turns around its own. */
const LEFT_SHOULDER = { x: 10.9, y: 13.2 };
const RIGHT_SHOULDER = { x: 13.1, y: 13.2 };

const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

type Props = { size?: number; color?: string; accessibilityLabel?: string };

/**
 * The wave gesture, moving: a player whose two arms, above the head, swing from side to side in a loop. A still picture
 * of raised arms would teach the wrong gesture. With Reduce Motion on the arms stay in a V.
 */
export function WavingFigure({ size = 96, color = colors.accent, accessibilityLabel }: Props) {
  const reduce = useReducedMotion();
  const swing = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      swing.set(0);
      return;
    }
    swing.set(-1);
    // `ReduceMotion.Never`: the system setting is handled above (it would otherwise play one repeat and stop).
    swing.set(
      withRepeat(
        withTiming(1, { duration: HALF_MS, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }),
        -1,
        true,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(swing);
  }, [reduce, swing]);

  const k = size / 24;
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.get() * SWING_DEG}deg` }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.get() * SWING_DEG}deg` }] }));
  const box = { width: size, height: size };

  return (
    <View
      style={box}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Circle cx={12} cy={10.2} r={1.9} {...stroke(color)} />
        <Path d="M12 12.6v4.4M9.6 22l2.4-5 2.4 5" {...stroke(color)} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transformOrigin: [LEFT_SHOULDER.x * k, LEFT_SHOULDER.y * k, 0] }, left]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M10.9 13.2 7.6 6.6" {...stroke(color)} />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transformOrigin: [RIGHT_SHOULDER.x * k, RIGHT_SHOULDER.y * k, 0] }, right]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M13.1 13.2l3.3-6.6" {...stroke(color)} />
        </Svg>
      </Animated.View>
    </View>
  );
}
