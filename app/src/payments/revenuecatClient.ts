import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

import type { PaymentsClient, PaywallOutcome } from './client';
import { toSnapshot } from './snapshot';
import { EMPTY_SNAPSHOT } from './types';

export type RevenueCatKeys = { ios?: string; android?: string; test?: string };

/** Public SDK key for this build: the test_ key wins in development, otherwise the platform's own key. */
export function pickApiKey(keys: RevenueCatKeys, os: string, dev: boolean): string | undefined {
  if (dev && keys.test) return keys.test;
  const key = os === 'ios' ? keys.ios : os === 'android' ? keys.android : undefined;
  return key || undefined;
}

export function outcomeFor(result: string): PaywallOutcome {
  const R = RevenueCatUI.PAYWALL_RESULT;
  if (result === R.PURCHASED) return 'purchased';
  if (result === R.RESTORED) return 'restored';
  if (result === R.CANCELLED) return 'cancelled';
  return 'error';
}

export function createRevenueCatClient(): PaymentsClient {
  let configured = false;
  let attempted = false;

  return {
    configure(): void {
      if (attempted) return; // once per app launch
      attempted = true;
      const keys = (Constants.expoConfig?.extra?.revenueCat ?? {}) as RevenueCatKeys;
      const apiKey = pickApiKey(keys, Platform.OS, __DEV__);
      if (!apiKey) {
        // In a development build, say why the paywall will fail.
        if (__DEV__) console.warn(`[payments] no RevenueCat key in this build (keys set: ${Object.keys(keys).filter((k) => keys[k as keyof RevenueCatKeys]).join(', ') || 'none'})`);
        return; // no key: the app runs as free
      }
      try {
        Purchases.configure({ apiKey });
        configured = true;
      } catch (e) {
        if (__DEV__) console.warn('[payments] RevenueCat configure failed', e);
        // a failing SDK must not crash launch: stay unconfigured, the app runs as free
      }
    },

    async getSnapshot() {
      if (!configured) return EMPTY_SNAPSHOT;
      return toSnapshot(await Purchases.getCustomerInfo());
    },

    onSnapshot(fn) {
      if (!configured) return () => {};
      const listener = (info: CustomerInfo) => fn(toSnapshot(info));
      Purchases.addCustomerInfoUpdateListener(listener);
      return () => void Purchases.removeCustomerInfoUpdateListener(listener);
    },

    async showPaywall() {
      if (!configured) {
        if (__DEV__) console.warn('[payments] paywall: RevenueCat is not configured in this build');
        return 'error';
      }
      try {
        const result = await RevenueCatUI.presentPaywall({ displayCloseButton: true });
        if (__DEV__ && result === RevenueCatUI.PAYWALL_RESULT.ERROR) console.warn('[payments] paywall returned ERROR (see the [RevenueCat] logs)');
        return outcomeFor(result);
      } catch (e) {
        if (__DEV__) console.warn('[payments] paywall failed', e);
        return 'error';
      }
    },

    async restore() {
      if (!configured) return EMPTY_SNAPSHOT;
      return toSnapshot(await Purchases.restorePurchases());
    },
  };
}
