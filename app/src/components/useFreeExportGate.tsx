import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { repo } from '../data/mmkv';
import { useT } from '../i18n/useT';
import { openPaywall } from '../payments/feedback';
import { unlockRecording } from '../payments/unlock';
import type { FreeLosses } from '../share/exportOptions';
import { FreeExportBrief, FreeExportSheet, type FreeExportChoice, type FreeExportKind } from './FreeExportSheet';

const NONE: FreeLosses = { focus: false, sound: false };

type Notice = { losses: FreeLosses; kind: FreeExportKind };

/** Longest wait for the sheet to finish closing on iOS before going on anyway. */
const DISMISS_FALLBACK_MS = 800;

/** How long the short note stays on screen. */
export const BRIEF_MS = 5000;

/**
 * The free-plan notice before an export, as a promise: `ask(sessionId, losses, kind)` resolves true when the export goes on;
 * render `sheet` once in the screen. Every export path (save, share, a batch) asks the same way.
 *
 * Counted per recording: its first free export opens the full sheet (what PRO adds and how the free video comes out, PRO, "Liberar
 * recursos PRO nessa gravação", continue, cancel); once the player continues, later exports of that recording show a
 * short note that never stops the export: how this video comes out, with "Liberar".
 *
 * An unlock opens its paywall only once the sheet has closed: the paywall is a native screen, and iOS drops one
 * presented while a Modal is still sliding away (it flashes and closes, and the Modal's layer keeps eating touches).
 */
export function useFreeExportGate(): {
  ask: (sessionId: string, losses: FreeLosses, kind: FreeExportKind) => Promise<boolean>;
  sheet: ReactNode;
} {
  const { t } = useT();
  const [open, setOpen] = useState<Notice | null>(null);
  const [brief, setBrief] = useState<{ sessionId: string; losses: FreeLosses } | null>(null);
  const request = useRef<{ sessionId: string; resolve: (go: boolean) => void } | null>(null);
  const waiting = useRef<{ choice: FreeExportChoice; timer: ReturnType<typeof setTimeout> } | null>(null);
  const briefTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (w.choice === 'pro') void openPaywall(t);
    if (w.choice === 'pass') void unlockRecording(r.sessionId, t);
  }, [t]);

  const showBrief = useCallback((sessionId: string, losses: FreeLosses) => {
    if (briefTimer.current) clearTimeout(briefTimer.current);
    setBrief({ sessionId, losses });
    briefTimer.current = setTimeout(() => setBrief(null), BRIEF_MS);
  }, []);

  const ask = useCallback(
    (sessionId: string, losses: FreeLosses, kind: FreeExportKind) =>
      new Promise<boolean>((resolve) => {
        const session = repo.getSession(sessionId);
        if (session && session.freeNoticeShown) {
          showBrief(sessionId, losses);
          resolve(true);
          return;
        }
        request.current = { sessionId, resolve };
        setOpen({ losses, kind });
      }),
    [showBrief],
  );

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
      if (briefTimer.current) clearTimeout(briefTimer.current);
    },
    [],
  );

  const onDismissed = useCallback(() => {
    const w = waiting.current;
    if (w && (w.choice === 'pro' || w.choice === 'pass')) settle();
  }, [settle]);

  const unlockFromBrief = useCallback(() => {
    const current = brief;
    if (briefTimer.current) clearTimeout(briefTimer.current);
    setBrief(null);
    if (current) void unlockRecording(current.sessionId, t);
  }, [brief, t]);

  return {
    ask,
    sheet: (
      <>
        <FreeExportSheet
          visible={open !== null}
          kind={open !== null ? open.kind : 'save'}
          losses={open !== null ? open.losses : NONE}
          onChoose={choose}
          onDismissed={onDismissed}
        />
        <FreeExportBrief losses={brief !== null ? brief.losses : null} onUnlock={unlockFromBrief} />
      </>
    ),
  };
}
