import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { analytics } from '.';

/** The route pattern of the current screen (`clip/[id]`, `session/[id]`, `index`): never the ids in the URL. */
export function screenName(segments: readonly string[]): string {
  return segments.length === 0 ? 'index' : segments.join('/');
}

/** Sends one `$screen` each time the visible route changes. Mounted once, in the root layout. */
export function useScreenViews(): void {
  const name = screenName(useSegments());
  useEffect(() => {
    analytics.screen(name);
  }, [name]);
}
