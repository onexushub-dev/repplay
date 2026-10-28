import { createRepo, type KV } from '../../data/repo';
import { applyCutSuggestion, parseMotion } from '../applyCutSuggestion';
import type { MotionSample } from '../suggestCut';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));

function setup() {
  const map = new Map<string, string>();
  const kv: KV = { getString: (k) => map.get(k), set: (k, v) => void map.set(k, v), delete: (k) => void map.delete(k) };
  let n = 0;
  const repo = createRepo(kv, { exists: () => true, sizeBytes: () => 1 }, () => `id-${++n}`);
  // 32 s file, cut 30 s (2..32 s): a play from 24 s to the save
  const clip = repo.addClip({ sessionId: 's', createdAt: 1, source: 'screen', path: '/c/1.mp4', durationMs: 32_000 }, 30_000);
  const samples: MotionSample[] = Array.from({ length: 320 }, (_, i) => [i * 100, i >= 240 && i < 318 ? 0.03 : 0.002 + (i % 5) * 0.0002]);
  return { repo, clip, read: () => samples };
}

test('an untouched cut becomes the suggested one, and the suggestion is kept', () => {
  const { repo, clip, read } = setup();
  applyCutSuggestion(clip.id, '/c/1.focus.json', { repo, read });
  const after = repo.getClip(clip.id)!;
  expect(after.cutSuggestion).toEqual({ startMs: 21_400, endMs: 32_000 });
  expect(after.trim).toEqual(after.cutSuggestion);
  expect(after.bounds).toEqual({ startMs: 2_000, endMs: 32_000 });
});

test('a cut the player already changed stays; only the suggestion is kept', () => {
  const { repo, clip, read } = setup();
  repo.updateClip(clip.id, { trim: { startMs: 5_000, endMs: 20_000 } });
  applyCutSuggestion(clip.id, '/c/1.focus.json', { repo, read });
  const after = repo.getClip(clip.id)!;
  expect(after.trim).toEqual({ startMs: 5_000, endMs: 20_000 });
  expect(after.cutSuggestion).toEqual({ startMs: 21_400, endMs: 32_000 });
});

test('no motion in the file, or a deleted clip: nothing changes', () => {
  const { repo, clip } = setup();
  applyCutSuggestion(clip.id, '/c/1.focus.json', { repo, read: () => undefined });
  expect(repo.getClip(clip.id)!.cutSuggestion).toBeUndefined();
  expect(() => applyCutSuggestion('gone', '/x.focus.json', { repo, read: () => [] })).not.toThrow();
});

test('parseMotion reads the rows and refuses anything else', () => {
  expect(parseMotion('{"v":1,"motion":[[0,0.01],[100,0.02]]}')).toEqual([
    [0, 0.01],
    [100, 0.02],
  ]);
  expect(parseMotion('{"v":1}')).toBeUndefined();
  expect(parseMotion('{"motion":[[0,"x"]]}')).toBeUndefined();
  expect(parseMotion('not json')).toBeUndefined();
});
