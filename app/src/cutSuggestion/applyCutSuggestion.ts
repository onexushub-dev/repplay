import { File } from 'expo-file-system';

import { track } from '../analytics';
import type { Repo } from '../data/repo';
import type { Clip } from '../data/schema';
import { MIN_CUT_MS, clipWindow } from '../share/trim';
import { type MotionSample, suggestCut } from './suggestCut';

/** TEMP(cut-suggestion): the experiment's switch. Off: no clip gets a suggested cut (removal: see the backlog entry). */
export const CUT_SUGGESTION_ENABLED = true as boolean;

/** The `motion` rows of a focus file's text; undefined when there are none or the file is broken. */
export function parseMotion(text: string): MotionSample[] | undefined {
  try {
    const rows = (JSON.parse(text) as { motion?: unknown }).motion;
    if (!Array.isArray(rows)) return undefined;
    const ok = rows.every((r) => Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number' && Number.isFinite(n)));
    return ok && rows.length > 0 ? (rows as MotionSample[]) : undefined;
  } catch {
    return undefined;
  }
}

function readMotion(path: string): MotionSample[] | undefined {
  try {
    return parseMotion(new File(`file://${path}`).textSync());
  } catch {
    return undefined;
  }
}

const sameCut = (a: Clip['trim'], b: Clip['trim'] | undefined) => b !== undefined && a.startMs === b.startMs && a.endMs === b.endMs;

/**
 * After a clip's analysis: keeps the suggested cut on the clip and, when the player has not touched the cut yet (it is
 * still the cut it was saved with), makes it the clip's cut. Only clips with `bounds` (the save's own window).
 */
export function applyCutSuggestion(
  clipId: string,
  focusFile: string,
  deps: { repo: Pick<Repo, 'getClip' | 'updateClip'>; read?: (path: string) => MotionSample[] | undefined } ,
): void {
  if (!CUT_SUGGESTION_ENABLED) return;
  const clip = deps.repo.getClip(clipId);
  if (!clip || !clip.bounds) return;
  const samples = (deps.read ?? readMotion)(focusFile);
  if (!samples) return;
  const window = clipWindow(clip, clip.contentStartMs ?? 0);
  const cut = suggestCut(samples, window);
  if (!cut || cut.endMs - cut.startMs < MIN_CUT_MS) return;
  const untouched = sameCut(clip.trim, clip.bounds);
  deps.repo.updateClip(clipId, untouched ? { cutSuggestion: cut, trim: cut } : { cutSuggestion: cut });
  if (untouched) track('cut_suggestion_applied');
}
