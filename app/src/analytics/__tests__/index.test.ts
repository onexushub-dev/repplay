const mockExtra: { posthog?: { key?: string; host?: string } } = {};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

type MockPostHog = { apiKey: string; options: Record<string, unknown>; capture: jest.Mock; screen: jest.Mock; optOut: jest.Mock; optIn: jest.Mock };

function load() {
  jest.resetModules();
  // A plain require, not requireMock: that one returns a second copy of the stand-in that the adapter never sees.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module registry per test needs a plain require
  const { PostHog } = require('posthog-react-native') as { PostHog: { instances: MockPostHog[] } };
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- same: the singleton must be rebuilt for each test
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

  test('with a key it builds the SDK once, anonymous, on the configured host, with autocapture, replay and person profiles off and lifecycle events on', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances).toHaveLength(1);
    expect(instances[0].apiKey).toBe('phc_test');
    expect(instances[0].options).toMatchObject({
      host: 'https://us.i.posthog.com',
      personProfiles: 'never',
      disableGeoip: true,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      errorTracking: { autocapture: false },
    });
  });

  test('the SDK is bootstrapped with the install id as its anonymous id', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances[0].options.bootstrap).toEqual({ distinctId: analytics.analytics.installId() });
  });

  test('it sends app_open as a cold start', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances[0].capture).toHaveBeenCalledWith('app_open', { cold_start: true });
  });

  test('initAnalytics twice builds the SDK once', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    analytics.initAnalytics();
    expect(instances).toHaveLength(1);
  });

  test('an opted-out install builds no SDK, so not even its start-up requests go out', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.analytics.setEnabled(false);
    analytics.initAnalytics();
    analytics.track('onboarding_completed');
    expect(instances).toHaveLength(0);
  });

  test('turning collection on later builds the SDK then, and sends from there', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.analytics.setEnabled(false);
    analytics.initAnalytics();
    analytics.analytics.setEnabled(true);
    analytics.track('onboarding_completed');
    expect(instances).toHaveLength(1);
    expect(instances[0].capture).toHaveBeenCalledWith('onboarding_completed', undefined);
  });

  test('the SDK asks the server for nothing but to receive events: no flags, surveys or remote config', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    expect(instances[0].options).toMatchObject({ preloadFeatureFlags: false, disableSurveys: true, disableRemoteConfig: true });
  });
});

describe('screen views and opt-out reach the SDK', () => {
  test('a screen view is sent as $screen through the SDK', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    analytics.analytics.screen('session/[id]');
    expect(instances[0].screen).toHaveBeenCalledWith('session/[id]');
  });

  test('opting out tells a running SDK, so its lifecycle events stop too', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.initAnalytics();
    analytics.analytics.setEnabled(false);
    expect(instances[0].optOut).toHaveBeenCalled();
  });

  test('opting out before anything was sent does not start the SDK', () => {
    mockExtra.posthog = { key: 'phc_test', host: 'https://us.i.posthog.com' };
    const { analytics, instances } = load();
    analytics.analytics.setEnabled(false);
    expect(instances).toHaveLength(0);
  });
});
