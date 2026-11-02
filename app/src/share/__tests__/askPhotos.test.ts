import { getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';

import { track } from '../../analytics';
import { askPhotos } from '../askPhotos';

jest.mock('expo-media-library', () => ({ getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn() }));
jest.mock('../../analytics', () => ({ track: jest.fn() }));

const before = getPermissionsAsync as jest.Mock;
const ask = requestPermissionsAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test('the first prompt reports its answer', async () => {
  before.mockResolvedValue({ status: 'undetermined' });
  ask.mockResolvedValue({ granted: false });
  await expect(askPhotos()).resolves.toBe(false);
  expect(track).toHaveBeenCalledWith('permission_result', { kind: 'photos', granted: false });
});

test('a permission already decided reports nothing', async () => {
  before.mockResolvedValue({ status: 'granted' });
  ask.mockResolvedValue({ granted: true });
  await expect(askPhotos()).resolves.toBe(true);
  expect(track).not.toHaveBeenCalled();
});

test('a status that cannot be read still asks, and reports nothing', async () => {
  before.mockRejectedValue(new Error('no'));
  ask.mockResolvedValue({ granted: true });
  await expect(askPhotos()).resolves.toBe(true);
  expect(track).not.toHaveBeenCalled();
});
