import type { KV } from '../data/repo';
import type { EventArgs, EventName } from './events';

export type Props = Record<string, string | number | boolean>;

/** The only thing the app needs from a vendor SDK; src/analytics/posthogAdapter.ts is the one real implementation. */
export interface AnalyticsAdapter {
  capture(name: string, props?: Props): void;
}

export interface Analytics {
  track<E extends EventName>(name: E, ...props: EventArgs<E>): void;
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  installId(): string;
  /** Starts a new session: the per-session caps count from zero again. */
  startSession(): void;
}

const ID_KEY = 'analytics.installId';
const ENABLED_KEY = 'analytics.enabled';

const DEFAULT_CAP = 20;
// A busy evening can legitimately save and miss many clips; these two get more room before the cap drops a send.
const CAPS: Partial<Record<EventName, number>> = { clip_saved: 50, trigger_failed: 50 };

/**
 * Anonymous analytics core: owns the install id, the opt-out, the per-session cap and the guarantee that analytics
 * never throws into the app. Storage and the vendor are injected so tests run without either.
 */
export function createAnalytics(o: { adapter: AnalyticsAdapter; kv: KV; newId: () => string }): Analytics {
  const { adapter, kv, newId } = o;
  // Kept in memory too, so a storage that fails still gives a stable id and a working opt-out for this run.
  let id: string | null = null;
  let enabled: boolean | null = null;
  let counts = new Map<EventName, number>();

  function isEnabled(): boolean {
    if (enabled === null) {
      try {
        enabled = kv.getString(ENABLED_KEY) !== 'false';
      } catch {
        enabled = true;
      }
    }
    return enabled;
  }

  function installId(): string {
    if (id) return id;
    try {
      id = kv.getString(ID_KEY) ?? null;
    } catch {
      id = null;
    }
    if (!id) {
      id = newId();
      try {
        kv.set(ID_KEY, id);
      } catch {
        // not saved: this run keeps the id, the next one makes another
      }
    }
    return id;
  }

  return {
    track(name, ...args) {
      try {
        if (!isEnabled()) return;
        const sent = counts.get(name) ?? 0;
        if (sent >= (CAPS[name] ?? DEFAULT_CAP)) return;
        counts.set(name, sent + 1);
        adapter.capture(name, args[0] as Props | undefined);
      } catch {
        // analytics must never reach the app
      }
    },
    setEnabled(on) {
      enabled = on;
      try {
        kv.set(ENABLED_KEY, on ? 'true' : 'false');
      } catch {
        // kept in memory for this run
      }
    },
    isEnabled,
    installId,
    startSession() {
      counts = new Map();
    },
  };
}
