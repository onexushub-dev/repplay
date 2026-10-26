import { File } from 'expo-file-system';

import * as camera from '../../modules/replay-camera';
import { onFileRemoved, repo } from '../data/mmkv';
import { createFocusQueue } from './focusQueue';

/** The app's one Modo Foco queue. */
export const focusQueue = createFocusQueue({
  analyze: camera.analyzeFocus,
  cancel: camera.cancelFocus,
  supported: camera.isFocusSupported,
  repo,
  // Task 9 (the sport picker) reads the recording's sport here; until then every clip frames the players.
  sportOf: () => 'livre',
  debug: __DEV__,
  deleteFile: (path) => {
    try {
      new File(`file://${path}`).delete();
    } catch {
      // already gone
    }
  },
});

onFileRemoved((clipPath) => focusQueue.cancel(clipPath));
