import { StyleSheet, Text, View } from 'react-native';

import { formatZoom } from '../modes/zoom';
import { colors, fonts } from '../theme/tokens';

/** The zoom value shown over the preview while the player pinches. */
export function ZoomBubble({ value, bottom }: { value: number; bottom: number }) {
  return (
    <View testID="zoom-bubble" pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <Text style={styles.text}>{formatZoom(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(15,15,15,0.75)',
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.accent },
});
