import { focusPath, parseFocusFile, parseFocusInfo, readFocusFile } from '../focusFile';

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
  expect(parseFocusFile(JSON.stringify({ ...valid, v: 3 }), 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, landscape: [] }), 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, landscape: [[0.1, 0.2]] }), 'landscape')).toBeUndefined();
  expect(parseFocusFile(JSON.stringify({ ...valid, stepMs: 0 }), 'landscape')).toBeUndefined();
});

test('reading a file that is not there means no framing', () => {
  mockContents.set('file:///c/ok.focus.json', JSON.stringify(valid));
  expect(readFocusFile('/c/ok.focus.json', 'landscape')!.startMs).toBe(2000);
  expect(readFocusFile('/c/gone.focus.json', 'landscape')).toBeUndefined();
});

// --- v2 (Modo Foco v2, Part 3 plan, task 7) ---

const ballLed = {
  ...valid,
  v: 2,
  model: 'dfine_s',
  sport: 'tenis',
  follow: 'ball',
  players: [[0.2, 0.2, 0.6, 0.6]],
  ball: [
    [0.5, 0.5, 0, 0.6],
    [0.51, 0.5, 1, 0],
  ],
};

test('a v2 file reads like v1: its own framing by default', () => {
  expect(parseFocusFile(JSON.stringify(ballLed), 'landscape')!.rects).toEqual(valid.landscape);
  expect(parseFocusFile(JSON.stringify(ballLed), 'landscape', 'ball')!.rects).toEqual(valid.landscape);
});

test('Seguir: Jogadores reads the players framing of the recorded shape only', () => {
  expect(parseFocusFile(JSON.stringify(ballLed), 'landscape', 'players')!.rects).toEqual([[0.2, 0.2, 0.6, 0.6]]);
  // The other shape has one framing.
  expect(parseFocusFile(JSON.stringify(ballLed), 'portrait', 'players')!.rects).toEqual(valid.portrait);
  // A players-framed v2 file, or a v1 file, has nothing else to show.
  const players = { ...valid, v: 2, follow: 'players' };
  expect(parseFocusFile(JSON.stringify(players), 'landscape', 'players')!.rects).toEqual(valid.landscape);
  expect(parseFocusFile(JSON.stringify(valid), 'landscape', 'players')!.rects).toEqual(valid.landscape);
});

test('the info says when the Seguir control can switch', () => {
  expect(parseFocusInfo(JSON.stringify(ballLed))).toEqual({ v: 2, follow: 'ball', hasBall: true });
  expect(parseFocusInfo(JSON.stringify(valid))).toEqual({ v: 1, follow: 'players', hasBall: false });
  const lost = { ...ballLed, ball: [[0, 0, 3, 0]] };
  expect(parseFocusInfo(JSON.stringify(lost))).toEqual({ v: 2, follow: 'ball', hasBall: false });
  const { players: _players, ...noPlayers } = ballLed;
  expect(parseFocusInfo(JSON.stringify(noPlayers))).toEqual({ v: 2, follow: 'ball', hasBall: false });
  expect(parseFocusInfo('{')).toBeUndefined();
});

