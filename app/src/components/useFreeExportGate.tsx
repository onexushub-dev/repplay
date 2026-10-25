import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { FreeExportSheet, type FreeExportChoice } from './FreeExportSheet';

/** Longest wait for the sheet to finish closing on iOS before going on anyway. */
const DISMISS_FALLBACK_MS = 800;

/**
 * The free-plan notice before an export, as a promise: `ask` opens the sheet and resolves with the choice; render
 * `sheet` once in the screen. Every export path (save, share, compile) asks the same way.
 *
 * "Unlock" resolves only once the sheet has closed: the paywall is a native screen, and iOS drops one presented while a
 * Modal is still sliding away (it flashes and closes, and the Modal's layer keeps eating touches).
 */
export function useFreeExportGate(): { ask: (o: { focusLost: boolean }) => Promise<FreeExportChoice>; sheet: ReactNode } {
  const [open, setOpen] = useState<{ focusLost: boolean } | null>(null);
  const resolver = useRef<((c: FreeExportChoice) => void) | null>(null);
  const waiting = useRef<{ choice: FreeExportChoice; timer: ReturnType<typeof setTimeout> } | null>(null);

  const settle = useCallback(() => {
    const w = waiting.current;
    if (!w) return;
    waiting.current = null;
    clearTimeout(w.timer);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(w.choice);
  }, []);

  const ask = useCallback(
    (o: { focusLost: boolean }) =>
      new Promise<FreeExportChoice>((resolve) => {
        resolver.current = resolve;
        setOpen(o);
      }),
    [],
  );
  const choose = useCallback(
    (choice: FreeExportChoice) => {
      setOpen(null);
      const timer = setTimeout(settle, choice === 'unlock' && Platform.OS === 'ios' ? DISMISS_FALLBACK_MS : 0);
      waiting.current = { choice, timer };
    },
    [settle],
  );
  useEffect(() => () => {
    if (waiting.current) clearTimeout(waiting.current.timer);
  }, []);

  const onDismissed = useCallback(() => {
    if (waiting.current?.choice === 'unlock') settle();
  }, [settle]);
  return { ask, sheet: <FreeExportSheet visible={open !== null} focusLost={open?.focusLost ?? false} onChoose={choose} onDismissed={onDismissed} /> };
}
