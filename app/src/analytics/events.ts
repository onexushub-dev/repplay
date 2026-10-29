import type { RemotePairFailure } from '../../modules/replay-camera/src/ReplayCamera.types';
import type { ModeId, TriggerSource } from '../data/schema';

/** Where the paywall was opened from; `locked_feature` is a tap on something Pro-only (see pro_feature_blocked). */
export type PaywallSource = 'onboarding' | 'export_limit' | 'upgrade_card' | 'start_limit' | 'locked_feature';

/** A count sent as a range, so the number of distinct values stays small and nothing is a precise tally. */
export type CountBucket = '0' | '1' | '2-5' | '6-20' | '21+';
export type DurationBucket = '<1m' | '1-5m' | '5-30m' | '>30m';

/**
 * Every event the app may send, with the exact shape of its properties. This is the whole catalogue: `track()` accepts
 * nothing else, so a typo or a stray free-text property cannot reach the vendor. An event without properties is `undefined`.
 * Properties are closed unions, booleans or bucketed strings, never file names, device names or error messages.
 */
export type AnalyticsEvents = {
  // Usage and retention
  app_open: { cold_start: boolean };
  /** Sent once when the app goes to the background; the small things (zoom, guides, economy) live only in here. */
  session_summary: {
    clips: CountBucket;
    exports: CountBucket;
    zooms: CountBucket;
    guides: CountBucket;
    economy: CountBucket;
    top_trigger: TriggerSource | 'none';
    duration: DurationBucket;
  };

  // Onboarding
  onboarding_step_viewed: { step: 1 | 2 | 3 | 4 };
  onboarding_completed: undefined;
  onboarding_skipped: { step: 1 | 2 | 3 | 4 };
  permission_result: { kind: 'camera'; granted: boolean };

  // Recording
  clip_saved: { trigger: TriggerSource; mode: ModeId };
  trigger_failed: { trigger: TriggerSource; reason: 'save_failed' };

  // Editing and output
  clip_edit_tool_used: { tool: 'focus' | 'speed' | 'sound' | 'zoom' | 'rotate' };
  cut_suggestion_applied: undefined;
  focus_mode_used: undefined;
  export_completed: { quality: '1080p' | '1440p' | '2160p' };
  export_failed: { reason: 'prepare_failed' };
  /** `photos` is Salvar na galeria; `share_sheet` is Enviar (the share sheet does not say which app was picked). */
  clip_shared: { destination: 'photos' | 'share_sheet' };

  // Devices
  /** Reported by the remote phone, the one that pairs (the camera phone only offers the code). The Apple Watch pairs through iOS, not here. */
  pairing_completed: { method: 'qr' | 'code'; kind: 'remote' };
  pairing_failed: { reason: RemotePairFailure | 'invalid_link' };

  // Monetization
  paywall_viewed: { source: PaywallSource };
  purchase_completed: undefined;
  purchase_failed: { reason: 'error' };
  pro_feature_blocked: { feature: 'quality_4k' | 'clip_length' | 'bluetooth_remote' | 'watch' | 'compile' };
  free_export_limit_hit: undefined;
};

export type EventName = keyof AnalyticsEvents;

/** The properties argument of `track(name, ...)`: required for events that have properties, absent for the rest. */
export type EventArgs<E extends EventName> = AnalyticsEvents[E] extends undefined ? [] : [AnalyticsEvents[E]];
