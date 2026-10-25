import { availableCredit, creditCount, detectPurchase, freeLeft, monthKey, planOf, sessionPlan, startPlan } from '../rules';
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

test('startPlan: Pro, then the oldest credit, else free (a credit is not spent with Pro)', () => {
  const A = tx('A', 1);
  expect(startPlan({ proActive: true, credit: A, freeUsed: 5 })).toEqual({ kind: 'pro' });
  expect(startPlan({ proActive: false, credit: A, freeUsed: 3 })).toEqual({ kind: 'credit', passTransactionId: 'A' });
  expect(startPlan({ proActive: false, freeUsed: 0 })).toEqual({ kind: 'free' });
  expect(startPlan({ proActive: false, freeUsed: 2 })).toEqual({ kind: 'free' });
  expect(startPlan({ proActive: false, freeUsed: 3 })).toEqual({ kind: 'blocked' });
  expect(startPlan({ proActive: false, freeUsed: 4 })).toEqual({ kind: 'blocked' });
});

test('planOf: free only for the free decision', () => {
  expect(planOf({ kind: 'pro' })).toBe('paid');
  expect(planOf({ kind: 'credit', passTransactionId: 'A' })).toBe('paid');
  expect(planOf({ kind: 'free' })).toBe('free');
  expect(planOf({ kind: 'blocked' })).toBe('free');
});

test('sessionPlan: an explicit paid flag beats the pass id', () => {
  expect(sessionPlan({ paid: true })).toBe('paid');
  expect(sessionPlan({ paid: false, passTransactionId: 'x' })).toBe('free');
  expect(sessionPlan({ passTransactionId: 'x' })).toBe('paid');
  expect(sessionPlan({})).toBe('free');
});

test('monthKey is the local YYYY-MM', () => {
  expect(monthKey(new Date(2026, 0, 5).getTime())).toBe('2026-01');
  expect(monthKey(new Date(2026, 11, 31, 23, 59).getTime())).toBe('2026-12');
  expect(monthKey(new Date(2027, 0, 1, 0, 0).getTime())).toBe('2027-01');
});

test('freeLeft', () => {
  expect(freeLeft(0)).toBe(3);
  expect(freeLeft(2)).toBe(1);
  expect(freeLeft(7)).toBe(0);
});
