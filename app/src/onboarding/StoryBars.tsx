import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { colors, fonts } from '../theme/tokens';
import type { Slide } from './slides';

type Props = {
  slides: readonly Slide[];
  /** The label of each step, in order ("1 Grave"). */
  labels: readonly string[];
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

/** One bar per slide, grouped under the name of their step; a past slide is full, the current one fills as it plays. */
export function StoryBars({ slides, labels, index, progress }: Props) {
  const stepOfIndex = slides[index].step;
  return (
    <View style={styles.row} pointerEvents="none">
      {labels.map((label, step) => (
        <View key={label} style={styles.step}>
          <View style={styles.bars}>
            {slides.map((slide, i) =>
              slide.step === step ? (
                <Segment key={slide.id} state={i < index ? 'done' : i === index ? 'current' : 'todo'} progress={progress} />
              ) : null,
            )}
          </View>
          <Text
            numberOfLines={1}
            style={[styles.label, step === stepOfIndex ? styles.labelNow : step < stepOfIndex ? styles.labelDone : styles.labelNext]}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  step: { flex: 1, gap: 6 },
  bars: { flexDirection: 'row', gap: 3 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)', overflow: 'hidden' },
  fill: { height: '100%' },
  done: { width: '100%', backgroundColor: colors.text },
  current: { backgroundColor: colors.accent },
  label: { fontFamily: fonts.bodyBold, fontSize: 12 },
  labelNow: { color: colors.accent },
  labelDone: { color: 'rgba(255,255,255,0.9)' },
  labelNext: { color: 'rgba(255,255,255,0.62)' },
});
