import { type ReactNode, useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
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

import { coverPlacement, type PhotoSpec } from './photos';

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

/**
 * A photo that fills its box with the point that matters in view (`focus` overrides the photo's own) and drifts in a
 * little, as if the camera were still rolling; it stays put with Reduce Motion on. The drift is kept small: the
 * more a photo is enlarged, the softer it looks.
 */
export function Photo({ photo, focus }: { photo: PhotoSpec; focus?: { x: number; y: number } }) {
  const zoom = useLoop(10000, { bounce: true, rest: 0 });
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.05 * zoom.get() }] }));
  const [box, setBox] = useState({ width: 0, height: 0 });
  const place = coverPlacement(photo, focus ?? photo.focus, box.width, box.height);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(event) => setBox(event.nativeEvent.layout)}>
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        {box.width > 0 ? <Image source={photo.source} style={[styles.photo, place]} accessibilityElementsHidden /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ photo: { position: 'absolute' } });
