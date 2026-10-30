import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

type Props = {
  label: string;
  holdingLabel: string;
  onComplete: () => void;
  holdMs?: number;
};

/**
 * Press-and-hold to confirm: an accent fill grows across the button while it is held, and
 * `onComplete` fires once the hold lasts `holdMs`. Letting go early cancels and the fill drains.
 */
export function HoldButton({ label, holdingLabel, onComplete, holdMs = 1000 }: Props) {
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [holding, setHolding] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  function pressIn() {
    setHolding(true);
    Animated.timing(progress, { toValue: 1, duration: holdMs, easing: Easing.linear, useNativeDriver: false }).start();
    // Completion is timed separately from the animation so it never depends on frame delivery.
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      progress.setValue(0);
      onComplete();
    }, holdMs);
  }

  function pressOut() {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && onComplete()}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={styles.button}>
      <Animated.View
        pointerEvents="none"
        style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
      <Text style={[styles.label, holding && { color: colors.onAccent }]}>{holding ? holdingLabel : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.button,
    backgroundColor: 'rgba(15,15,15,0.72)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  label: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
});
