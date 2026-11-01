import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { createMMKV } from 'react-native-mmkv';

import { focusPath } from './focusFile';
import { createRepo, type FileProbe, type KV } from './repo';
import { thumbnailPath } from './thumbnailPath';

const storage = createMMKV({ id: 'reprize' });

export const kv: KV = {
  getString: (k) => storage.getString(k),
  set: (k, v) => storage.set(k, v),
  delete: (k) => void storage.remove(k),
  keys: () => storage.getAllKeys(),
};

/** Clip paths are absolute filesystem paths from the native module. */
export const files: FileProbe = {
  exists: (path) => new File(`file://${path}`).exists,
  sizeBytes: (path) => new File(`file://${path}`).size ?? 0,
};

export const repo = createRepo(kv, files, randomUUID);

/** A `file://` folder address as a plain path ending in '/'. */
export function documentsPath(uri: string): string {
  const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
  return path.endsWith('/') ? path : path + '/';
}

// iOS can move the app's data folder on reinstall: point the clips back to where their files are now.
try {
  repo.relocateClips(documentsPath(Paths.document.uri));
} catch {
  // no file system here (tests, web): nothing to move
}

const removalListeners = new Set<(clipPath: string) => void>();

/** Hears every clip file about to be deleted (the Modo Foco queue stops its analysis). Returns the unsubscribe. */
export function onFileRemoved(listener: (clipPath: string) => void): () => void {
  removalListeners.add(listener);
  return () => void removalListeners.delete(listener);
}

/** Deletes a saved clip's file, its cached thumbnail and its Modo Foco framing; files already gone are the goal. */
export function removeFile(path: string): void {
  removalListeners.forEach((listener) => listener(path));
  // The last one is where thumbnails were kept before they were checked for being black.
  for (const p of [path, thumbnailPath(path), path.replace(/\.[^./]+$/, '') + '.jpg', focusPath(path)]) {
    try {
      new File(`file://${p}`).delete();
    } catch {
      // already gone
    }
  }
}
