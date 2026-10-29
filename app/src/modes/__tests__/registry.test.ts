import { modeLabel } from '../../components/format';
import { DEFAULT_PREFS, type Prefs } from '../../data/schema';
import { effectiveSettings, MODES, modeById, offeredMode, withModeOverride } from '../registry';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

test('the app offers one free mode, with nothing drawn over the camera', () => {
  expect(MODES.map((m) => [m.id, m.guide, m.tip])).toEqual([['quadra', 'none', false]]);
  expect(DEFAULT_PREFS.sport).toBe('quadra');
});

test('the free mode defaults to 0.5x (ultra-wide), 60s, gesture on, last 15s', () => {
  expect(effectiveSettings('quadra', prefs())).toEqual({
    zoom: 0.5,
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: 60,
    cutSeconds: 15,
    quality: '1080p60',
    audio: true,
  });
});

test('the player\'s changes are kept for the mode, and old global prefs still apply', () => {
  const p = prefs(withModeOverride(prefs(), 'quadra', { gestureEnabled: false }));
  expect(effectiveSettings('quadra', p).gestureEnabled).toBe(false);
  expect(effectiveSettings('quadra', prefs({ lens: 'wide', voiceEnabled: true }))).toMatchObject({
    zoom: 1,
    voiceEnabled: true,
  });
});

test('a lens saved in the mode\'s own settings before zoom existed keeps its framing', () => {
  const old = prefs({ modeSettings: { quadra: { lens: 'wide' } } });
  expect(effectiveSettings('quadra', old).zoom).toBe(1);
  expect(effectiveSettings('quadra', old)).not.toHaveProperty('lens');
  const ultra = prefs({ lens: 'wide', modeSettings: { quadra: { lens: 'ultraWide' } } });
  expect(effectiveSettings('quadra', ultra).zoom).toBe(0.5);
});

test('a saved zoom wins over an old lens and over the global one', () => {
  const p = prefs({ lens: 'wide', modeSettings: { quadra: { lens: 'wide', zoom: 2 } } });
  expect(effectiveSettings('quadra', p).zoom).toBe(2);
});

test('every saved sport id runs with the same settings as the free mode', () => {
  const free = effectiveSettings('quadra', prefs());
  for (const id of ['academia', 'musculacao', 'crossfit', 'beachTennis', 'futevolei', 'voleiPraia', 'outro'] as const) {
    expect(effectiveSettings(id, prefs())).toEqual(free);
  }
});

test('the buffer is always 60s, whatever an old save holds', () => {
  const old = prefs({ modeSettings: { quadra: { bufferSeconds: 120 as never } } });
  expect(effectiveSettings('quadra', old).bufferSeconds).toBe(60);
});

test('the player\'s clip length is kept, within what the buffer holds', () => {
  expect(effectiveSettings('quadra', prefs(withModeOverride(prefs(), 'quadra', { cutSeconds: 15 }))).cutSeconds).toBe(15);
  expect(effectiveSettings('quadra', prefs({ modeSettings: { quadra: { cutSeconds: 90 } } })).cutSeconds).toBe(60);
  expect(effectiveSettings('quadra', prefs({ modeSettings: { quadra: { cutSeconds: 0 } } })).cutSeconds).toBe(15); // the default
});

test('saving a zoom writes zoom and never lens', () => {
  const patch = withModeOverride(prefs(), 'quadra', { zoom: 2 });
  expect(patch).toEqual({ modeSettings: { quadra: { zoom: 2 } } });
});

test('games saved with an old sport keep their label, and everything maps to the one mode on offer', () => {
  expect(modeLabel('beachTennis')).toBe('Beach tennis');
  expect(modeLabel('musculacao')).toBe('Musculação');
  expect(modeLabel('musculacao', 'en')).toBe('Weightlifting');
  expect(modeLabel('quadra')).toBe('Gravação');
  expect(modeLabel('quadra', 'en')).toBe('Recording');
  for (const id of ['futevolei', 'crossfit', 'academia', 'quadra'] as const) expect(offeredMode(id)).toBe('quadra');
  expect(modeLabel(modeById('academia').id)).toBe('Academia');
  expect(modeLabel(modeById('voleiPraia').id)).toBe('Vôlei de praia');
});
