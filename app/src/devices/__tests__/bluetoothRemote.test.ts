import { learnRemoteAtPress, linkOf, remoteCandidates, resetRemoteLinkForTests } from '../bluetoothRemote';

jest.mock('../../../modules/replay-camera', () => ({ bluetoothConnected: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  let prefs: Record<string, unknown> = {};
  return {
    __reset: () => (prefs = {}),
    repo: {
      getPrefs: () => prefs,
      setPrefs: jest.fn((p: object) => (prefs = { ...prefs, ...p })),
    },
  };
});

const cam = jest.requireMock('../../../modules/replay-camera');
const { repo } = jest.requireMock('../../data/mmkv');

// The 2026-11-01 field test: the remote shows under Battery and Device Information, AirPods only under the latter.
const shutter = { id: 'AAAA', name: 'AB Shutter3', services: ['battery', 'info'] };
const airpods = { id: 'BBBB', name: 'AirPods Pro', services: ['info'] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('../../data/mmkv').__reset();
  resetRemoteLinkForTests();
});

test('a remote is a device with Battery or HID; AirPods (Device Information only) are not', () => {
  expect(remoteCandidates([shutter, airpods])).toEqual([shutter]);
  expect(remoteCandidates([{ id: 'C', name: 'x', services: ['hid'] }])).toHaveLength(1);
});

test('the link of the learnt remote: connected, missing, Bluetooth off, or unknown', () => {
  expect(linkOf({ state: 'on', devices: [shutter, airpods] }, 'AAAA')).toBe('connected');
  expect(linkOf({ state: 'on', devices: [airpods] }, 'AAAA')).toBe('missing');
  expect(linkOf({ state: 'off', devices: [] }, 'AAAA')).toBe('bluetoothOff');
  expect(linkOf({ state: 'unauthorized', devices: [] }, 'AAAA')).toBeUndefined();
  expect(linkOf({ state: 'on', devices: [shutter] }, undefined)).toBeUndefined();
  expect(linkOf(undefined, 'AAAA')).toBeUndefined();
});

test('at a press, the one connected remote is learnt (asking for Bluetooth then)', async () => {
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter, airpods] });
  await learnRemoteAtPress();
  expect(cam.bluetoothConnected).toHaveBeenCalledWith(true);
  expect(repo.getPrefs()).toMatchObject({ remoteBleId: 'AAAA', remoteBleName: 'AB Shutter3' });
});

test('two possible remotes: nothing is guessed', async () => {
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter, { ...shutter, id: 'CCCC' }] });
  await learnRemoteAtPress();
  expect(repo.getPrefs().remoteBleId).toBeUndefined();
});

test('a new remote replaces the old one; the old one still connected stays', async () => {
  repo.setPrefs({ remoteBleId: 'OLD' });
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] });
  await learnRemoteAtPress();
  expect(repo.getPrefs().remoteBleId).toBe('AAAA');

  repo.setPrefs({ remoteBleId: 'AAAA' });
  cam.bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter, { ...shutter, id: 'DDDD' }] });
  await learnRemoteAtPress();
  expect(repo.getPrefs().remoteBleId).toBe('AAAA');
});

test('no Bluetooth (off, denied, Android): the press counts, nothing is learnt', async () => {
  cam.bluetoothConnected.mockResolvedValue({ state: 'unauthorized', devices: [] });
  await learnRemoteAtPress();
  cam.bluetoothConnected.mockResolvedValue(undefined);
  await learnRemoteAtPress();
  cam.bluetoothConnected.mockRejectedValue(new Error('x'));
  await learnRemoteAtPress();
  expect(repo.getPrefs().remoteBleId).toBeUndefined();
});
