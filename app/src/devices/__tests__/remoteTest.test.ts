import {
  clearRemotePress,
  CONNECTED_MS,
  hasRemotePress,
  markRemotePress,
  remotePressExpiresIn,
  subscribeRemotePress,
} from '../remoteTest';

beforeEach(() => clearRemotePress());

test('starts without a press', () => {
  expect(hasRemotePress()).toBe(false);
});

test('a press counts as connected for a while, then fades: the remote may have been switched off', () => {
  markRemotePress(1000);
  expect(hasRemotePress(1000 + CONNECTED_MS - 1)).toBe(true);
  expect(remotePressExpiresIn(1000 + 10)).toBe(CONNECTED_MS - 10);
  expect(hasRemotePress(1000 + CONNECTED_MS)).toBe(false);
  expect(remotePressExpiresIn(1000 + CONNECTED_MS)).toBeUndefined();
});

test('listeners hear presses and clears, and stop hearing after unsubscribing', () => {
  const heard = jest.fn();
  const off = subscribeRemotePress(heard);
  markRemotePress();
  clearRemotePress();
  expect(heard).toHaveBeenCalledTimes(2);
  off();
  markRemotePress();
  expect(heard).toHaveBeenCalledTimes(2);
});

describe('opening the Dispositivos sheet (2026-11-01: the camera under it was stopped and reopened)', () => {
  const { isRemoteSheetOpen, openingRemoteSheet, OPENING_GRACE_MS, setRemoteSheetOpen } = jest.requireActual('../remoteTest');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    setRemoteSheetOpen(false);
    jest.useRealTimers();
  });

  test('counts as open from the tap, before the sheet itself says so, so the setup keeps the camera on', () => {
    openingRemoteSheet();
    expect(isRemoteSheetOpen()).toBe(true);
    setRemoteSheetOpen(true); // the sheet shows up
    jest.advanceTimersByTime(OPENING_GRACE_MS * 2);
    expect(isRemoteSheetOpen()).toBe(true); // stays open while it is
  });

  test('a sheet that never shows up does not keep the camera on', () => {
    openingRemoteSheet();
    jest.advanceTimersByTime(OPENING_GRACE_MS);
    expect(isRemoteSheetOpen()).toBe(false);
  });
});
