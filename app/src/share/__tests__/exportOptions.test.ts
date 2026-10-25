import type { Clip } from '../../data/schema';
import { exportOptions, freeLosses } from '../exportOptions';

const trim = { startMs: 30000, endMs: 60000 };

test('pro exports 1080x1920', () => {
  expect(exportOptions('pro', undefined, trim)).toMatchObject({
    width: 1080,
    height: 1920,
    startMs: 30000,
    endMs: 60000,
    speed: 1,
    muted: false,
  });
});

test('a free export carries the app mark; a paid one (pass, pro) does not', () => {
  expect(exportOptions('free', undefined, trim).watermark).toBe(true);
  expect(exportOptions('pass', undefined, trim).watermark).toBe(false);
  expect(exportOptions('pro', undefined, trim).watermark).toBe(false);
});

test('a free export keeps 1x speed whatever the clip says', () => {
  expect(exportOptions('free', { speed: 2, muted: false }, trim).speed).toBe(1);
  expect(exportOptions('pro', { speed: 2, muted: false }, trim).speed).toBe(2);
});

test('pass exports 1080x1920', () => {
  expect(exportOptions('pass', undefined, trim)).toMatchObject({ width: 1080, height: 1920 });
});

test('slow motion halves the speed and drops the sound', () => {
  expect(exportOptions('pro', { slowmo: true, muted: false }, trim)).toMatchObject({ speed: 0.5, muted: true });
});

test.each([1.5, 2])('%sx keeps the chosen speed and drops the sound', (speed) => {
  expect(exportOptions('pro', { speed: speed as 1.5 | 2, muted: false }, trim)).toMatchObject({ speed, muted: true });
});

test('no zoom means no crop', () => {
  expect(exportOptions('pro', undefined, trim).crop).toBeUndefined();
  expect(exportOptions('pro', { speed: 1, muted: false, zoom: { scale: 1, cx: 0.5, cy: 0.5 } }, trim).crop).toBeUndefined();
});

test('a zoom exports the visible part of the video', () => {
  const edit = { speed: 1 as const, muted: false, zoom: { scale: 2, cx: 0.25, cy: 0.75 } };
  expect(exportOptions('pro', edit, trim).crop).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 });
});

test('muted keeps normal speed', () => {
  expect(exportOptions('pro', { slowmo: false, muted: true }, trim)).toMatchObject({ speed: 1, muted: true });
});

test('free exports carry no sound, whatever the clip has', () => {
  expect(exportOptions('free', { speed: 1, muted: false }, trim).muted).toBe(true);
  expect(exportOptions('pro', { speed: 1, muted: false }, trim).muted).toBe(false);
});

test('free exports 1080x1920 too', () => {
  expect(exportOptions('free', undefined, trim)).toMatchObject({ width: 1080, height: 1920 });
});

test('a turned clip exports with its rotation, and none by default', () => {
  expect(exportOptions('pro', undefined, trim).rotation).toBe(0);
  expect(exportOptions('pro', { speed: 1, muted: false, rotation: 90 }, trim).rotation).toBe(90);
});

test('a landscape clip gets the frame turned on its side, in both tiers', () => {
  expect(exportOptions('pro', undefined, trim, true)).toMatchObject({ width: 1920, height: 1080 });
  expect(exportOptions('free', undefined, trim, true)).toMatchObject({ width: 1920, height: 1080 });
  expect(exportOptions('free', undefined, trim)).toMatchObject({ width: 1080, height: 1920 });
});

describe('Modo Foco', () => {
  const ready = { path: '/c/1.focus.json', ready: true };

  test('a ready framing follows the clip shape when Modo Foco is on (the default)', () => {
    expect(exportOptions('pro', undefined, trim, true, ready).focus).toEqual({ path: '/c/1.focus.json', aspect: 'landscape' });
    expect(exportOptions('pro', { muted: false }, trim, false, ready).focus).toEqual({ path: '/c/1.focus.json', aspect: 'portrait' });
  });

  test('no framing when off, not ready, turned or zoomed by hand', () => {
    expect(exportOptions('pro', { muted: false, focus: false }, trim, true, ready).focus).toBeUndefined();
    expect(exportOptions('pro', undefined, trim, true, { path: '/c/1.focus.json', ready: false }).focus).toBeUndefined();
    expect(exportOptions('pro', undefined, trim, true).focus).toBeUndefined();
    expect(exportOptions('pro', { muted: false, rotation: 90 }, trim, true, ready).focus).toBeUndefined();
    expect(exportOptions('pro', { muted: false, zoom: { scale: 2, cx: 0.5, cy: 0.5 } }, trim, true, ready).focus).toBeUndefined();
  });
});

test('Modo Foco is a paid edit: a free export never follows, a paid one does', () => {
  const ready = { path: '/c/1.focus.json', ready: true };
  expect(exportOptions('free', { muted: false }, trim, false, ready).focus).toBeUndefined();
  expect(exportOptions('pro', { muted: false }, trim, false, ready).focus).toEqual({ path: '/c/1.focus.json', aspect: 'portrait' });
});

test('freeLosses: what a free export drops, only if the clip had it', () => {
  const ready = { v: 1, status: 'ready', file: '/c.focus.json' } as Clip['focus'];
  const losses = (edit: Clip['edit'], focus: Clip['focus'] = ready) => freeLosses({ edit, focus });
  expect(losses({ muted: false })).toEqual({ focus: true, speed: false, sound: true });
  expect(losses({ muted: true })).toEqual({ focus: true, speed: false, sound: false });
  // Away from 1x the video is silent anyway: speed is lost, sound is not.
  expect(losses({ muted: false, speed: 2 })).toEqual({ focus: true, speed: true, sound: false });
  expect(losses({ muted: false, focus: false }).focus).toBe(false);
  expect(losses({ muted: false, rotation: 90 }).focus).toBe(false);
  expect(losses({ muted: false, zoom: { scale: 2, cx: 0.5, cy: 0.5 } }).focus).toBe(false);
  expect(losses({ muted: false }, { v: 1, status: 'pending' } as Clip['focus']).focus).toBe(false);
  expect(freeLosses({ edit: { muted: false }, focus: undefined }).focus).toBe(false);
});
