import { cutMsFor, KEEP_MARGIN_MS, keepMsFor, MIN_CUT_MS } from '../cut';

test('the cut is the clip length when the previous clip is further back', () => {
  expect(cutMsFor(30, 107_000, 0)).toBe(30_000);
});

test('the cut stops at the previous clip', () => {
  expect(cutMsFor(30, 45_000, 30_000)).toBe(15_000);
  expect(cutMsFor(30, 3_000, 0)).toBe(3_000);
});

test('the cut is never shorter than the minimum', () => {
  expect(cutMsFor(30, 1_000, 0)).toBe(MIN_CUT_MS);
  expect(cutMsFor(30, 1_000, 5_000)).toBe(MIN_CUT_MS); // a clock that went backwards
});

test('a short clip length is respected even when the minimum is longer', () => {
  expect(cutMsFor(15, 100_000, 0)).toBe(15_000);
});

test('a save keeps its cut plus the margin, for every clip length', () => {
  expect(KEEP_MARGIN_MS).toBe(2000);
  for (const seconds of [15, 30, 45, 60]) {
    const cut = cutMsFor(seconds, 600_000, 0);
    expect(keepMsFor(cut)).toBe(seconds * 1000 + 2000);
  }
  // A cut stopped by the previous clip keeps only that much.
  expect(keepMsFor(cutMsFor(30, 45_000, 30_000))).toBe(17_000);
});
