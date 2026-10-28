import { File } from 'expo-file-system';

import * as camera from '../../modules/replay-camera';
import { onFileRemoved, repo } from '../data/mmkv';
import { diag } from '../diag/diagLog';
import { applyCutSuggestion } from '../cutSuggestion/applyCutSuggestion';
import { createFocusQueue } from './focusQueue';

/** The app's one Modo Foco queue. */
export const focusQueue = createFocusQueue({
  analyze: camera.analyzeFocus,
  cancel: camera.cancelFocus,
  supported: camera.isFocusSupported,
  repo,
  analyzed: (clipId, outPath) => applyCutSuggestion(clipId, outPath, { repo }),
  // TEMP(diag-remote): the Modo Foco v14 field test reads the analysis time on the Diagnóstico screen.
  measured: (clip, r) =>
    diag(
      `Modo Foco: clipe de ${((clip.bounds ? clip.bounds.endMs - clip.bounds.startMs : clip.durationMs) / 1000).toFixed(0)} s ` +
        `analisado em ${(r.elapsedMs / 1000).toFixed(1)} s (${r.frames} quadros, ${r.meanPeople.toFixed(1)} pessoas/quadro, ${r.status})`,
    ),
  deleteFile: (path) => {
    try {
      new File(`file://${path}`).delete();
    } catch {
      // already gone
    }
  },
});

onFileRemoved((clipPath) => focusQueue.cancel(clipPath));
