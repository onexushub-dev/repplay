import { createRepo, type KV } from '../../data/repo';
import type { Clip } from '../../data/schema';
import { createFocusQueue, focusHold } from '../focusQueue';

type Analysis = { status: 'ready' | 'none'; frames: number; framesWithPeople: number; meanPeople: number; elapsedMs: number };
type Opts = { clipPath: string; startMs: number; endMs: number; outPath: string; sport?: string; debug?: boolean };

function setup(opts: { supported?: boolean; sport?: string; debug?: boolean } = {}) {
  const map = new Map<string, string>();
  const kv: KV = { getString: (k) => map.get(k), set: (k, v) => void map.set(k, v), delete: (k) => void map.delete(k) };
  let n = 0;
  const repo = createRepo(kv, { exists: () => true, sizeBytes: () => 1 }, () => `id-${++n}`);
  const runs: { opts: Opts; resolve: (a: Analysis) => void; reject: (e: unknown) => void }[] = [];
  const deps = {
    analyze: jest.fn(
      (o: Opts) =>
        new Promise<Analysis>((resolve, reject) => void runs.push({ opts: o, resolve, reject })),
    ),
    cancel: jest.fn(),
    supported: () => (opts.supported === undefined ? true : opts.supported),
    repo,
    deleteFile: jest.fn(),
    ...(opts.sport !== undefined ? { sportOf: () => opts.sport as string } : {}),
    ...(opts.debug ? { debug: true } : {}),
  };
  const queue = createFocusQueue(deps);
  const addClip = (path: string) => repo.addClip({ sessionId: 's', createdAt: 1, source: 'screen', path, durationMs: 60000 }, 30000);
  const done = (status: 'ready' | 'none' = 'ready') => ({ status, frames: 300, framesWithPeople: 280, meanPeople: 6, elapsedMs: 9000 });
  const flush = () => new Promise<void>((r) => setImmediate(() => r()));
  /** A clip saved before `bounds` existed. */
  const addOldClip = (path: string) => {
    const clip = addClip(path);
    const { bounds: _bounds, ...old } = clip;
    map.set(`repplay:v1:clip:${clip.id}`, JSON.stringify(old));
    return old as Clip;
  };
  return { repo, deps, queue, runs, addClip, addOldClip, done, flush };
}

test('a saved clip is marked pending and analysed over its own part of the file', () => {
  const { repo, queue, runs, addClip } = setup();
  const clip = addClip('/c/1.mp4');
  queue.enqueue(clip.id);
  expect(repo.getClip(clip.id)!.focus).toEqual({ v: 2, status: 'pending' });
  expect(runs[0].opts).toEqual({ clipPath: '/c/1.mp4', startMs: 30000, endMs: 60000, outPath: '/c/1.focus.json', sport: 'livre' });
});

test('analyses run one at a time, in order', async () => {
  const { queue, runs, addClip, done, flush } = setup();
  queue.enqueue(addClip('/c/1.mp4').id);
  queue.enqueue(addClip('/c/2.mp4').id);
  expect(runs).toHaveLength(1);
  runs[0].resolve(done());
  await flush();
  expect(runs).toHaveLength(2);
  expect(runs[1].opts.clipPath).toBe('/c/2.mp4');
});

test('the result is stored with its file: ready, or none when nobody was found', async () => {
  const { repo, queue, runs, addClip, done, flush } = setup();
  const a = addClip('/c/1.mp4');
  const b = addClip('/c/2.mp4');
  queue.enqueue(a.id);
  queue.enqueue(b.id);
  runs[0].resolve(done('ready'));
  await flush();
  runs[1].resolve(done('none'));
  await flush();
  expect(repo.getClip(a.id)!.focus).toEqual({ v: 2, status: 'ready', file: '/c/1.focus.json' });
  expect(repo.getClip(b.id)!.focus).toEqual({ v: 2, status: 'none', file: '/c/2.focus.json' });
});

test('a broken analysis is marked failed and the next one still runs', async () => {
  const { repo, queue, runs, addClip, flush } = setup();
  const a = addClip('/c/1.mp4');
  queue.enqueue(a.id);
  queue.enqueue(addClip('/c/2.mp4').id);
  runs[0].reject(Object.assign(new Error('boom'), { code: 'FOCUS_FAILED' }));
  await flush();
  expect(repo.getClip(a.id)!.focus).toEqual({ v: 2, status: 'failed' });
  expect(runs).toHaveLength(2);
});

