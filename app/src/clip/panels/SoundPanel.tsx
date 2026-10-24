import { Text, View } from 'react-native';

import { useT } from '../../i18n/useT';
import type { ToolContext } from '../tools';
import { Choice, PanelHead, panelStyles } from './PanelParts';

export function SoundPanel({ ctx }: { ctx: ToolContext }) {
  const { t } = useT();
  const proOnly = ctx.plan === 'free';
  const locked = ctx.edit.speed !== 1;
  const on = !ctx.edit.muted && !locked && !proOnly;
  return (
    <View style={{ gap: 10 }}>
      <PanelHead title={t('clip.sound')} hint={proOnly ? t('clip.soundPro') : t('clip.soundHint')} />
      <View style={panelStyles.row}>
        <Choice
          label={on ? t('clip.soundOn') : t('clip.muted')}
          a11y={proOnly ? `${t('clip.sound')}, ${t('setup.proOnly')}` : t('clip.sound')}
          selected={on}
          disabled={locked && !proOnly}
          onPress={proOnly ? ctx.unlock : locked ? undefined : () => ctx.setEdit({ muted: !ctx.edit.muted })}
        />
      </View>
      {locked && !proOnly ? <Text style={panelStyles.note}>{t('clip.soundLocked')}</Text> : null}
    </View>
  );
}
