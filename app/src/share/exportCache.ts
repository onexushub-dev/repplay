import { Directory, File, Paths } from 'expo-file-system';

/** Finished exports by look (`ClipJob.key`), shared by the clip screen and the batch: the same look is made once. */
const exports = new Map<string, string>();

function exists(path: string): boolean {
  try {
    return new File(`file://${path}`).exists;
  } catch {
    return false;
  }
}

/** The export made for this look, if its file is still there. */
export function cachedExport(key: string): string | undefined {
  const path = exports.get(key);
  if (path === undefined) return undefined;
  if (exists(path)) return path;
  exports.delete(key);
  return undefined;
}

export function rememberExport(key: string, path: string) {
  exports.set(key, path);
}

/** Drops an export: its entry and its file. */
export function forgetExport(path: string) {
  for (const [key, value] of exports) if (value === path) exports.delete(key);
  try {
    new File(`file://${path}`).delete();
  } catch {
    // already gone
  }
}

/** Exports left by a crash or a kill would otherwise pile up in the cache: cleared once when the app starts. */
export function clearExportsFolder() {
  exports.clear();
  try {
    new Directory(Paths.cache, 'exports').list().forEach((item) => item.delete());
  } catch {
    // no exports folder yet
  }
}

export function forgetAllExportsForTests() {
  exports.clear();
}
