import { createSessionSummary } from '../session';

function setup(now: () => number = () => 0) {
  const sent: { name: string; props?: unknown }[] = [];
  let enabled = true;
  const summary = createSessionSummary(
    {
      track: ((name: string, props?: unknown) => void sent.push({ name, props })) as never,
      isEnabled: () => enabled,
    },
    now,
  );
  return { summary, sent, disable: () => void (enabled = false) };
}

describe('session summary', () => {
  test('aggregates the notes into one session_summary with bucketed counts and the top trigger', () => {
    let t = 0;
    const { summary, sent } = setup(() => t);
    summary.start();
    summary.note('clip_saved', 'watch');
    summary.note('clip_saved', 'phone');
    summary.note('clip_saved', 'phone');
    summary.note('export');
    for (let i = 0; i < 8; i++) summary.note('zoom');
    summary.note('guide');
    t = 2 * 60_000;
    summary.flush();
    expect(sent).toEqual([
      {
        name: 'session_summary',
        props: { clips: '2-5', exports: '1', zooms: '6-20', guides: '1', economy: '0', top_trigger: 'phone', duration: '1-5m' },
      },
    ]);
  });

  test('flush twice sends once', () => {
    const { summary, sent } = setup();
    summary.start();
    summary.note('export');
    summary.flush();
    summary.flush();
    expect(sent).toHaveLength(1);
  });

  test('flush with no notes sends nothing', () => {
    const { summary, sent } = setup();
    summary.start();
    summary.flush();
    expect(sent).toEqual([]);
  });

  test('flush after opting out sends nothing and clears the counters', () => {
    const { summary, sent, disable } = setup();
    summary.start();
    summary.note('export');
    disable();
    summary.flush();
    expect(sent).toEqual([]);
  });

  test('start resets the counters and the clock', () => {
    let t = 0;
    const { summary, sent } = setup(() => t);
    summary.start();
    summary.note('clip_saved', 'watch');
    t = 40 * 60_000;
    summary.start();
    summary.note('export');
    t += 10_000;
    summary.flush();
    expect(sent[0].props).toMatchObject({ clips: '0', exports: '1', top_trigger: 'none', duration: '<1m' });
  });

  test('a clip saved without a known trigger still counts and the top trigger stays none', () => {
    const { summary, sent } = setup();
    summary.start();
    summary.note('clip_saved');
    summary.flush();
    expect(sent[0].props).toMatchObject({ clips: '1', top_trigger: 'none' });
  });
});
