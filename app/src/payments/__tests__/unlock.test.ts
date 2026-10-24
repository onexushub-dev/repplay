import { Alert } from 'react-native';

import { translate } from '../../i18n';
import { unlockRecording } from '../unlock';
import { repo } from '../../data/mmkv';
import { payments } from '..';

jest.mock('..', () => ({ payments: { showPaywall: jest.fn(), unlockOption: jest.fn() } }));
jest.mock('../../data/mmkv', () => ({ repo: { upgradeSession: jest.fn(() => ({ id: 's1', paid: true })) } }));

const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('pt-BR', key, params);
const showPaywall = payments.showPaywall as jest.Mock;
const unlockOption = payments.unlockOption as jest.Mock;
const upgradeSession = repo.upgradeSession as jest.Mock;
const alert = jest.spyOn(Alert, 'alert');

/** Presses the named button of the question the app just asked. */
function answer(label: string) {
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
  buttons.find((b) => b.text === label)!.onPress!();
}

beforeEach(() => {
  jest.clearAllMocks();
  alert.mockImplementation(() => {});
});

test('Pro unlocks the recording at once, spending nothing and asking nothing', async () => {
  unlockOption.mockReturnValue({ kind: 'pro' });
  await expect(unlockRecording('s1', t)).resolves.toBe(true);
  expect(upgradeSession).toHaveBeenCalledWith('s1', {});
  expect(showPaywall).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

test('a waiting Pass is spent on this recording only after the player agrees', async () => {
  unlockOption.mockReturnValue({ kind: 'credit', passTransactionId: 'tx-1' });
  const done = unlockRecording('s1', t);
  expect(upgradeSession).not.toHaveBeenCalled();
  answer(t('unlock.use'));
  await expect(done).resolves.toBe(true);
  expect(upgradeSession).toHaveBeenCalledWith('s1', { passTransactionId: 'tx-1' });
});

test('"Keep for the next one" leaves the Pass and the recording as they were', async () => {
  unlockOption.mockReturnValue({ kind: 'credit', passTransactionId: 'tx-1' });
  const done = unlockRecording('s1', t);
  answer(t('unlock.keep'));
  await expect(done).resolves.toBe(false);
  expect(upgradeSession).not.toHaveBeenCalled();
});

test('with nothing to spend the paywall opens, and a cancel changes nothing', async () => {
  unlockOption.mockReturnValue({ kind: 'none' });
  showPaywall.mockResolvedValue('cancelled');
  await expect(unlockRecording('s1', t)).resolves.toBe(false);
  expect(showPaywall).toHaveBeenCalledTimes(1);
  expect(upgradeSession).not.toHaveBeenCalled();
});

test('a Pass bought in the paywall is offered for this recording', async () => {
  unlockOption.mockReturnValueOnce({ kind: 'none' }).mockReturnValue({ kind: 'credit', passTransactionId: 'tx-2' });
  showPaywall.mockResolvedValue('purchased');
  const done = unlockRecording('s1', t);
  await new Promise((r) => setTimeout(r, 0));
  answer(t('unlock.use'));
  await expect(done).resolves.toBe(true);
  expect(upgradeSession).toHaveBeenCalledWith('s1', { passTransactionId: 'tx-2' });
});

test('a subscription bought in the paywall unlocks the recording without asking', async () => {
  unlockOption.mockReturnValueOnce({ kind: 'none' }).mockReturnValue({ kind: 'pro' });
  showPaywall.mockResolvedValue('purchased');
  await expect(unlockRecording('s1', t)).resolves.toBe(true);
  expect(upgradeSession).toHaveBeenCalledWith('s1', {});
  expect(alert).not.toHaveBeenCalled();
});