test('a clip deleted while waiting is skipped, and one deleted while running is cancelled without coming back', async () => {
  const { repo, deps, queue, runs, addClip, flush } = setup();
  const a = addClip('/c/1.mp4');
  const b = addClip('/c/2.mp4');
  const c = addClip('/c/3.mp4');
  queue.enqueue(a.id);
  queue.enqueue(b.id);
  queue.enqueue(c.id);
  repo.deleteClip(b.id);
  queue.cancel('/c/2.mp4');
  repo.deleteClip(a.id);
  queue.cancel('/c/1.mp4');
  expect(deps.cancel).toHaveBeenCalledWith('/c/1.mp4');
  runs[0].reject(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
  await flush();
  expect(repo.getClip(a.id)).toBeUndefined();
  expect(runs.map((r) => r.opts.clipPath)).toEqual(['/c/1.mp4', '/c/3.mp4']);
});

test('a run that finishes after its clip was deleted removes the file it wrote', async () => {
  const { repo, deps, queue, runs, addClip, done, flush } = setup();
  const a = addClip('/c/1.mp4');
  queue.enqueue(a.id);
  repo.deleteClip(a.id); // deleted without the cancel reaching the native side in time
  runs[0].resolve(done());
  await flush();
  expect(repo.getClip(a.id)).toBeUndefined();
  expect(deps.deleteFile).toHaveBeenCalledWith('/c/1.focus.json');
});

test('while paused (recording and hot) nothing new starts; it resumes when unpaused', async () => {
  const { queue, runs, addClip } = setup();
  queue.setPaused(true);
  queue.enqueue(addClip('/c/1.mp4').id);
  expect(runs).toHaveLength(0);
  queue.setPaused(false);
  expect(runs).toHaveLength(1);
});

test('ensure queues a clip never analysed and a pending one left by a closed app, and nothing else', () => {
  const { repo, queue, runs, addClip } = setup();
  const fresh = addClip('/c/1.mp4');
  const stale = repo.updateClip(addClip('/c/2.mp4').id, { focus: { v: 1, status: 'pending' } }) as Clip;
  const ready = repo.updateClip(addClip('/c/3.mp4').id, { focus: { v: 2, status: 'ready', file: '/c/3.focus.json' } }) as Clip;
  queue.setPaused(true);
  queue.ensure(fresh);
  queue.ensure(stale);
  queue.ensure(ready);
  queue.ensure(fresh); // already queued
  queue.setPaused(false);
  expect(runs.map((r) => r.opts.clipPath)).toEqual(['/c/1.mp4']);
  expect(repo.getClip(fresh.id)!.focus!.status).toBe('pending');
});

test('without the native analysis nothing is queued or marked', () => {
  const { repo, queue, runs, addClip } = setup({ supported: false });
  const clip = addClip('/c/1.mp4');
  queue.enqueue(clip.id);
  queue.ensure(clip);
  expect(runs).toHaveLength(0);
  expect(repo.getClip(clip.id)!.focus).toBeUndefined();
});

test('an old clip without bounds is analysed over the whole file', () => {
  const { queue, runs, addOldClip } = setup();
  queue.ensure(addOldClip('/c/old.mp4'));
  expect(runs[0].opts).toMatchObject({ startMs: 0, endMs: 60000 });
});

test('an analysis interrupted (app sent to the background) stays pending and is redone when the clip is opened', async () => {
  const { repo, queue, runs, addClip, flush } = setup();
  const clip = addClip('/c/1.mp4');
  queue.enqueue(clip.id);
  runs[0].reject(Object.assign(new Error('interrupted'), { code: 'FOCUS_INTERRUPTED' }));
  await flush();
  expect(repo.getClip(clip.id)!.focus).toEqual({ v: 2, status: 'pending' });
  queue.ensure(repo.getClip(clip.id)!);
  expect(runs).toHaveLength(2);
});

describe('hold while recording (thermal spec item 1)', () => {
  test('focusHold: recording holds everything but an opened clip when cool, everything when warmer', () => {
    expect(focusHold(false, 'serious')).toBe('none');
    expect(focusHold(true, 'nominal')).toBe('openedOnly');
    expect(focusHold(true, 'fair')).toBe('all');
    expect(focusHold(true, 'serious')).toBe('all');
    expect(focusHold(true, 'critical')).toBe('all');
  });

  test('openedOnly: a saved clip waits, a clip opened in the editor runs first, the rest after the hold ends', async () => {
    const { queue, runs, addClip, done, flush } = setup();
    queue.setHold('openedOnly');
    const saved = addClip('/c/1.mp4');
    const opened = addClip('/c/2.mp4');
    queue.enqueue(saved.id);
    queue.enqueue(opened.id);
    expect(runs).toHaveLength(0);
    queue.ensure(opened); // pending, waiting: opening it lets it through
    expect(runs.map((r) => r.opts.clipPath)).toEqual(['/c/2.mp4']);
    runs[0].resolve(done());
    await flush();
    expect(runs).toHaveLength(1); // the saved one still waits
    queue.setHold('none');
    expect(runs.map((r) => r.opts.clipPath)).toEqual(['/c/2.mp4', '/c/1.mp4']);
  });

  test('openedOnly: a clip never analysed and opened runs at once', () => {
    const { queue, runs, addClip } = setup();
    queue.setHold('openedOnly');
    queue.ensure(addClip('/c/1.mp4'));
    expect(runs).toHaveLength(1);
  });

  test('all: not even an opened clip starts', () => {
    const { queue, runs, addClip } = setup();
    queue.setHold('all');
    queue.ensure(addClip('/c/1.mp4'));
    expect(runs).toHaveLength(0);
    queue.setHold('none');
    expect(runs).toHaveLength(1);
  });

  test('an opened clip jumps ahead of clips saved before it', () => {
    const { queue, runs, addClip } = setup();
    queue.setHold('all');
    const a = addClip('/c/1.mp4');
    const b = addClip('/c/2.mp4');
    queue.enqueue(a.id);
    queue.enqueue(b.id);
    queue.ensure(b);
    queue.setHold('none');
    expect(runs[0].opts.clipPath).toBe('/c/2.mp4');
  });
});

// --- Modo Foco v2 (Part 3 plan, task 7) ---

test('the recording\'s sport goes to the analysis, and dev builds ask for the samples', () => {
  const { queue, runs, addClip } = setup({ sport: 'tenis', debug: true });
  queue.enqueue(addClip('/c/1.mp4').id);
  expect(runs[0].opts).toMatchObject({ sport: 'tenis', debug: true });
});

test('a clip analysed by v1 is redone once when opened, last, keeping its framing until the new one lands', async () => {
  const { repo, queue, runs, addClip, done, flush } = setup();
  const first = addClip('/c/1.mp4');
  const old = repo.updateClip(addClip('/c/2.mp4').id, { focus: { v: 1, status: 'ready', file: '/c/2.focus.json' } }) as Clip;
  queue.enqueue(first.id);
  queue.ensure(old);
  queue.ensure(old); // already waiting
  expect(repo.getClip(old.id)!.focus).toEqual({ v: 1, status: 'ready', file: '/c/2.focus.json' });
  runs[0].resolve(done());
  await flush();
  expect(runs.map((r) => r.opts.clipPath)).toEqual(['/c/1.mp4', '/c/2.mp4']);
  runs[1].resolve(done());
  await flush();
  expect(repo.getClip(old.id)!.focus).toEqual({ v: 2, status: 'ready', file: '/c/2.focus.json' });
  queue.ensure(repo.getClip(old.id)!);
  expect(runs).toHaveLength(2);
});

test('a v1 redo waits for the recording to end, even for a clip being opened', () => {
  const { repo, queue, runs, addClip } = setup();
  const old = repo.updateClip(addClip('/c/1.mp4').id, { focus: { v: 1, status: 'none', file: '/c/1.focus.json' } }) as Clip;
  queue.setHold('openedOnly');
  queue.ensure(old);
  expect(runs).toHaveLength(0);
  queue.setHold('none');
  expect(runs).toHaveLength(1);
});

test('a v1 redo that breaks keeps the v1 framing and is not retried', async () => {
  const { repo, queue, runs, addClip, flush } = setup();
  const old = repo.updateClip(addClip('/c/1.mp4').id, { focus: { v: 1, status: 'ready', file: '/c/1.focus.json' } }) as Clip;
  queue.ensure(old);
  runs[0].reject(Object.assign(new Error('boom'), { code: 'FOCUS_FAILED' }));
  await flush();
  expect(repo.getClip(old.id)!.focus).toEqual({ v: 2, status: 'ready', file: '/c/1.focus.json' });
  queue.ensure(repo.getClip(old.id)!);
  expect(runs).toHaveLength(1);
});

