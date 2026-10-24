export type PassTransaction = { id: string; productId: string; purchasedAt: number };

export type Snapshot = { proActive: boolean; passTransactions: PassTransaction[] };

export const EMPTY_SNAPSHOT: Snapshot = { proActive: false, passTransactions: [] };

export const PRO_ENTITLEMENT = 'pro';
export const PASS_PRODUCT_ID = 'single_pass';

export type Plan = 'free' | 'paid';

export type StartDecision =
  | { kind: 'pro' }
  | { kind: 'credit'; passTransactionId: string }
  | { kind: 'free' }
  | { kind: 'blocked' };

/** What could unlock a recording already made: Pro (free of charge), the oldest unused Pass, or nothing yet. */
export type UnlockOption = { kind: 'pro' } | { kind: 'credit'; passTransactionId: string } | { kind: 'none' };
