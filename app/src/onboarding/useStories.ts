import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { CARD_MS, type Slide } from './slides';

const TICK_MS = 50;

/** The app is out of sight (another app, the lock screen, the control center): the stories wait. */
const hidden = (state: string | null | undefined) => state === 'background' || state === 'inactive';

/** A tick that arrives later than this (a busy thread) counts as this long, so a stall never skips a slide. */
const MAX_STEP_MS = 200;

/**
 * The clock of the onboarding stories, as on Instagram: each slide runs for its time and moves on by itself; a tap
 * goes to the next or previous one; holding a finger down freezes the current slide (and its rotating cards) until
 * the finger lifts. The stories also wait while the app is in the background.
 *
 * `progress` is the filled share (0 to 1) of the current slide's bar. It is a shared value, so the bar moves without
 * rendering the screen on every tick; only a change of slide or card renders.
 */
export function useStories(slides: readonly Slide[]) {
  const [index, setIndex] = useState(0);
  const [card, setCard] = useState(0);
  const progress = useSharedValue(0);

  const indexRef = useRef(0);
  const elapsed = useRef(0);
  const chosen = useRef(false);
  const holding = useRef(false);
  const inBackground = useRef(hidden(AppState.currentState));
  const lastTick = useRef(0);
  const last = slides.length - 1;

  const goTo = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(last, target));
      indexRef.current = next;
      elapsed.current = 0;
      chosen.current = false;
      lastTick.current = Date.now();
      setIndex(next);
      setCard(0);
      progress.set(next === last ? 1 : 0);
    },
    [last, progress],
  );

  const next = useCallback(() => {
    if (indexRef.current < last) goTo(indexRef.current + 1);
  }, [goTo, last]);

  /** Back to the start of the previous slide; on the first one, the slide starts again. */
  const previous = useCallback(() => goTo(indexRef.current - 1), [goTo]);

  /** The player picked an option card: it stays, and the slide's time starts over so it can be read. */
  const pickCard = useCallback(
    (target: number) => {
      chosen.current = true;
      elapsed.current = 0;
      lastTick.current = Date.now();
      setCard(target);
      progress.set(0);
    },
    [progress],
  );

  const hold = useCallback(() => {
    holding.current = true;
  }, []);

  const release = useCallback(() => {
    holding.current = false;
    lastTick.current = Date.now();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      inBackground.current = hidden(state);
      lastTick.current = Date.now();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    lastTick.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const step = Math.min(now - lastTick.current, MAX_STEP_MS);
      lastTick.current = now;
      if (holding.current || inBackground.current) return;

      const slide = slides[indexRef.current];
      elapsed.current += step;
      if (slide.ms === 0) return;

      progress.set(Math.min(1, elapsed.current / slide.ms));
      if (slide.cards > 0 && !chosen.current) setCard(Math.floor(elapsed.current / CARD_MS) % slide.cards);
      if (elapsed.current >= slide.ms && indexRef.current < last) goTo(indexRef.current + 1);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [slides, last, goTo, progress]);

  return { index, card, progress, next, previous, pickCard, hold, release, goTo };
}
