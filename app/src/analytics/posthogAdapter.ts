import { PostHog } from 'posthog-react-native';

import type { AnalyticsAdapter } from './core';

/**
 * The only file that talks to the vendor SDK. Everything that could identify or follow a person is off: no person
 * profiles, no GeoIP, no autocapture of touches or exceptions, no session replay, no automatic lifecycle events. The
 * SDK starts from the install id, so retention is counted per install and nothing links an install to a person.
 */
export function createPostHogAdapter(o: { key: string; host: string; installId: string }): AnalyticsAdapter {
  const client = new PostHog(o.key, {
    host: o.host,
    personProfiles: 'never',
    disableGeoip: true,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    errorTracking: { autocapture: false },
    bootstrap: { distinctId: o.installId },
  });
  return {
    capture: (name, props) => void client.capture(name, props),
  };
}
