import { coverPlacement } from '../photos';

const tall = { width: 1200, height: 1800 };

test('a tall photo in a wide box is scaled to the box width and its focus point is put in the middle', () => {
  const place = coverPlacement(tall, { x: 0.5, y: 0.5 }, 400, 300);
  expect(place.width).toBeCloseTo(400);
  expect(place.height).toBeCloseTo(600);
  // The focus point (the middle of the photo) lands at the middle of the box.
  expect(place.top + 0.5 * place.height).toBeCloseTo(150);
  expect(place.left).toBeCloseTo(0);
});

test('a focus point low in the photo moves the box down to it, never past the photo edge', () => {
  const low = coverPlacement(tall, { x: 0.5, y: 0.62 }, 400, 300);
  expect(low.top + 0.62 * low.height).toBeCloseTo(150);
  const bottom = coverPlacement(tall, { x: 0.5, y: 1 }, 400, 300);
  expect(bottom.top).toBeCloseTo(-(600 - 300));
  const top = coverPlacement(tall, { x: 0.5, y: 0 }, 400, 300);
  expect(top.top).toBe(0);
});

test('the photo always covers the whole box', () => {
  for (const [w, h] of [[400, 300], [300, 600], [500, 1000], [320, 180]]) {
    for (const focus of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.3, y: 0.7 }]) {
      const place = coverPlacement(tall, focus, w, h);
      expect(place.left).toBeLessThanOrEqual(0);
      expect(place.top).toBeLessThanOrEqual(0);
      expect(place.left + place.width).toBeGreaterThanOrEqual(w - 0.001);
      expect(place.top + place.height).toBeGreaterThanOrEqual(h - 0.001);
    }
  }
});
