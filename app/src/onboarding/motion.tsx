import { type ReactNode, useEffect } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View, type ViewStyle } from 'react-native';
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

/** Fades a block in while it rises a little; with Reduce Motion on it is simply there. */
export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: ViewStyle }) {
  const reduce = useReducedMotion();
  const shown = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    const start = setTimeout(
      () => shown.set(withTiming(1, { duration: 450, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })),
      delay,
    );
    return () => clearTimeout(start);
  }, [reduce, delay, shown]);

  const animated = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 12 }] }));
  // Nothing in a Reveal takes a touch: it lets them through to the story's tap and hold areas behind it.
  return (
    <Animated.View pointerEvents="none" style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/**
 * A looping 0 to 1 value for the small demos (a ring, a playhead). Stays at `rest` with Reduce Motion on.
 * `bounce` runs it back and forth instead of restarting.
 */
export function useLoop(duration: number, options: { bounce?: boolean; rest?: number } = {}) {
  const { bounce = false, rest = 0.5 } = options;
  const reduce = useReducedMotion();
  const value = useSharedValue(rest);

  useEffect(() => {
    if (reduce) {
      value.set(rest);
      return;
    }
    value.set(0);
    // `ReduceMotion.Never` on both: the system setting would otherwise play a repeat once and stop (see PulseRing).
    value.set(
      withRepeat(
        withTiming(1, {
          duration,
          easing: bounce ? Easing.out(Easing.quad) : Easing.linear,
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        bounce,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(value);
  }, [reduce, duration, bounce, rest, value]);

  return value;
}

/** A photo that drifts in slowly, as if the camera were still rolling; it stays put with Reduce Motion on. */
export function Photo({ source }: { source: ImageSourcePropType }) {
  const zoom = useLoop(10000, { bounce: true, rest: 0 });
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: 1.04 + 0.08 * zoom.get() }] }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityElementsHidden />
      </Animated.View>
    </View>
  );
}
