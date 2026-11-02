import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { track } from '../analytics';
import type { PaywallSource } from '../analytics/events';
import { repo } from '../data/mmkv';
import { useT } from '../i18n/useT';
import { openPaywall } from '../payments/feedback';
import { unlockRecording } from '../payments/unlock';
import type { FreeLosses } from '../share/exportOptions';
import { FreeExportSheet, type FreeExportChoice, type FreeExportKind } from './FreeExportSheet';

const NONE: FreeLosses = { focus: false, sound: false };

type Notice = { losses: FreeLosses; kind: FreeExportKind; preview: ExportPreview | null; many: boolean };

/** What the sheet shows of the clips: a frame for its previews, and whether more than one clip leaves at once. */
export type FreeExportExtras = { preview?: ExportPreview; many?: boolean };
type ExportPreview = { path: string; atMs: number };

/** Longest wait for the sheet to finish closing on iOS before going on anyway. */
const DISMISS_FALLBACK_MS = 800;

/**
 * The free-plan notice before an export, as a promise: `ask(sessionId, losses, kind, extras)` resolves true when the export goes on;
 * render `sheet` once in the screen. Every export path (save, share, a batch) asks the same way.
 *
 * Counted per recording: its first free export opens the full sheet (the clip as the free plan and as PRO export it, PRO,
 * "Assinar o PRO", "Só para esta gravação", continue, cancel); once the player continues, later exports of that recording go on
 * with no notice at all.
 *
 * An unlock opens its paywall only once the sheet has closed: the paywall is a native screen, and iOS drops one
 * presented while a Modal is still sliding away (it flashes and closes, and the Modal's layer keeps eating touches).
 */
export function useFreeExportGate(): {
  ask: (sessionId: string, losses: FreeLosses, kind: 'save' | 'share', extras?: FreeExportExtras) => Promise<boolean>;
  offer: (sessionId: string, losses: FreeLosses, extras?: FreeExportExtras) => void;
  sheet: ReactNode;
} {
  const { t } = useT();
  const [open, setOpen] = useState<Notice | null>(null);
  // `source` is where the sheet was opened from, for the metrics of the paywall it may lead to.
  const request = useRef<{ sessionId: string; resolve: (go: boolean) => void; source: PaywallSource } | null>(null);
  const waiting = useRef<{ choice: FreeExportChoice; timer: ReturnType<typeof setTimeout> } | null>(null);

  const settle = useCallback(() => {
    const w = waiting.current;
    if (!w) return;
    waiting.current = null;
    clearTimeout(w.timer);
    const r = request.current;
    request.current = null;
    if (!r) return;
    if (w.choice === 'go') repo.markFreeNoticeShown(r.sessionId);
    r.resolve(w.choice === 'go');
    if (w.choice === 'pro') void openPaywall(t, r.source);
    if (w.choice === 'pass') void unlockRecording(r.sessionId, t, r.source);
  }, [t]);

  const ask = useCallback(
    (sessionId: string, losses: FreeLosses, kind: 'save' | 'share', extras: FreeExportExtras = {}) =>
      new Promise<boolean>((resolve) => {
        const session = repo.getSession(sessionId);
        // The player already saw the sheet for this recording: the export goes on with nothing in the way.
        if (session && session.freeNoticeShown) {
          resolve(true);
          return;
        }
        track('free_export_limit_hit');
        request.current = { sessionId, resolve, source: 'export_limit' };
        setOpen({ losses, kind, preview: extras.preview ?? null, many: extras.many === true });
      }),
    [],
  );

  /**
   * The same sheet from a recording's PRO card, with nothing being exported: PRO or the Single Pass for this recording,
   * or close it. It opens every time it is asked for, whatever the recording has shown before.
   */
  const offer = useCallback((sessionId: string, losses: FreeLosses, extras: FreeExportExtras = {}) => {
    request.current = { sessionId, resolve: () => {}, source: 'upgrade_card' };
    setOpen({ losses, kind: 'unlock', preview: extras.preview ?? null, many: extras.many === true });
  }, []);

  const choose = useCallback(
    (choice: FreeExportChoice) => {
      setOpen(null);
      const unlocking = choice === 'pro' || choice === 'pass';
      const timer = setTimeout(settle, unlocking && Platform.OS === 'ios' ? DISMISS_FALLBACK_MS : 0);
      waiting.current = { choice, timer };
    },
    [settle],
  );

  useEffect(
    () => () => {
      if (waiting.current) clearTimeout(waiting.current.timer);
    },
    [],
  );

  const onDismissed = useCallback(() => {
    const w = waiting.current;
    if (w && (w.choice === 'pro' || w.choice === 'pass')) settle();
  }, [settle]);

  return {
    ask,
    offer,
    sheet: (
      <FreeExportSheet
        visible={open !== null}
        kind={open !== null ? open.kind : 'save'}
        losses={open !== null ? open.losses : NONE}
        preview={open !== null ? open.preview : null}
        many={open !== null && open.many}
        onChoose={choose}
        onDismissed={onDismissed}
      />
    ),
  };
}
