import { Image as ExpoImage } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { knownShape, rememberShape } from '../components/clipShape';
import { useClipThumbnail } from '../components/useClipThumbnail';
import { readFocusFile } from '../data/focusFile';
import type { Clip } from '../data/schema';
import { readEdit, turnedSize } from '../share/editing';
import { ShareOverlay } from '../share/ShareOverlay';
import { colors } from '../theme/tokens';
import { clipStage, openingZoom, pictureTransform, previewBox, turned } from './stage';

/** Neighbours are measured this long after the open clip, so they never hold it up. */
const NEIGHBOUR_WAIT_MS = 300;

type Props = {
  clip: { path?: string; trim?: Clip['trim']; edit?: Clip['edit']; focus?: Clip['focus'] };
  tier: Parameters<typeof clipStage>[0];
  area: { width: number; height: number };
};

/**
 * A neighbouring clip as it will look the moment it opens: its first frame in its own frame, with Modo Foco's framing (or
 * its zoom by hand), turned, with the app mark. A still, so a swipe costs no extra video playing.
 */
export function NeighbourStage({ clip, tier, area }: Props) {
  const path = clip.path || '';
  const startMs = clip.trim ? clip.trim.startMs : 0;
  const uri = useClipThumbnail(path, startMs);
  const [size, setSize] = useState(() => knownShape(path));
  // Its shape too, so that if the swipe lands there the screen opens laid out, with Salvar/Enviar ready.
  useEffect(() => {
    if (!uri || !path || size) return;
    // After the open clip has had its turn: this one only matters if the finger goes there.
    const timer = setTimeout(() => {
      Image.getSize(uri)
        .then(({ width, height }) => {
          rememberShape(path, { width, height });
          setSize({ width, height });
        })
        .catch(() => {});
    }, NEIGHBOUR_WAIT_MS);
    return () => clearTimeout(timer);
  }, [uri, path, size]);

  const focusFile = clip.focus && clip.focus.status === 'ready' ? clip.focus.file : undefined;
  const rotation = readEdit(clip.edit).rotation;
  const landscape = size ? turnedSize(size, rotation).width > turnedSize(size, rotation).height : false;
  const track = useMemo(
    () => (focusFile && size ? readFocusFile(focusFile, landscape ? 'landscape' : 'portrait') : undefined),
    [focusFile, size, landscape],
  );

  if (!uri) return null;
  if (!size || !clip.trim) return <ExpoImage source={{ uri }} contentFit="contain" style={StyleSheet.absoluteFill} />;

  const { frame, layout, watermark } = clipStage(tier, clip.edit, clip.trim, size, track ? focusFile : undefined);
  const box = previewBox(frame, layout, area);
  const zoom = openingZoom(clip.edit, track, startMs);
  return (
    <View style={[styles.preview, { width: box.width, height: box.height }]}>
      <View style={[styles.box, box.video]}>
        <View testID="neighbour-picture" style={[StyleSheet.absoluteFill, { transform: pictureTransform(zoom, box.video) }]}>
          <ExpoImage source={{ uri }} contentFit="contain" style={turned(box.video, rotation)} />
        </View>
      </View>
      <View style={StyleSheet.absoluteFill}>
        <ShareOverlay frame={frame} layout={layout} scale={box.scale} watermark={watermark} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { overflow: 'hidden', backgroundColor: colors.ground },
  box: { position: 'absolute', overflow: 'hidden' },
});
