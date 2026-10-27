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

export const FREE_RECORDINGS_PER_MONTH = 3;

/** The local calendar month, `YYYY-MM`. */
export function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function freeLeft(freeUsed: number): number {
  return Math.max(0, FREE_RECORDINGS_PER_MONTH - freeUsed);
}

/** Decides "Começar gravação": Pro, else the oldest unused Pass, else the free plan while the month has room, else blocked. A credit is not spent with Pro. */
export function startPlan(input: { proActive: boolean; credit?: PassTransaction; freeUsed: number }): StartDecision {
  if (input.proActive) return { kind: 'pro' };
  if (input.credit) return { kind: 'credit', passTransactionId: input.credit.id };
  // The field test never runs out of free recordings: the game is still a free one, with everything unlocked.
  if (input.freeUsed < FREE_RECORDINGS_PER_MONTH || FIELD_TEST_UNLOCK_ALL) return { kind: 'free' };
  return { kind: 'blocked' };
}

export function planOf(d: StartDecision): Plan {
  switch (d.kind) {
    case 'pro':
    case 'credit':
      return 'paid';
    case 'free':
    case 'blocked':
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
