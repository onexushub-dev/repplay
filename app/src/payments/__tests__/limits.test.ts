import type { ModeSettings } from '../../data/schema';
import { modeById } from '../../modes/registry';
import { canCompile, captureConfig, qualityAllowed, triggerAllowed } from '../limits';

const court = modeById('quadra').defaults;
const gym: ModeSettings = { zoom: 1, gestureEnabled: false, voiceEnabled: true, bufferSeconds: 60, cutSeconds: 60, quality: '1080p30', audio: true };

test('captureConfig free: records what the player chose, with sound; only the 15 s ceiling stays', () => {
  expect(captureConfig(court, 'free')).toEqual({ quality: '1080p60', bufferSeconds: 15, cutSeconds: 15, audio: true });
  expect(captureConfig(gym, 'free')).toEqual({ quality: '1080p30', bufferSeconds: 15, cutSeconds: 15, audio: true });
  expect(captureConfig({ ...court, audio: false }, 'free').audio).toBe(false);
});

test('captureConfig free: 15 s is a ceiling for the cut, not a fixed value', () => {
  expect(captureConfig({ ...court, cutSeconds: 10 }, 'free').cutSeconds).toBe(10);
});

test('captureConfig paid: what the player chose', () => {
  expect(captureConfig(court, 'paid')).toEqual({ quality: '1080p60', bufferSeconds: 60, cutSeconds: 30, audio: true });
  expect(captureConfig({ ...court, audio: false }, 'paid').audio).toBe(false);
  expect(captureConfig({ ...court, quality: '720p30' }, 'paid').quality).toBe('720p30');
});

test('triggerAllowed: only the watch is paid; every other trigger is free', () => {
  for (const s of ['screen', 'gesture', 'voice', 'remote', 'phone'] as const) {
    expect(triggerAllowed(s, 'free')).toBe(true);
    expect(triggerAllowed(s, 'paid')).toBe(true);
  }
  expect(triggerAllowed('watch', 'free')).toBe(false);
  expect(triggerAllowed('watch', 'paid')).toBe(true);
});

test('captureConfig free: a clip length shorter than 15 s is kept', () => {
  expect(captureConfig({ ...court, cutSeconds: 10 }, 'free').cutSeconds).toBe(10);
});

test('compiling clips is paid', () => {
  expect(canCompile('free')).toBe(false);
  expect(canCompile('paid')).toBe(true);
});

test('4K is paid: the free plan records Full HD at 60 fps instead', () => {
  const fourK: ModeSettings = { ...court, quality: '2160p30' };
  expect(captureConfig(fourK, 'paid').quality).toBe('2160p30');
  expect(captureConfig(fourK, 'free').quality).toBe('1080p60');
  expect(qualityAllowed('2160p30', 'paid')).toBe(true);
  expect(qualityAllowed('2160p30', 'free')).toBe(false);
  expect(qualityAllowed('1080p60', 'free')).toBe(true);
});
