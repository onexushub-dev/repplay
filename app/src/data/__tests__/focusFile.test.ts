import { focusPath, parseFocusFile, readFocusFile } from '../focusFile';

const mockContents = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  File: class {
    mockUri: string;
    constructor(mockPath: string) {
      this.mockUri = mockPath;
    }
    textSync() {
      const text = mockContents.get(this.mockUri);
      if (text === undefined) throw new Error('missing');
      return text;
    }
  },
}));


const valid = {
  v: 1,
  stepMs: 100,
  startMs: 2000,
  size: [1920, 1080],
  landscape: [
    [0.1, 0.2, 0.7, 0.7],
    [0.12, 0.2, 0.7, 0.7],
  ],
  portrait: [[0.3, 0, 0.3164, 1]],
};

test('the focus file sits next to the clip with a .focus.json extension', () => {
  expect(focusPath('/docs/clips/ABC.mp4')).toBe('/docs/clips/ABC.focus.json');
});

test('a valid file gives the track of the asked shape', () => {
  expect(parseFocusFile(JSON.stringify(valid), 'landscape')).toEqual({
    startMs: 2000,
    stepMs: 100,
    rects: [
      [0.1, 0.2, 0.7, 0.7],
      [0.12, 0.2, 0.7, 0.7],
    ],
  });
  expect(parseFocusFile(JSON.stringify(valid), 'portrait')!.rects).toEqual([[0.3, 0, 0.3164, 1]]);
});

test('a broken, truncated, other-version or empty file means no framing', () => {
  expect(parseFocusFile('{', 'landscape')).toBeUndefined();
  expect(parseFocusFile('null', 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, v: 2 }), 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, landscape: [] }), 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, landscape: [[0.1, 0.2]] }), 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, stepMs: 0 }), 'landscape')).toBeUndefined();
});

test('reading a file that is not there means no framing', () => {
  mockContents.set('file:///c/ok.focus.json', JSON.stringify(valid));
  expect(readFocusFile('/c/ok.focus.json', 'landscape')!.startMs).toBe(2000);
  expect(readFocusFile('/c/gone.focus.json', 'landscape')).toBeUndefined();
});
