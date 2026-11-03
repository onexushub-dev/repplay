import { createLinkMonitor, type LinkEvent } from '../linkMonitor';

function setup() {
  jest.useFakeTimers();
  const events: LinkEvent[] = [];
  const monitor = createLinkMonitor({ now: () => Date.now(), onLink: (e) => events.push(e) });
  const after = (ms: number) => jest.advanceTimersByTime(ms);
  return { monitor, after, events };
}

afterEach(() => jest.useRealTimers());

test('every drop and comeback of the link is reported, with how long after the last press and how long away', () => {
  const { monitor, after, events } = setup();
  monitor.link(true);
  after(20_000);
  monitor.press();
  after(30_000);
  monitor.link(false); // 2026-11-02 society: out of range 30 s after a press
  after(40_000);
  monitor.link(true);
  expect(events).toEqual([
    { kind: 'dropped', idleMs: 30_000 },
    { kind: 'back', awayMs: 40_000, idleAtDropMs: 30_000 },
  ]);
});

test('without a press yet, the idle time runs from the start of listening; a comeback is not a press', () => {
  const { monitor, after, events } = setup();
  monitor.link(true);
  after(10_000);
  monitor.link(false);
  after(2000);
  monitor.link(true);
  after(3000);
  monitor.link(false);
  expect(events[2]).toEqual({ kind: 'dropped', idleMs: 15_000 });
});

test('staying connected or away reports nothing; an unknown look forgets the drop', () => {
  const { monitor, after, events } = setup();
  monitor.link(true);
  monitor.link(true);
  monitor.link(false);
  monitor.link(false);
  monitor.link(undefined);
  after(1000);
  monitor.link(true);
  expect(events).toEqual([{ kind: 'dropped', idleMs: 0 }]);
});

test('a remote first seen away and then connected (switched on, or asleep from the start) reports a comeback of unknown length', () => {
  const { monitor, events } = setup();
  monitor.link(false);
  monitor.link(true);
  expect(events).toEqual([{ kind: 'back', awayMs: undefined, idleAtDropMs: undefined }]);
});
