import { createWakeDetector, WAKE_GRACE_MS, WAKE_LOOKBACK_MS } from '../wakeDetector';

function setup(requireSeenConnected: boolean) {
  jest.useFakeTimers();
  const onWake = jest.fn();
  const wake = createWakeDetector({
    onWake,
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    requireSeenConnected,
  });
  const after = (ms: number) => jest.advanceTimersByTime(ms);
  return { wake, onWake, after };
}

afterEach(() => jest.useRealTimers());

describe('in a game (the remote must have been seen connected first)', () => {
  test('the remote falls asleep and its waking press is lost: the comeback counts as the press', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    after(60_000);
    wake.link(false); // asleep after a few idle minutes
    after(300_000);
    wake.link(true); // somebody pressed: it came back, and no press reached the app
    after(WAKE_GRACE_MS);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  test('the waking press gets through: it counts once, the comeback adds nothing', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    wake.link(false);
    after(300_000);
    wake.link(true);
    after(500);
    wake.press();
    after(WAKE_GRACE_MS * 2);
    expect(onWake).not.toHaveBeenCalled();
  });

  test('a press just before the comeback is seen (the link is looked at once a second) counts once', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    wake.link(false);
    after(300_000);
    wake.press();
    after(WAKE_LOOKBACK_MS - 500);
    wake.link(true);
    after(WAKE_GRACE_MS * 2);
    expect(onWake).not.toHaveBeenCalled();
  });

  test('a remote first seen in the middle of the game (switched on) does not save a clip', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(false);
    after(60_000);
    wake.link(true);
    after(WAKE_GRACE_MS * 2);
    expect(onWake).not.toHaveBeenCalled();
  });

  test('staying asleep or staying connected never counts; an unknown look resets', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    wake.link(true);
    wake.link(false);
    wake.link(false);
    wake.link(undefined); // Bluetooth unknown for a moment
    wake.link(true);
    after(WAKE_GRACE_MS * 2);
    expect(onWake).not.toHaveBeenCalled();
  });

  test('stopping drops a comeback waiting for its press', () => {
    const { wake, onWake, after } = setup(true);
    wake.link(true);
    wake.link(false);
    wake.link(true);
    wake.stop();
    after(WAKE_GRACE_MS * 2);
    expect(onWake).not.toHaveBeenCalled();
  });
});

test('in the connection test, the waking press of a remote asleep from the start counts too', () => {
  const { wake, onWake, after } = setup(false);
  wake.link(false);
  after(10_000);
  wake.link(true);
  after(WAKE_GRACE_MS);
  expect(onWake).toHaveBeenCalledTimes(1);
});
