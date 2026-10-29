import type { AnalyticsAdapter, Props } from './core';

/** A stand-in vendor for tests: records every capture instead of sending it. */
export function createFakeAdapter(): AnalyticsAdapter & { calls: { name: string; props?: Props }[] } {
  const calls: { name: string; props?: Props }[] = [];
  return {
    calls,
    capture: (name, props) => void calls.push({ name, props }),
  };
}
