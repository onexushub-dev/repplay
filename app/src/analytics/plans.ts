import type { Plan } from '../payments/types';
import type { ExportPlan } from './events';

/**
 * Who paid for an export, for the metrics: the free plan; a Single Pass, when the recording carries one; PRO otherwise.
 * `plan` is the plan the export ran with (useViewPlan), not the field-test unlock, so a free player stays `free`.
 */
export function exportPlanOf(plan: Plan, session: { passTransactionId?: string } | undefined): ExportPlan {
  if (plan === 'free') return 'free';
  if (session !== undefined && session.passTransactionId !== undefined) return 'pass';
  return 'pro';
}
