const mockExtra: { posthog?: { key?: string; host?: string } } = {};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

type MockPostHog = { apiKey: string; options: Record<string, unknown>; capture: jest.Mock };

function load() {
  jest.resetModules();
  // A plain require, not requireMock: that one returns a second copy of the stand-in that the adapter never sees.
  const { PostHog } = require('posthog-react-native') as { PostHog: { instances: MockPostHog[] } };
  const analytics = require('../index') as typeof import('../index');
  return { analytics, instances: PostHog.instances };
}

beforeEach(() => {
  delete mockExtra.posthog;
});

describe('initAnalytics', () => {
  test('without a key it builds no SDK and track does not throw', () => {
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances).toHaveLength(0);
    expect(() => analytics.track('onboarding_completed')).not.toThrow();
  });

  test('with a key it builds the SDK once, anonymous, on the EU host, with every automatic capture off', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://eu.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances).toHaveLength(1);
    expect(instances[0].apiKey).toBe('phc_test');
    expect(instances[0].options).toMatchObject({
      host: 'https://eu.i.posthog.com',
      personProfiles: 'never',
      disableGeoip: true,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      errorTracking: { autocapture: false },
    });
  });

  test('the SDK is bootstrapped with the install id as its anonymous id', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://eu.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances[0].options.bootstrap).toEqual({ distinctId: analytics.analytics.installId() });
  });

  test('it sends app_open as a cold start', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://eu.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances[0].capture).toHaveBeenCalledWith('app_open', { cold_start: true });
  });

  test('initAnalytics twice builds the SDK once', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://eu.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    analytics.initAnalytics();
    expect(instances).toHaveLength(1);
  });

  test('an opted-out install sends nothing, not even app_open', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://eu.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.analytics.setEnabled(false);
    analytics.initAnalytics();
    analytics.track('onboarding_completed');
    expect(instances[0]?.capture ?? { mock: { calls: [] } }).toHaveProperty('mock.calls', []);
  });
});
