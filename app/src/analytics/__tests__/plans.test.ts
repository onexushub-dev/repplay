import { exportPlanOf } from '../plans';

test('a free export is free, whatever the recording carries', () => {
  expect(exportPlanOf('free', undefined)).toBe('free');
  expect(exportPlanOf('free', { passTransactionId: 'tx1' })).toBe('free');
});

test('a paid export is a Single Pass when the recording carries one, PRO otherwise', () => {
  expect(exportPlanOf('paid', { passTransactionId: 'tx1' })).toBe('pass');
  expect(exportPlanOf('paid', {})).toBe('pro');
  expect(exportPlanOf('paid', undefined)).toBe('pro');
});
