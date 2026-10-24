import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { View } from 'react-native';

import { frameLayout } from '../layout';
import { type CaptureJob, useOverlayCapturer } from '../OverlayCapturer';

const mockPngs: string[] = [];
let mockMade = 0;
jest.mock('../captureOverlay', () => ({
  captureOverlay: jest.fn(async () => {
    mockMade += 1;
    const path = `/o${mockMade}.png`;
    mockPngs.push(path);
    return path;
  }),
}));
jest.mock('../ShareOverlay', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { ShareOverlay: (p: { frame: { width: number } }) => <MockView testID="overlay" accessibilityLabel={`w${p.frame.width}`} /> };
});
const { captureOverlay } = jest.requireMock('../captureOverlay');

const portrait = { width: 720, height: 1280 };
const wide = { width: 1280, height: 720 };
const jobOf = (frame: { width: number; height: number }, watermark = true): CaptureJob => ({
  frame,
  layout: frameLayout({ width: 1080, height: 1920 }, frame),
  watermark,
});

const mockApi: { current?: ReturnType<typeof useOverlayCapturer> } = {};
function Harness() {
  const capturer = useOverlayCapturer();
  useEffect(() => {
    mockApi.current = capturer;
  });
  return <View>{capturer.element}</View>;
}
const api = {
  capture: (job: CaptureJob) => mockApi.current!.capture(job),
  release: (remove: (path: string) => void) => mockApi.current!.release(remove),
};

/** Lets React draw while the promise is pending (inside one act the draw would wait for the act to end). */
async function until<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  while (!done) await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  return promise;
}

beforeEach(() => {
  mockMade = 0;
  mockPngs.length = 0;
  captureOverlay.mockClear();
});

test('capture renders the job and returns its PNG', async () => {
  await render(<Harness />);
  const path = await until(api.capture(jobOf(portrait)));
  expect(path).toBe('/o1.png');
  expect(screen.getByLabelText('w720')).toBeTruthy();
});

test('the same look twice is captured once', async () => {
  await render(<Harness />);
  const paths = [await until(api.capture(jobOf(portrait))), await until(api.capture(jobOf(portrait)))];
  expect(captureOverlay).toHaveBeenCalledTimes(1);
  expect(paths).toEqual(['/o1.png', '/o1.png']);
});

test('two different looks are captured in order, even when asked at the same time', async () => {
  await render(<Harness />);
  const paths = await until(Promise.all([api.capture(jobOf(portrait)), api.capture(jobOf(wide)), api.capture(jobOf(portrait, false))]));
  expect(paths).toEqual(['/o1.png', '/o2.png', '/o3.png']);
});

test('release removes the pictures it made', async () => {
  await render(<Harness />);
  await until(Promise.all([api.capture(jobOf(portrait)), api.capture(jobOf(wide))]));
  const removed: string[] = [];
  await act(async () => api.release((path) => removed.push(path)));
  expect(removed).toEqual(['/o1.png', '/o2.png']);
});
