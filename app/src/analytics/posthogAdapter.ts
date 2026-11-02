import { PostHog } from 'posthog-react-native';

import type { AnalyticsAdapter } from './core';

/**
 * The only file that talks to the vendor SDK. Everything that could identify or follow a person is off: no person
 * profiles, no GeoIP, no autocapture of touches or exceptions, no session replay. On: the SDK's app lifecycle events
 * (installed, updated, opened, backgrounded) and screen views by route pattern, which PostHog's built-in dashboards
 * need for users, sessions and devices. The SDK starts from the install id, so retention is counted per install and
 * nothing links an install to a person. Country is not known (no IP, no GeoIP); `$locale` and `$timezone` stand in.
 */
export function createPostHogAdapter(o: { key: string; host: string; installId: string }): AnalyticsAdapter {
  const client = new PostHog(o.key, {
    host: o.host,
    personProfiles: 'never',
    disableGeoip: true,
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    errorTracking: { autocapture: false },
    // The SDK only receives events: no flags, surveys or remote config are asked of the server.
    preloadFeatureFlags: false,
    disableSurveys: true,
    disableRemoteConfig: true,
    bootstrap: { distinctId: o.installId },
  });
  return {
    capture: (name, props) => void client.capture(name, props),
    screen: (name) => void client.screen(name),
    setEnabled: (on) => void (on ? client.optIn() : client.optOut()),
  };
}
