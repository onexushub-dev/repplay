import type { KV } from '../../data/repo';
import { createAnalytics } from '../core';
import { createFakeAdapter } from '../fakeAdapter';

function memoryKv(): KV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getString: (k) => store.get(k),
    set: (k, v) => void store.set(k, v),
    delete: (k) => void store.delete(k),
    keys: () => [...store.keys()],
  };
}

const brokenKv: KV = {
  getString: () => {
    throw new Error('read failed');
  },
  set: () => {
    throw new Error('write failed');
  },
  delete: () => {
    throw new Error('delete failed');
  },
  keys: () => {
    throw new Error('keys failed');
  },
};

function setup(kv: KV = memoryKv()) {
  const adapter = createFakeAdapter();
  let n = 0;
  const analytics = createAnalytics({ adapter, kv, newId: () => `id-${++n}` });
  return { adapter, analytics, kv };
}

describe('analytics core', () => {
  test('forwards the event name and its properties to the adapter', () => {
    const { adapter, analytics } = setup();
    analytics.track('clip_saved', { trigger: 'watch', mode: 'quadra' });
    expect(adapter.calls).toEqual([{ name: 'clip_saved', props: { trigger: 'watch', mode: 'quadra' } }]);
  });

  test('an event without properties is sent with none', () => {
    const { adapter, analytics } = setup();
    analytics.track('onboarding_completed');
    expect(adapter.calls).toEqual([{ name: 'onboarding_completed', props: undefined }]);
  });

  test('creates the install id once and a new instance on the same storage reuses it', () => {
    const kv = memoryKv();
    const first = setup(kv).analytics;
    const second = createAnalytics({ adapter: createFakeAdapter(), kv, newId: () => 'other' });
    expect(first.installId()).toBe('id-1');
    expect(kv.getString('analytics.installId')).toBe('id-1');
    expect(second.installId()).toBe('id-1');
  });

  test('opting out sends nothing, persists, and is read back by a new instance', () => {
    const kv = memoryKv();
    const { adapter, analytics } = setup(kv);
    analytics.setEnabled(false);
    analytics.track('onboarding_completed');
    expect(adapter.calls).toEqual([]);
    expect(analytics.isEnabled()).toBe(false);
    const again = createAnalytics({ adapter: createFakeAdapter(), kv, newId: () => 'x' });
    expect(again.isEnabled()).toBe(false);
  });

  test('turning collection back on sends events again', () => {
    const { adapter, analytics } = setup();
    analytics.setEnabled(false);
    analytics.setEnabled(true);
    analytics.track('onboarding_completed');
    expect(adapter.calls).toHaveLength(1);
  });

  test('the 21st send of one event in a session is dropped and a new session starts the count over', () => {
    const { adapter, analytics } = setup();
    for (let i = 0; i < 25; i++) analytics.track('paywall_viewed', { source: 'upgrade_card' });
    expect(adapter.calls).toHaveLength(20);
    analytics.startSession();
    analytics.track('paywall_viewed', { source: 'upgrade_card' });
    expect(adapter.calls).toHaveLength(21);
  });

  test('clip_saved and trigger_failed allow 50 sends per session', () => {
    const { adapter, analytics } = setup();
    for (let i = 0; i < 60; i++) analytics.track('clip_saved', { trigger: 'phone', mode: 'quadra' });
    expect(adapter.calls).toHaveLength(50);
    for (let i = 0; i < 60; i++) analytics.track('trigger_failed', { trigger: 'watch', reason: 'busy' });
    expect(adapter.calls).toHaveLength(100);
  });

  test('a storage that throws does not break track and the install id stays stable in memory', () => {
    const { adapter, analytics } = setup(brokenKv);
    expect(() => analytics.track('onboarding_completed')).not.toThrow();
    expect(adapter.calls).toHaveLength(1);
    expect(analytics.installId()).toBe(analytics.installId());
    expect(() => analytics.setEnabled(false)).not.toThrow();
    expect(analytics.isEnabled()).toBe(false);
  });

  test('an adapter that throws is swallowed and later events still go out', () => {
    const kv = memoryKv();
    const calls: string[] = [];
    let fail = true;
    const analytics = createAnalytics({
      adapter: {
        capture: (name) => {
          if (fail) throw new Error('network');
          calls.push(name);
        },
      },
      kv,
      newId: () => 'id',
    });
    expect(() => analytics.track('onboarding_completed')).not.toThrow();
    fail = false;
    analytics.track('onboarding_completed');
    expect(calls).toEqual(['onboarding_completed']);
  });

  test('the event map rejects missing and unknown properties at compile time', () => {
    const { analytics } = setup();
    // These only assert types: they run, and `tsc` is what rejects a regression.
    // @ts-expect-error clip_saved needs its properties
    analytics.track('clip_saved');
    // @ts-expect-error app_open has no property called nope
    analytics.track('app_open', { nope: 1 });
    // @ts-expect-error an event that is not in the catalogue
    analytics.track('screen_viewed');
  });
});
