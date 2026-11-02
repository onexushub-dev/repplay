import { createWakeDetector, WAKE_DEDUP_MS, WAKE_LOOKBACK_MS } from '../wakeDetector';

function setup(requireSeenConnected: boolean) {
  jest.useFakeTimers();
  const onWake = jest.fn();
  const wake = createWakeDetector({ onWake, now: () => Date.now(), requireSeenConnected });
  const after = (ms: number) => jest.advanceTimersByTime(ms);
  return { wake, onWake, after };
}

afterEach(() => jest.useRealTimers());

describe('in a game (the remote must have been seen connected first)', () => {
  test('the remote wakes up: the comeback counts as the press at once, without waiting for its own press', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    after(60_000);
    wake.link(false); // asleep after a few idle minutes
    after(300_000);
    wake.link(true); // somebody pressed: it came back
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  test('its own press getting through right after counts once: it is dropped', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    wake.link(false);
    after(300_000);
    wake.link(true);
    after(800);
    expect(wake.press()).toBe(false);
    expect(onWake).toHaveBeenCalledTimes(1);
    after(WAKE_DEDUP_MS);
    expect(wake.press()).toBe(true); // a new press later is a new press
  });

  test('a press just before the comeback was seen (it got through first) counts once: the comeback adds nothing', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    wake.link(false);
    after(300_000);
    expect(wake.press()).toBe(true);
    after(WAKE_LOOKBACK_MS - 500);
    wake.link(true);
    expect(onWake).not.toHaveBeenCalled();
  });

  test('a remote first seen in the middle of the game (switched on) does not save a clip', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(false);
    after(60_000);
    wake.link(true);
    expect(onWake).not.toHaveBeenCalled();
  });

  test('staying asleep or staying connected never counts; an unknown look resets', () => {
    const { wake, onWake } = setup(true);
    wake.link(true);
    wake.link(true);
    wake.link(false);
    wake.link(false);
    wake.link(undefined); // Bluetooth unknown for a moment
    wake.link(true);
    expect(onWake).not.toHaveBeenCalled();
  });
});

test('in the connection test, the waking press of a remote asleep from the start counts too', () => {
  const { wake, onWake, after } = setup(false);
  wake.link(false);
  after(10_000);
  wake.link(true);
  expect(onWake).toHaveBeenCalledTimes(1);
});
