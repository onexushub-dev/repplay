import { act, renderHook } from '@testing-library/react-native';

import type { RemoteLink } from '../../devices/bluetoothRemote';
import { REMOTE_LOST_MS, useRemoteLost } from '../useRemoteLost';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function hook(link: RemoteLink, active = true) {
  const view = await renderHook(({ l, a }: { l: RemoteLink; a: boolean }) => useRemoteLost(l, a), { initialProps: { l: link, a: active } });
  const set = async (l: RemoteLink, a = true) => view.rerender({ l, a });
  const after = async (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
  return { view, set, after };
}

test('2026-11-03: a remote gone for 30 s in a game (out of range, iOS gave up) is reported, so the player knows', async () => {
  const { view, set, after } = await hook('connected');
  await set('missing');
  await after(REMOTE_LOST_MS - 1000);
  expect(view.result.current).toBe(false); // a short walk out of range says nothing
  await after(1000);
  expect(view.result.current).toBe(true);
});

test('the remote coming back clears it at once', async () => {
  const { view, set, after } = await hook('connected');
  await set('missing');
  await after(REMOTE_LOST_MS);
  await set('connected');
  expect(view.result.current).toBe(false);
});

test('gone and back again restarts the wait: flapping at the edge of range is not 30 s gone', async () => {
  const { view, set, after } = await hook('connected');
  await set('missing');
  await after(20_000);
  await set('connected');
  await set('missing');
  await after(20_000);
  expect(view.result.current).toBe(false);
});

test('a remote never seen connected in this game (the player is not using it) is never reported', async () => {
  const { view, after } = await hook('missing');
  await after(REMOTE_LOST_MS * 3);
  expect(view.result.current).toBe(false);
});

test('an unknown look keeps what was known; outside a game nothing is reported', async () => {
  const { view, set, after } = await hook('connected');
  await set('missing');
  await set(undefined);
  await after(REMOTE_LOST_MS);
  expect(view.result.current).toBe(true);
  await set('missing', false);
  expect(view.result.current).toBe(false);
});
