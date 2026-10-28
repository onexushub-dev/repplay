import { File } from 'expo-file-system';

import * as camera from '../../modules/replay-camera';
import { onFileRemoved, repo } from '../data/mmkv';
import { applyCutSuggestion } from '../cutSuggestion/applyCutSuggestion';
import { createFocusQueue } from './focusQueue';

/** The app's one Modo Foco queue. */
export const focusQueue = createFocusQueue({
  analyze: camera.analyzeFocus,
  cancel: camera.cancelFocus,
  supported: camera.isFocusSupported,
  repo,
  analyzed: (clipId, outPath) => applyCutSuggestion(clipId, outPath, { repo }),
  deleteFile: (path) => {
    try {
      new File(`file://${path}`).delete();
    } catch {
      // already gone
    }
  },
});

onFileRemoved((clipPath) => focusQueue.cancel(clipPath));
