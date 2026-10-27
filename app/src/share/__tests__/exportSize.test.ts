import { estimateMegabytes, exportChoices, sideName, sideSize } from '../exportSize';

test('a 4K clip can go out as 4K, 2K or Full HD; anything else as Full HD only', () => {
  expect(exportChoices(2160)).toEqual([2160, 1440, 1080]);
  expect(exportChoices(1080)).toEqual([1080]);
  expect(exportChoices(720)).toEqual([1080]);
  expect(exportChoices(undefined)).toEqual([1080]);
});

test('each size in both orientations', () => {
  expect(sideSize(2160, true)).toEqual({ width: 3840, height: 2160 });
  expect(sideSize(2160, false)).toEqual({ width: 2160, height: 3840 });
  expect(sideSize(1440, true)).toEqual({ width: 2560, height: 1440 });
  expect(sideSize(1080, false)).toEqual({ width: 1080, height: 1920 });
  expect([2160, 1440, 1080].map((s) => sideName(s as 2160 | 1440 | 1080))).toEqual(['4K', '2K', 'Full HD']);
});

test('the size estimate grows with the resolution and the length', () => {
  // 30 s: 4K ≈ 150 MB, 2K ≈ 68 MB, Full HD ≈ 38 MB with sound.
  expect(estimateMegabytes(2160, 30_000, true)).toBe(150);
  expect(estimateMegabytes(1440, 30_000, true)).toBe(68);
  expect(estimateMegabytes(1080, 30_000, true)).toBe(38);
  expect(estimateMegabytes(1080, 30_000, false)).toBe(38);
  expect(estimateMegabytes(1080, 0, true)).toBe(1);
});
