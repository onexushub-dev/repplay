import { act, renderHook } from '@testing-library/react-native';

import { ECONOMY_IDLE_MS, ECONOMY_WARM_IDLE_MS, useScreenEconomy } from '../useScreenEconomy';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(props: { active: boolean; thermal: 'nominal' | 'fair' | 'serious' | 'critical' }) {
  const setNative = jest.fn();
  const hook = await renderHook((p: typeof props) => useScreenEconomy(p.active, p.thermal, setNative), { initialProps: props });
  return { ...hook, setNative };
}

test('the screen goes into economy after 20 s without a touch while recording', async () => {
  const { result, setNative } = await setup({ active: true, thermal: 'nominal' });
  expect(result.current.asleep).toBe(false);
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS - 1));
  expect(result.current.asleep).toBe(false);
  await act(async () => jest.advanceTimersByTime(1));
  expect(result.current.asleep).toBe(true);
  expect(setNative).toHaveBeenLastCalledWith(true);
});

test('with the phone warm it happens after 5 s', async () => {
  const { result } = await setup({ active: true, thermal: 'fair' });
  await act(async () => jest.advanceTimersByTime(ECONOMY_WARM_IDLE_MS));
  expect(result.current.asleep).toBe(true);
});

test('a touch wakes it and starts the wait again', async () => {
  const { result, setNative } = await setup({ active: true, thermal: 'nominal' });
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS));
  await act(async () => result.current.wake());
  expect(result.current.asleep).toBe(false);
  expect(setNative).toHaveBeenLastCalledWith(false);
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS - 1));
  expect(result.current.asleep).toBe(false);
  await act(async () => result.current.wake()); // a touch while awake also restarts the wait
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS - 1));
  expect(result.current.asleep).toBe(false);
});

test('getting warm while awake shortens the wait', async () => {
  const { result, rerender } = await setup({ active: true, thermal: 'nominal' });
  await act(async () => jest.advanceTimersByTime(4000));
  await act(async () => void (await rerender({ active: true, thermal: 'fair' })));
  await act(async () => jest.advanceTimersByTime(ECONOMY_WARM_IDLE_MS));
  expect(result.current.asleep).toBe(true);
});

test('not recording: never asleep, and the screen is given back when the recording ends', async () => {
  const { result, rerender, setNative } = await setup({ active: true, thermal: 'nominal' });
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS));
  await act(async () => void (await rerender({ active: false, thermal: 'nominal' })));
  expect(result.current.asleep).toBe(false);
  expect(setNative).toHaveBeenLastCalledWith(false);
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS * 3));
  expect(result.current.asleep).toBe(false);
});

test('leaving the screen gives the brightness back', async () => {
  const { unmount, setNative } = await setup({ active: true, thermal: 'nominal' });
  await act(async () => jest.advanceTimersByTime(ECONOMY_IDLE_MS));
  await unmount();
  expect(setNative).toHaveBeenLastCalledWith(false);
});

test('a wait of its own replaces both (the remote phone waits a minute, warm or not)', async () => {
  const setNative = jest.fn();
  const { result } = await renderHook(() => useScreenEconomy(true, 'fair', setNative, 60_000));
  await act(async () => jest.advanceTimersByTime(59_999));
  expect(result.current.asleep).toBe(false);
  await act(async () => jest.advanceTimersByTime(1));
  expect(result.current.asleep).toBe(true);
  expect(setNative).toHaveBeenLastCalledWith(true);
});
