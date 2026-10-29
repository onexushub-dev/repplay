import { Alert } from 'react-native';

import { repo } from '../data/mmkv';
import type { TFunction } from '../i18n';
import type { PaywallSource } from '../analytics/events';
import { openPaywall } from './feedback';
import { payments } from '.';

/** Asks whether the Pass goes to this recording or waits for the next one; resolves true for "this one". */
function askUsePass(t: TFunction): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('unlock.title'),
      t('unlock.message'),
      [
        { text: t('unlock.keep'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('unlock.use'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Unlocks Full HD and sound for a recording that is already made. Pro does it at once, a waiting Pass after the player
 * agrees to spend it here, and with neither the paywall opens first: what was bought then is offered the same way.
 * Returns whether the recording is paid now.
 */
export async function unlockRecording(sessionId: string, t: TFunction, source: PaywallSource = 'export_limit'): Promise<boolean> {
  let option = payments.unlockOption();
  if (option.kind === 'none') {
    const outcome = await openPaywall(t, source);
    if (outcome !== 'purchased' && outcome !== 'restored') return false;
    option = payments.unlockOption();
  }
  if (option.kind === 'none') return false;
  if (option.kind === 'credit') {
    // A Pass bought just now is a credit like any other: the player chooses between this recording and the next one.
    if (!(await askUsePass(t))) return false;
    return repo.upgradeSession(sessionId, { passTransactionId: option.passTransactionId }) !== undefined;
  }
  return repo.upgradeSession(sessionId, {}) !== undefined;
}
