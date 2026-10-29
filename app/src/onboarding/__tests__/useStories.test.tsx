import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { SLIDES, splitHighlight, waysOf } from '../slides';
import { useStories } from '../useStories';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const run = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

test('starts on the first slide with its bar empty', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  expect(result.current.index).toBe(0);
  expect(result.current.progress.get()).toBe(0);
});

test('a slide moves on by itself after its time', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await run(SLIDES[0].ms - 100);
  expect(result.current.index).toBe(0);
  expect(result.current.progress.get()).toBeGreaterThan(0.9);
  await run(200);
  expect(result.current.index).toBe(1);
  // The new slide's bar starts from empty (it has run for the rest of the 200 ms only).
  expect(result.current.progress.get()).toBeLessThan(0.05);
});

test('holding a finger freezes the slide and releasing it goes on from where it stopped', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await run(3000);
  const before = result.current.progress.get();
  await act(async () => result.current.hold());
  await run(60_000);
  expect(result.current.index).toBe(0);
  expect(result.current.progress.get()).toBe(before);
  await act(async () => result.current.release());
  await run(SLIDES[0].ms - 3000 - 100);
  expect(result.current.index).toBe(0);
  await run(200);
  expect(result.current.index).toBe(1);
});

test('next and previous move between slides and stop at the ends', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await act(async () => result.current.previous());
  expect(result.current.index).toBe(0);
  await act(async () => result.current.next());
  await act(async () => result.current.next());
  expect(result.current.index).toBe(2);
  await act(async () => result.current.previous());
  expect(result.current.index).toBe(1);
  await act(async () => result.current.goTo(99));
  expect(result.current.index).toBe(SLIDES.length - 1);
  await act(async () => result.current.next());
  expect(result.current.index).toBe(SLIDES.length - 1);
});

test('going to another slide starts its time over', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await run(6000);
  await act(async () => result.current.next());
  await run(SLIDES[1].ms - 500);
  expect(result.current.index).toBe(1);
});

test('the last slide waits for the player and its bar is full', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await act(async () => result.current.goTo(SLIDES.length - 1));
  await run(120_000);
  expect(result.current.index).toBe(SLIDES.length - 1);
  expect(result.current.progress.get()).toBe(1);
});

test('the option cards rotate until the player picks one, which stays', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await act(async () => result.current.goTo(1));
  expect(result.current.card).toBe(0);
  await run(2800);
  expect(result.current.card).toBe(1);
  await act(async () => result.current.pickCard(3));
  await run(2800 * 2);
  expect(result.current.card).toBe(3);
  await act(async () => result.current.next());
  expect(result.current.card).toBe(0);
});

test('picking a card gives the slide its whole time again', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await act(async () => result.current.goTo(1));
  await run(SLIDES[1].ms - 1000);
  await act(async () => result.current.pickCard(2));
  await run(SLIDES[1].ms - 500);
  expect(result.current.index).toBe(1);
  await run(1000);
  expect(result.current.index).toBe(2);
});

test('the stories wait while the app is in the background', async () => {
  let listener: (state: string) => void = () => {};
  const sub = { remove: jest.fn() };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    listener = fn as (state: string) => void;
    return sub as never;
  });
  const { result } = await renderHook(() => useStories(SLIDES));
  await act(async () => listener('background'));
  await run(60_000);
  expect(result.current.index).toBe(0);
  await act(async () => listener('active'));
  await run(SLIDES[0].ms + 100);
  expect(result.current.index).toBe(1);
});

test('a stalled timer counts as a short step, never as a skipped slide', async () => {
  const { result } = await renderHook(() => useStories(SLIDES));
  await act(async () => {
    jest.setSystemTime(Date.now() + 60_000);
    jest.advanceTimersByTime(50);
  });
  expect(result.current.index).toBe(0);
});

test('splitHighlight picks the starred word out of a text', () => {
  expect(splitHighlight('Only clips you *save* stay.')).toEqual(['Only clips you ', 'save', ' stay.']);
  expect(splitHighlight('No marker here.')).toEqual(['No marker here.', '', '']);
});

test('only the Save slides have ways to save, and the Pro slide has the paid ones', () => {
  expect(waysOf('record')).toEqual([]);
  expect(waysOf('saveFree')).toHaveLength(SLIDES[1].cards);
  expect(waysOf('savePro')).toEqual(['watch', 'bluetooth']);
});
