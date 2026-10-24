import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../../i18n/useT';
import { colors, fonts } from '../../theme/tokens';
import type { ToolContext } from '../tools';
import { PanelHead } from './PanelParts';

export function FocusPanel({ ctx }: { ctx: ToolContext }) {
  const { t } = useT();
  if (ctx.focus === 'unavailable') {
    return (
      <View style={{ gap: 10 }}>
        <PanelHead title={t('clip.focusMode')} hint={t('clip.focusUnavailable')} />
      </View>
    );
  }
  const on = ctx.focus === 'on';
  const preparing = ctx.focus === 'preparing';
  // On a free recording the framing works here, but it does not leave the app: the hint says so.
  const free = ctx.plan === 'free';
  return (
    <View style={{ gap: 10 }}>
      <PanelHead
        title={t('clip.focusMode')}
        hint={free ? t('clip.focusPro') : t('clip.focusHint')}
        right={
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t('clip.focusMode')}
            accessibilityState={{ checked: on, disabled: preparing }}
            disabled={preparing}
            onPress={ctx.toggleFocus}
            hitSlop={8}
            style={[styles.track, on ? styles.trackOn : null, preparing ? styles.off : null]}>
            <View style={[styles.knob, on ? styles.knobOn : null]} />
          </Pressable>
        }
      />
      {preparing ? (
        <View style={styles.note}>
          <ActivityIndicator size="small" color={colors.soft} />
          <Text style={styles.noteText}>{t('clip.focusPreparingNote')}</Text>
        </View>
      ) : (
        <View style={styles.note}>
          <Text style={styles.noteText}>{t('clip.focusHold')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: 52, height: 32, borderRadius: 16, backgroundColor: colors.border, justifyContent: 'center', padding: 3 },
  trackOn: { backgroundColor: colors.accent },
  off: { opacity: 0.45 },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text },
  knobOn: { alignSelf: 'flex-end', backgroundColor: colors.onAccent },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  noteText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
});
