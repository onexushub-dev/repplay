import { availableCredit, creditCount, detectPurchase, planOf, sessionPlan, startPlan } from '../rules';
import { EMPTY_SNAPSHOT, type PassTransaction, type Snapshot } from '../types';

const tx = (id: string, purchasedAt: number): PassTransaction => ({ id, productId: 'single_pass', purchasedAt });
const snap = (proActive: boolean, passTransactions: PassTransaction[] = []): Snapshot => ({ proActive, passTransactions });

test('detectPurchase', () => {
  expect(detectPurchase(EMPTY_SNAPSHOT, snap(true))).toEqual({ pro: true });
  expect(detectPurchase(snap(false, [tx('A', 1)]), snap(false, [tx('A', 1), tx('B', 2)]))).toEqual({
    pro: false,
    passTransactionId: 'B',
  });
  const same = detectPurchase(snap(false, [tx('A', 1)]), snap(false, [tx('A', 1)]));
  expect(same).toEqual({ pro: false });
  expect('passTransactionId' in same).toBe(false);
  expect(detectPurchase(snap(true), snap(true)).pro).toBe(false);
  expect(detectPurchase(EMPTY_SNAPSHOT, snap(false, [tx('X', 5), tx('Y', 9), tx('Z', 7)])).passTransactionId).toBe('Y');
});

test('availableCredit: the oldest single_pass not spent', () => {
  const A = tx('A', 1);
  const B = tx('B', 2);
  expect(availableCredit(EMPTY_SNAPSHOT, new Set())).toBeUndefined();
  expect(availableCredit(snap(false, [B, A]), new Set())).toBe(A);
  expect(availableCredit(snap(false, [B, A]), new Set(['A']))).toBe(B);
  expect(availableCredit(snap(false, [B, A]), new Set(['A', 'B']))).toBeUndefined();
  const other: PassTransaction = { id: 'O', productId: 'other', purchasedAt: 0 };
  expect(availableCredit(snap(false, [other]), new Set())).toBeUndefined();
});

test('creditCount counts unspent Passes', () => {
  expect(creditCount(snap(false, [tx('A', 1), tx('B', 2)]), new Set(['A']))).toBe(1);
});

test('startPlan: Pro makes a paid recording, anything else a free one (the plan never blocks, a Pass is never spent)', () => {
  expect(startPlan({ proActive: true })).toEqual({ kind: 'pro' });
  expect(startPlan({ proActive: false })).toEqual({ kind: 'free' });
});

test('planOf: paid for Pro, free for free', () => {
  expect(planOf({ kind: 'pro' })).toBe('paid');
  expect(planOf({ kind: 'free' })).toBe('free');
});

test('sessionPlan: an explicit paid flag beats the pass id', () => {
  expect(sessionPlan({ paid: true })).toBe('paid');
  expect(sessionPlan({ paid: false, passTransactionId: 'x' })).toBe('free');
  expect(sessionPlan({ passTransactionId: 'x' })).toBe('paid');
  expect(sessionPlan({})).toBe('free');
});
