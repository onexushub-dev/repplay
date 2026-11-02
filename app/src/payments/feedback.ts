import { Alert } from 'react-native';

import type { TFunction } from '../i18n';
import type { PaywallOutcome } from './client';
import type { Offering } from './types';
import { payments } from '.';

/**
 * Opens the paywall: Pro (`default`) or the Single Pass (`pass`). A cancel is silent; a failure (no key, load error,
 * unreadable purchases) gets a short notice. Returns the outcome.
 */
export async function openPaywall(t: TFunction, offering: Offering = 'default'): Promise<PaywallOutcome> {
  const outcome = await payments.showPaywall(offering);
  if (outcome === 'error') Alert.alert(t('payments.paywallError'));
  return outcome;
}

/** Restores purchases and says what happened. */
export async function restorePurchases(t: TFunction): Promise<void> {
  const restored = await payments.restore();
  if (restored === true) Alert.alert(t('payments.restored'));
  else if (restored === false) Alert.alert(t('payments.nothingToRestore'));
}
