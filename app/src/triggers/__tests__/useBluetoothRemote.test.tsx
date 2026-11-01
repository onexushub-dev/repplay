import { act, renderHook } from '@testing-library/react-native';

import { useBluetoothRemote, WAKE_POLL_MS } from '../useBluetoothRemote';
import { WAKE_GRACE_MS } from '../wakeDetector';

jest.mock('../../../modules/replay-camera', () => ({ bluetoothConnected: jest.fn() }));
jest.mock('../../diag/diagLog', () => ({ diag: jest.fn() }));
jest.mock('../useVolumeRemote', () => ({ useVolumeRemote: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  let prefs: Record<string, unknown> = {};
  return {
    __set: (p: Record<string, unknown>) => (prefs = p),
    repo: { getPrefs: () => prefs },
  };
});

const cam = jest.requireMock('../../../modules/replay-camera');
const mmkv = jest.requireMock('../../data/mmkv');
const { useVolumeRemote } = jest.requireMock('../useVolumeRemote');
const shutter = { id: 'AAAA', name: 'AB Shutter3', services: ['battery', 'info'] };
const tick = () => act(async () => void (await jest.advanceTimersByTimeAsync(WAKE_POLL_MS)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mmkv.__set({ remoteBleId: 'AAAA' });
});
afterEach(() => jest.useRealTimers());

test('the remote waking up in a game saves the clip when its own press is lost', async () => {
  const onPress = jest.fn();
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] });
  const { unmount } = await renderHook(() => useBluetoothRemote(true, onPress, { requireSeenConnected: true }));
  await tick();
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [] }); // asleep
  await tick();
  await tick();
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] }); // woken by a press that got lost
  await tick();
  await act(async () => void (await jest.advanceTimersByTimeAsync(WAKE_GRACE_MS)));
  expect(onPress).toHaveBeenCalledTimes(1);
  await act(async () => unmount());
});

test('a press that gets through counts once (the volume path), the comeback adds nothing', async () => {
  const onPress = jest.fn();
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] });
  const { unmount } = await renderHook(() => useBluetoothRemote(true, onPress, { requireSeenConnected: true }));
  await tick();
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [] });
  await tick();
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] });
  await tick();
  await act(async () => useVolumeRemote.mock.calls.at(-1)[1]()); // the press arrives
  await act(async () => void (await jest.advanceTimersByTimeAsync(WAKE_GRACE_MS * 2)));
  expect(onPress).toHaveBeenCalledTimes(1);
  await act(async () => unmount());
});

test('without a learnt BLE remote it is the volume remote alone (nothing is looked at)', async () => {
  mmkv.__set({});
  const onPress = jest.fn();
  const { unmount } = await renderHook(() => useBluetoothRemote(true, onPress, { requireSeenConnected: true }));
  await tick();
  expect(cam.bluetoothConnected).not.toHaveBeenCalled();
  expect(useVolumeRemote).toHaveBeenLastCalledWith(true, expect.any(Function));
  await act(async () => unmount());
});

test('disabled: nothing is looked at', async () => {
  await renderHook(() => useBluetoothRemote(false, jest.fn(), { requireSeenConnected: true }));
  await tick();
  expect(cam.bluetoothConnected).not.toHaveBeenCalled();
});
