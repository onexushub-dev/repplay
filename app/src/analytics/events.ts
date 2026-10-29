import type { ModeId, TriggerSource } from '../data/schema';
import type { Quality } from '../../modules/replay-camera/src/ReplayCamera.types';

/**
 * Every event the app may send, with the exact shape of its properties. This is the whole catalogue: `track()` accepts
 * nothing else, so a typo or a stray free-text property cannot reach the vendor. An event without properties is `undefined`.
 * Properties are closed unions, booleans or bucketed strings, never file names, device names or error messages.
 */
export type AnalyticsEvents = {
  // Usage and retention
  app_open: { cold_start: boolean };

  // Onboarding
  onboarding_step_viewed: { step: 1 | 2 | 3 | 4 };
  onboarding_completed: undefined;
  onboarding_skipped: { step: 1 | 2 | 3 | 4 };
  permission_result: { kind: 'camera'; granted: boolean };

  // Recording
  clip_saved: { trigger: TriggerSource; mode: ModeId };
  trigger_failed: { trigger: TriggerSource; reason: string };

  // Editing and output
  clip_edit_tool_used: { tool: string };
  cut_suggestion_applied: undefined;
  focus_mode_used: undefined;
  export_completed: { quality: Quality | 'other' };
  export_failed: { reason: string };
  clip_shared: { destination: string };

  // Devices
  pairing_completed: { method: 'qr' | 'link'; kind: 'remote' | 'watch' };
  pairing_failed: { reason: string };

  // Monetization
  paywall_viewed: { source: 'onboarding' | 'export_limit' | 'upgrade_card' | 'start_limit' | 'other' };
  purchase_completed: undefined;
  purchase_failed: { reason: 'error' };
  pro_feature_blocked: { feature: string };
  free_export_limit_hit: undefined;
};

export type EventName = keyof AnalyticsEvents;

/** The properties argument of `track(name, ...)`: required for events that have properties, absent for the rest. */
export type EventArgs<E extends EventName> = AnalyticsEvents[E] extends undefined ? [] : [AnalyticsEvents[E]];
