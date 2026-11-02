import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { colors } from '../theme/tokens';
import type { Slide } from './slides';

type Props = {
  slides: readonly Slide[];
  index: number;
  progress: SharedValue<number>;
};

function Segment({ state, progress }: { state: 'done' | 'current' | 'todo'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  return (
    <View style={styles.track}>
      {state === 'done' ? <View style={[styles.fill, styles.done]} /> : null}
      {state === 'current' ? <Animated.View style={[styles.fill, styles.current, fill]} /> : null}
    </View>
  );
}

/** One bar per slide, grouped by step; a past slide is full, the current one fills as it plays. */
export function StoryBars({ slides, index, progress }: Props) {
  const steps = [...new Set(slides.map((slide) => slide.step))];
  return (
    <View style={styles.row} pointerEvents="none">
      {steps.map((step) => (
        <View key={step} style={styles.step}>
          <View style={styles.bars}>
            {slides.map((slide, i) =>
              slide.step === step ? (
                <Segment key={slide.id} state={i < index ? 'done' : i === index ? 'current' : 'todo'} progress={progress} />
              ) : null,
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  step: { flex: 1 },
  bars: { flexDirection: 'row', gap: 3 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)', overflow: 'hidden' },
  fill: { height: '100%' },
  done: { width: '100%', backgroundColor: colors.text },
  current: { backgroundColor: colors.accent },
});
