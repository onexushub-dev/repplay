import type { AnalyzeFocusOptions, FocusAnalysis } from '../../modules/replay-camera/src/ReplayCamera.types';
import { focusPath } from '../data/focusFile';
import type { Repo } from '../data/repo';
import type { Clip } from '../data/schema';

export type FocusQueueDeps = {
  analyze(opts: AnalyzeFocusOptions): Promise<FocusAnalysis>;
  /** Stops the native analysis of this clip file. */
  cancel(clipPath: string): void;
  supported(): boolean;
  repo: Pick<Repo, 'getClip' | 'updateClip'>;
  deleteFile(path: string): void;
  /** A clip's analysis is stored and its file written (the cut suggestion reads it). */
  analyzed?(clipId: string, outPath: string): void;
  /** Every finished analysis with its numbers (field test: how long the Modo Foco takes on each phone). */
  measured?(clip: Clip, result: FocusAnalysis): void;
};

export type FocusQueue = {
  /** A clip just saved: mark it pending and analyse it when its turn comes. */
  enqueue(clipId: string): void;
  /** A clip opened in the editor: queue it if it was never analysed, or was left pending by a closed app. */
  ensure(clip: Clip): void;
  /** The clip file is being deleted: drop it from the queue and stop its analysis. */
  cancel(clipPath: string): void;
  /** True: nothing new starts (same as `setHold('all')`); false: `setHold('none')`. */
  setPaused(paused: boolean): void;
  /** What may start while a recording runs: see `focusHold`. `all` also stops a running analysis and queues it again. */
  setHold(hold: FocusHold): void;
  /** Clips left pending by an app that closed: queued again behind what waits, newest first (the likeliest opened). */
  restore(clips: Clip[]): void;
  /** The app is in front (true) or not: Vision cannot run in the background, so nothing starts there. */
  setForeground(foreground: boolean): void;
};

/**
 * `none`: everything runs. `openedOnly`: only clips opened in the editor (`ensure`) start. `all`: nothing new starts.
 */
export type FocusHold = 'none' | 'openedOnly' | 'all';

/**
 * The camera comes first (thermal spec, item 1): no analysis at all while recording, whatever the heat; the queue goes
 * on when the recording ends (2026-10-28: the player's call, replacing "a clip opened with the phone cool may run").
 */
export function focusHold(recording: boolean, _thermal: 'nominal' | 'fair' | 'serious' | 'critical'): FocusHold {
  return recording ? 'all' : 'none';
}

const codeOf = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined);

/**
 * Modo Foco analyses, one at a time, in the order the clips were saved or opened (spec §4.1), whenever the app is in
 * front and no recording runs: a clip is usually ready before the player opens it.
 */
export function createFocusQueue(deps: FocusQueueDeps): FocusQueue {
  let waiting: string[] = [];
  let running: { id: string; path: string } | undefined;
  let hold: FocusHold = 'none';
  let foreground = true;
  /** The running analysis was stopped by a recording: it goes back to the front of the queue. */
  let stopping: string | undefined;
  /** Clips opened in the editor: they may start during an `openedOnly` hold. */
  const opened = new Set<string>();

  function pump() {
    if (running || hold === 'all' || !foreground) return;
    while (waiting.length > 0) {
      const index = hold === 'openedOnly' ? waiting.findIndex((id) => opened.has(id)) : 0;
      if (index < 0) return;
      const id = waiting.splice(index, 1)[0];
      opened.delete(id);
      const clip = deps.repo.getClip(id);
      if (!clip) continue; // deleted while waiting
      start(clip);
      return;
    }
  }

  function start(clip: Clip) {
    const outPath = focusPath(clip.path);
    const range = clip.bounds ? clip.bounds : { startMs: 0, endMs: clip.durationMs };
    running = { id: clip.id, path: clip.path };
    deps
      .analyze({ clipPath: clip.path, startMs: range.startMs, endMs: range.endMs, outPath })
      .then((result) => {
        try {
          if (deps.measured) deps.measured(clip, result);
        } catch {
          // a measurement never breaks an analysis
        }
        // updateClip never brings back a deleted clip; the file it wrote is then left over.
        if (!deps.repo.updateClip(clip.id, { focus: { v: 1, status: result.status, file: outPath } })) {
          deps.deleteFile(outPath);
          return;
        }
        try {
          deps.analyzed?.(clip.id, outPath);
        } catch (e) {
          console.warn('[Repplay] after the analysis', clip.path, e);
        }
      })
      .catch((e: unknown) => {
        const code = codeOf(e);
        if (code === 'CANCELLED') {
          if (stopping === clip.id && deps.repo.getClip(clip.id)) waiting.unshift(clip.id);
          return;
        }
        // Vision cannot run with the app in the background: still pending, first in line when the app is back.
        if (code === 'FOCUS_INTERRUPTED') {
          foreground = false;
          waiting.unshift(clip.id);
          return;
        }
        console.warn('[Repplay] Modo Foco analysis failed', clip.path, e);
        deps.repo.updateClip(clip.id, { focus: { v: 1, status: 'failed' } });
      })
      .finally(() => {
        if (stopping === clip.id) stopping = undefined;
        running = undefined;
        pump();
      });
  }

  function enqueue(clipId: string) {
    if (!deps.supported()) return;
    if (waiting.includes(clipId) || (running && running.id === clipId)) return;
    if (!deps.repo.updateClip(clipId, { focus: { v: 1, status: 'pending' } })) return;
    waiting.push(clipId);
    pump();
  }

  return {
    enqueue,
    ensure(clip) {
      if (clip.focus && clip.focus.status !== 'pending') return;
      if (!deps.supported()) return;
      if (running && running.id === clip.id) return;
      // Opened in the editor: it goes first, and may run during an `openedOnly` hold. The app is in front.
      opened.add(clip.id);
      foreground = true;
      const at = waiting.indexOf(clip.id);
      if (at >= 0) {
        waiting.splice(at, 1);
        waiting.unshift(clip.id);
        pump();
        return;
      }
      if (!deps.repo.updateClip(clip.id, { focus: { v: 1, status: 'pending' } })) {
        opened.delete(clip.id);
        return;
      }
      waiting.unshift(clip.id);
      pump();
    },
    cancel(clipPath) {
      waiting = waiting.filter((id) => {
        const clip = deps.repo.getClip(id);
        return clip !== undefined && clip.path !== clipPath;
      });
      if (running && running.path === clipPath) deps.cancel(clipPath);
    },
    setPaused(value) {
      hold = value ? 'all' : 'none';
      pump();
    },
    setHold(value) {
      hold = value;
      // A recording starts: a running analysis would share the phone's heat with the camera; it is redone afterwards.
      if (hold === 'all' && running && stopping === undefined) {
        stopping = running.id;
        deps.cancel(running.path);
      }
      pump();
    },
    restore(clips) {
      if (!deps.supported()) return;
      const pending = clips
        .filter((c) => c.focus !== undefined && c.focus.status === 'pending')
        .filter((c) => !waiting.includes(c.id) && !(running && running.id === c.id))
        .sort((a, b) => b.createdAt - a.createdAt);
      waiting.push(...pending.map((c) => c.id));
      pump();
    },
    setForeground(value) {
      foreground = value;
      pump();
    },
  };
}
