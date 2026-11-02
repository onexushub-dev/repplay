import { FIELD_TEST_UNLOCK_ALL } from './fieldTest';
import { PASS_PRODUCT_ID, type PassTransaction, type Plan, type Snapshot, type StartDecision } from './types';

export { FIELD_TEST_UNLOCK_ALL };

export function availableCredit(snapshot: Snapshot, spent: ReadonlySet<string>): PassTransaction | undefined {
  return snapshot.passTransactions
    .filter((t) => t.productId === PASS_PRODUCT_ID && !spent.has(t.id))
    .reduce<PassTransaction | undefined>((a, b) => (a === undefined || b.purchasedAt < a.purchasedAt ? b : a), undefined);
}

export function creditCount(snapshot: Snapshot, spent: ReadonlySet<string>): number {
  return snapshot.passTransactions.filter((t) => t.productId === PASS_PRODUCT_ID && !spent.has(t.id)).length;
}

/** What a plan may do: the plan itself, or everything (paid) while the field test unlocks it. Labels use the plan. */
export function accessPlan(plan: Plan): Plan {
  return FIELD_TEST_UNLOCK_ALL ? 'paid' : plan;
}

/**
 * Decides "Começar gravação": Pro makes a paid recording, anything else a free one. A Single Pass is never spent here:
 * it is used only when the player unlocks a recording already made ("Liberar recursos PRO nessa gravação").
 */
export function startPlan(input: { proActive: boolean }): StartDecision {
  return input.proActive ? { kind: 'pro' } : { kind: 'free' };
}

export function planOf(d: StartDecision): Plan {
  switch (d.kind) {
    case 'pro':
      return 'paid';
    case 'free':
      return 'free';
    default: {
      const unknown: never = d; // a new kind must choose its plan here, never fall into 'paid'
      return unknown;
    }
  }
}

/** The plan a stored session ran with: an explicit `paid` wins, else a bound Pass means paid. */
export function sessionPlan(s: { paid?: boolean; passTransactionId?: string }): Plan {
  if (s.paid !== undefined) return s.paid ? 'paid' : 'free';
  return s.passTransactionId ? 'paid' : 'free';
}

export function detectPurchase(before: Snapshot, after: Snapshot): { pro: boolean; passTransactionId?: string } {
  const pro = !before.proActive && after.proActive;
  const known = new Set(before.passTransactions.map((t) => t.id));
  const fresh = after.passTransactions.filter((t) => !known.has(t.id));
  if (fresh.length === 0) return { pro };
  const latest = fresh.reduce((a, b) => (b.purchasedAt > a.purchasedAt ? b : a));
  return { pro, passTransactionId: latest.id };
}
