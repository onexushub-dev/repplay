import { randomUUID } from 'expo-crypto';
import Constants from 'expo-constants';

import { kv } from '../data/mmkv';
import { type AnalyticsAdapter, createAnalytics } from './core';
import { createPostHogAdapter } from './posthogAdapter';
import { createSessionSummary } from './session';

// The vendor is chosen at start-up (initAnalytics); until then, and in builds without a key, events go nowhere.
let target: AnalyticsAdapter = { capture: () => {} };
let started = false;

export const analytics = createAnalytics({
  adapter: {
    capture: (name, props) => target.capture(name, props),
    screen: (name) => {
      if (target.screen) target.screen(name);
    },
    setEnabled: (on) => {
      if (target.setEnabled) target.setEnabled(on);
    },
  },
  kv,
  newId: randomUUID,
});

export const track = analytics.track;

/** The frequent small things (zooms, guides, exports...) gathered into one event per session. */
export const sessionSummary = createSessionSummary(analytics);

/** Reads the project key and host from app.config.js (`extra.posthog`); null when the build has none. */
function posthogConfig(): { key: string; host: string } | null {
  const expo = Constants.expoConfig;
  const extra = expo && expo.extra ? (expo.extra.posthog as { key?: string; host?: string } | undefined) : undefined;
  return extra && extra.key && extra.host ? { key: extra.key, host: extra.host } : null;
}

/** Starts analytics once, from the root layout: picks the vendor, begins the first session and sends `app_open`. */
export function initAnalytics(): void {
  if (started) return;
  started = true;
  const config = posthogConfig();
  if (config) {
    // Built on the first event that is actually sent, never before: the SDK talks to the server as soon as it exists, and
    // someone who opted out must not cause a single request.
    let client: AnalyticsAdapter | null = null;
    /** The SDK, built on first use; null when it failed to start (the app goes on without metrics). */
    const sdk = (): AnalyticsAdapter | null => {
      try {
        if (client === null) client = createPostHogAdapter({ ...config, installId: analytics.installId() });
      } catch {
        return null;
      }
      return client;
    };
    target = {
      capture(name, props) {
        const c = sdk();
        if (c !== null) c.capture(name, props);
      },
      screen(name) {
        const c = sdk();
        if (c !== null && c.screen) c.screen(name);
      },
      // Only an SDK that already exists is told: opting out must not be what starts it.
      setEnabled(on) {
        if (client !== null && client.setEnabled) client.setEnabled(on);
      },
    };
  }
  analytics.startSession();
  sessionSummary.start();
  analytics.track('app_open', { cold_start: true });
}
