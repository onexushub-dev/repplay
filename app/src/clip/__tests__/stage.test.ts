import { clipStage, openingZoom, pictureTransform, previewBox } from '../stage';

const track = { startMs: 0, stepMs: 100, rects: [[0.25, 0.25, 0.5, 0.5], [0, 0, 0.5, 0.5]] as [number, number, number, number][] };

describe('openingZoom: what the picture shows when the clip starts playing', () => {
  test('Modo Foco on and ready: the framing at the start of the cut', () => {
    expect(openingZoom(undefined, track, 0)).toEqual({ scale: 2, cx: 0.5, cy: 0.5 });
    expect(openingZoom(undefined, track, 100)).toEqual({ scale: 2, cx: 0.25, cy: 0.25 });
  });

  test('Modo Foco not ready yet: the whole video', () => {
    expect(openingZoom(undefined, undefined, 0)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
  });

  test('Modo Foco turned off: the whole video', () => {
    expect(openingZoom({ muted: false, focus: false }, track, 0)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
  });

  test('a zoom by hand wins over Modo Foco', () => {
    const zoom = { scale: 3, cx: 0.2, cy: 0.7 };
    expect(openingZoom({ muted: false, zoom }, track, 0)).toEqual(zoom);
  });

  test('a turned clip has no Modo Foco, but keeps its hand zoom', () => {
    expect(openingZoom({ muted: false, rotation: 90 }, track, 0)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
    const zoom = { scale: 2, cx: 0.4, cy: 0.4 };
    expect(openingZoom({ muted: false, rotation: 90, zoom }, track, 0)).toEqual(zoom);
  });
});

test('clipStage: a vertical clip gets a vertical frame filled by the video; a landscape one a landscape frame', () => {
  const vertical = clipStage('free', undefined, { startMs: 0, endMs: 1000 }, { width: 1080, height: 1920 }, false);
  expect(vertical.landscape).toBe(false);
  expect(vertical.frame).toEqual({ width: 1080, height: 1920 });
  expect(vertical.layout.video).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  const turned = clipStage('free', { muted: false, rotation: 90 }, { startMs: 0, endMs: 1000 }, { width: 1080, height: 1920 }, false);
  expect(turned.landscape).toBe(true);
  expect(turned.frame).toEqual({ width: 1920, height: 1080 });
});

test('previewBox: the frame as large as the area allows, the video box scaled with it', () => {
  const { frame, layout } = clipStage('free', undefined, { startMs: 0, endMs: 1000 }, { width: 1920, height: 1080 }, false);
  const box = previewBox(frame, layout, { width: 400, height: 800 });
  expect(box.width).toBe(400);
  expect(box.height).toBeCloseTo(225);
  expect(box.video.width).toBeCloseTo(400);
  expect(box.video.height).toBeCloseTo(225);
});

test('pictureTransform: moves the zoomed point to the middle of the box', () => {
  expect(pictureTransform({ scale: 2, cx: 0.25, cy: 0.75 }, { width: 100, height: 200 })).toEqual([
    { translateX: 50 },
    { translateY: -100 },
    { scale: 2 },
  ]);
});
