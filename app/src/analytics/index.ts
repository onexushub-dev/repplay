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
  adapter: { capture: (name, props) => target.capture(name, props) },
  kv,
  newId: randomUUID,
});

export const track = analytics.track;

/** The frequent small things (zooms, guides, exports...) gathered into one event per session. */
export const sessionSummary = createSessionSummary(analytics);

/** Reads the project key and host from app.config.js (`extra.posthog`); null when the build has none. */
function posthogConfig(): { key: string; host: string } | null {
  const extra = Constants.expoConfig?.extra?.posthog as { key?: string; host?: string } | undefined;
  return extra?.key && extra.host ? { key: extra.key, host: extra.host } : null;
}

/** Starts analytics once, from the root layout: picks the vendor, begins the first session and sends `app_open`. */
export function initAnalytics(): void {
  if (started) return;
  started = true;
  const config = posthogConfig();
  if (config) {
    try {
      target = createPostHogAdapter({ ...config, installId: analytics.installId() });
    } catch {
      // the SDK failed to start: the app goes on without metrics
    }
  }
  analytics.startSession();
  sessionSummary.start();
  analytics.track('app_open', { cold_start: true });
}
