import { Text, View } from 'react-native';

import { useT } from '../../i18n/useT';
import type { ToolContext } from '../tools';
import { Choice, PanelHead, panelStyles } from './PanelParts';

export function SoundPanel({ ctx }: { ctx: ToolContext }) {
  const { t } = useT();
  const locked = ctx.edit.speed !== 1;
  const on = !ctx.edit.muted && !locked;
  return (
    <View style={{ gap: 10 }}>
      <PanelHead title={t('clip.sound')} hint={t('clip.soundHint')} />
      <View style={panelStyles.row}>
        <Choice
          label={on ? t('clip.soundOn') : t('clip.muted')}
          a11y={t('clip.sound')}
          selected={on}
          disabled={locked}
          onPress={locked ? undefined : () => ctx.setEdit({ muted: !ctx.edit.muted })}
        />
      </View>
      {locked ? <Text style={panelStyles.note}>{t('clip.soundLocked')}</Text> : null}
    </View>
  );
}
