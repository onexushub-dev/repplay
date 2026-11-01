import { type MotionSample, suggestCut } from '../suggestCut';
import recording from './gravacao-2026-10-26.json';

type Case = { clip: number; window: { startMs: number; endMs: number }; motion: MotionSample[]; expected: { startMs: number; endMs: number } };

// 7 beach tennis clips from a field recording (30 s each, save at the end): the motion the native analysis measures,
// and the cut the prototype picked for each (5 of 7 within a second of where the play really is).
test.each((recording as Case[]).map((c) => [c.clip, c] as const))('clip %i of the field recording gets the prototype cut', (_n, c) => {
  const cut = suggestCut(c.motion, c.window);
  expect(cut).toBeDefined();
  expect(Math.abs(cut!.startMs - c.expected.startMs)).toBeLessThanOrEqual(60);
  expect(Math.abs(cut!.endMs - c.expected.endMs)).toBeLessThanOrEqual(60);
});

/** 30 s of motion from `startMs`: quiet, with busy stretches `[fromS, toS, level]`. */
function motion(busy: [number, number, number][], startMs = 10_000, seconds = 30): MotionSample[] {
  return Array.from({ length: seconds * 10 }, (_, i) => {
    const s = i / 10;
    const hit = busy.find(([a, b]) => s >= a && s < b);
    return [startMs + i * 100, hit ? hit[2] : 0.002 + (i % 7) * 0.0003] as MotionSample;
  });
}
const window = { startMs: 10_000, endMs: 40_000 };

test('a play that runs up to the save: from a little before it starts up to the save', () => {
  expect(suggestCut(motion([[22, 29.5, 0.03]]), window)).toEqual({ startMs: 29_400, endMs: 40_000 });
});

test('the stretch closest to the save wins over a bigger one long before it', () => {
  const cut = suggestCut(motion([[3, 9, 0.04], [24, 29.8, 0.03]]), window)!;
  expect(cut.startMs).toBeGreaterThan(30_000);
  expect(cut.endMs).toBe(40_000);
});

test('a play well before the save ends shortly after it, not at the save', () => {
  const cut = suggestCut(motion([[4, 12, 0.05]]), window)!;
  expect(cut.startMs).toBe(11_400); // 2.5 s of lead-in (the smoothing starts it a little early)
  expect(cut.endMs).toBeLessThan(23_000);
});

test('never longer than 15 s: the end stays, the start moves', () => {
  const cut = suggestCut(motion([[8, 29.9, 0.03]]), window)!;
  expect(cut).toEqual({ startMs: 25_000, endMs: 40_000 });
});

test('a short burst still gives at least 6 s', () => {
  const cut = suggestCut(motion([[26, 28, 0.03]]), window)!;
  expect(cut.endMs - cut.startMs).toBeGreaterThanOrEqual(6_000);
});

test('nothing to say: a still picture, or too few samples', () => {
  const still: MotionSample[] = Array.from({ length: 300 }, (_, i) => [10_000 + i * 100, 0]);
  expect(suggestCut(still, window)).toBeUndefined();
  expect(suggestCut(motion([[1, 2, 0.03]], 10_000, 5), window)).toBeUndefined();
});

test('samples outside the clip window are left out', () => {
  const before = motion([[0, 30, 0.08]], 0, 10); // 0–10 s of the file: an earlier clip's moment
  const cut = suggestCut([...before, ...motion([[22, 29.5, 0.03]])], window);
  expect(cut).toEqual({ startMs: 29_400, endMs: 40_000 });
});
