import { useEffect, useState } from 'react';

import { createThumbnail } from '../../modules/replay-camera';

const cache = new Map<string, string>();

/**
 * A frame of a saved clip, made natively once and cached as a .jpg next to the clip.
 * Returns a file uri for expo-image, or undefined while it is being made (or if it can't be).
 */
export function useClipThumbnail(path: string, atMs: number): string | undefined {
  const key = `${path}@${atMs}`;
  // Tagged with its key: a component whose clip changes (the export sheet gets one only when it opens) never shows the
  // last clip's frame, and a frame already cached for the new key is read straight from the cache.
  const [made, setMade] = useState<{ key: string; uri: string } | null>(null);

  useEffect(() => {
    if (!path || cache.has(key)) return;
    let alive = true;
    createThumbnail(path, atMs)
      .then((thumbPath) => {
        const fileUri = `file://${thumbPath}`;
        cache.set(key, fileUri);
        if (alive) setMade({ key, uri: fileUri });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key, path, atMs]);

  return cache.get(key) ?? (made !== null && made.key === key ? made.uri : undefined);
}
