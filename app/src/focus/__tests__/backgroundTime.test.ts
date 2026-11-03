import { createBackgroundClock } from '../backgroundTime';

test('2026-11-02: an analysis paused 41 min in the background is reported with its own time, not the wall clock', () => {
  const clock = createBackgroundClock();
  clock.background(1000);
  clock.foreground(2_461_000); // 41 min away
  expect(clock.backgroundMsBetween(0, 2_504_500)).toBe(2_460_000);
});

test('only the part of a background stretch inside the window counts, and a stretch still going counts up to the end', () => {
  const clock = createBackgroundClock();
  clock.background(0);
  clock.foreground(10_000);
  clock.background(50_000); // still in the background
  expect(clock.backgroundMsBetween(5000, 60_000)).toBe(5000 + 10_000);
  expect(clock.backgroundMsBetween(20_000, 40_000)).toBe(0);
});

test('going to the background twice in a row keeps the first start; foreground without background does nothing', () => {
  const clock = createBackgroundClock();
  clock.foreground(500);
  clock.background(1000);
  clock.background(2000);
  clock.foreground(4000);
  expect(clock.backgroundMsBetween(0, 10_000)).toBe(3000);
});
