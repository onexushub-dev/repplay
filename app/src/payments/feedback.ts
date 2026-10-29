import { Alert } from 'react-native';

import { track } from '../analytics';
import type { PaywallSource } from '../analytics/events';
import type { TFunction } from '../i18n';
import type { PaywallOutcome } from './client';
import { payments } from '.';

/**
 * Opens the paywall (a Pass bought is a credit for a later start). A cancel is silent; a failure (no key, load error,
 * unreadable purchases) gets a short notice. Returns the outcome. `source` says which screen asked, for the metrics.
 */
export async function openPaywall(t: TFunction, source: PaywallSource): Promise<PaywallOutcome> {
  track('paywall_viewed', { source });
  const outcome = await payments.showPaywall();
  if (outcome === 'purchased') track('purchase_completed');
  if (outcome === 'error') track('purchase_failed', { reason: 'error' });
  if (outcome === 'error') Alert.alert(t('payments.paywallError'));
  return outcome;
}

/** Restores purchases and says what happened. */
export async function restorePurchases(t: TFunction): Promise<void> {
  const restored = await payments.restore();
  if (restored === true) Alert.alert(t('payments.restored'));
  else if (restored === false) Alert.alert(t('payments.nothingToRestore'));
}
