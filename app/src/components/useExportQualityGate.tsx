import { useCallback, useRef, useState, type ReactNode } from 'react';

import type { ShortSide } from '../share/exportSize';
import { type ExportQualityAsk, ExportQualitySheet } from './ExportQualitySheet';

const NONE: ExportQualityAsk = { choices: [1080], landscape: false, durationMs: 0, sound: false };

/**
 * The export size of a 4K clip, as a promise: `ask` opens the sheet and resolves with the size, or null for Cancelar;
 * render `sheet` once in the screen.
 */
export function useExportQualityGate(): { ask: (o: ExportQualityAsk) => Promise<ShortSide | null>; sheet: ReactNode } {
  const [open, setOpen] = useState<ExportQualityAsk | null>(null);
  const resolver = useRef<((side: ShortSide | null) => void) | null>(null);

  const ask = useCallback(
    (o: ExportQualityAsk) =>
      new Promise<ShortSide | null>((resolve) => {
        resolver.current = resolve;
        setOpen(o);
      }),
    [],
  );
  const choose = useCallback((side: ShortSide | null) => {
    setOpen(null);
    const resolve = resolver.current;
    resolver.current = null;
    if (resolve) resolve(side);
  }, []);

  return { ask, sheet: <ExportQualitySheet visible={open !== null} ask={open !== null ? open : NONE} onChoose={choose} /> };
}
