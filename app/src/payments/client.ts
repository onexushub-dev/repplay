import type { Offering, Snapshot } from './types';

export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'error';

export interface PaymentsClient {
  configure(): void;
  getSnapshot(): Promise<Snapshot>;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  /** The paywall of `offering` performs the purchase itself; callers never purchase directly. */
  showPaywall(offering: Offering): Promise<PaywallOutcome>;
  restore(): Promise<Snapshot>;
}
