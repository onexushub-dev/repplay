import { type ComponentRef, type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { captureOverlay } from './captureOverlay';
import type { frameLayout } from './layout';
import { ShareOverlay } from './ShareOverlay';

export type CaptureJob = {
  frame: { width: number; height: number };
  layout: ReturnType<typeof frameLayout>;
  watermark: boolean;
};

const sameLook = (a: CaptureJob, b: CaptureJob) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The app mark and template bands for clips that are not on screen (a batch): one hidden overlay, drawn for each look
 * in turn and captured to a PNG. Looks are captured one at a time, in the order asked, and a look asked twice in a row
 * gives the same PNG. The PNGs belong to this hook: `release` removes them when the batch is over.
 */
export function useOverlayCapturer(): {
  element: ReactElement;
  capture: (job: CaptureJob) => Promise<string>;
  release: (remove: (path: string) => void) => void;
} {
  const [shown, setShown] = useState<CaptureJob | undefined>();
  const viewRef = useRef<ComponentRef<typeof View>>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const last = useRef<{ job: CaptureJob; path: string } | undefined>(undefined);
  const made = useRef<string[]>([]);
  const drawn = useRef<(() => void) | undefined>(undefined);

  // The job is on screen once React has committed it: wake the capture waiting for that.
  useEffect(() => {
    if (shown && drawn.current) {
      const done = drawn.current;
      drawn.current = undefined;
      done();
    }
  }, [shown]);

  const capture = useCallback((job: CaptureJob): Promise<string> => {
    const run = async () => {
      if (last.current && sameLook(last.current.job, job)) return last.current.path;
      await new Promise<void>((resolve) => {
        drawn.current = resolve;
        setShown(job);
      });
      // One more frame, so the layout of what was just committed is done before the picture is taken.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const path = await captureOverlay(viewRef);
      made.current.push(path);
      last.current = { job, path };
      return path;
    };
    const result = queue.current.then(run, run);
    queue.current = result.catch(() => undefined);
    return result;
  }, []);

  const release = useCallback((remove: (path: string) => void) => {
    made.current.forEach(remove);
    made.current = [];
    last.current = undefined;
  }, []);

  const scale = 1 / PixelRatio.get();
  const element = (
    <View pointerEvents="none" style={styles.offscreen}>
      {shown ? (
        <ShareOverlay ref={viewRef} frame={shown.frame} layout={shown.layout} scale={scale} watermark={shown.watermark} />
      ) : null}
    </View>
  );
  return { element, capture, release };
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
