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
  /** What may start while a recording runs: see `focusHold`. */
  setHold(hold: FocusHold): void;
};

/**
 * `none`: everything runs. `openedOnly`: only clips opened in the editor (`ensure`) start. `all`: nothing new starts.
 */
export type FocusHold = 'none' | 'openedOnly' | 'all';

/**
 * The camera comes first (thermal spec, item 1): no analysis while recording, except a clip the player opens with the
 * phone still cool; none at all once it warms up.
 */
export function focusHold(recording: boolean, thermal: 'nominal' | 'fair' | 'serious' | 'critical'): FocusHold {
  if (!recording) return 'none';
  return thermal === 'nominal' ? 'openedOnly' : 'all';
}

const codeOf = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined);

/** Modo Foco analyses, one at a time, in the order the clips were saved or opened (spec §4.1). */
export function createFocusQueue(deps: FocusQueueDeps): FocusQueue {
  let waiting: string[] = [];
  let running: { id: string; path: string } | undefined;
  let hold: FocusHold = 'none';
  /** Clips opened in the editor: they may start during an `openedOnly` hold. */
  const opened = new Set<string>();

  function pump() {
    if (running || hold === 'all') return;
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
        if (code === 'CANCELLED') return;
        // Vision cannot run with the app in the background: left pending, it is redone when the clip is opened.
        if (code === 'FOCUS_INTERRUPTED') return;
        console.warn('[Repplay] Modo Foco analysis failed', clip.path, e);
        deps.repo.updateClip(clip.id, { focus: { v: 1, status: 'failed' } });
      })
      .finally(() => {
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
      // Opened in the editor: it goes first, and may run during an `openedOnly` hold.
      opened.add(clip.id);
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
      pump();
    },
  };
}
