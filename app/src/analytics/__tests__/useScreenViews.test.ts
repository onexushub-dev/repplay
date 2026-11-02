import { screenName } from '../useScreenViews';

jest.mock('expo-router', () => ({ useSegments: () => [] }));
jest.mock('..', () => ({ analytics: { screen: jest.fn() } }));

test('a screen is named by its route pattern, never by the ids in the URL', () => {
  expect(screenName([])).toBe('index');
  expect(screenName(['games'])).toBe('games');
  expect(screenName(['clip', '[id]'])).toBe('clip/[id]');
});
