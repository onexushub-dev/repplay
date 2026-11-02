import type { AnalyticsAdapter, Props } from './core';

/** A stand-in vendor for tests: records every capture, screen view and opt-out instead of sending them. */
export function createFakeAdapter(): AnalyticsAdapter & {
  calls: { name: string; props?: Props }[];
  screens: string[];
  enabled: boolean[];
} {
  const calls: { name: string; props?: Props }[] = [];
  const screens: string[] = [];
  const enabled: boolean[] = [];
  return {
    calls,
    screens,
    enabled,
    capture: (name, props) => void calls.push({ name, props }),
    screen: (name) => void screens.push(name),
    setEnabled: (on) => void enabled.push(on),
  };
}
