import {
  BUFFER_SECONDS,
  DEFAULT_CLIP_SECONDS,
  type ModeId,
  type ModeSettings,
  type Prefs,
  type StoredModeSettings,
} from '../data/schema';
import { DEFAULT_ZOOM, zoomFromLens } from './zoom';

export type ModeGroup = 'quadra' | 'academia';

export type Guide = 'court' | 'person' | 'none';

/** A mode's name and placement tip are translated: modeLabel(id) and modeTip(group) in components/format. */
export type Mode = {
  id: ModeId;
  group: ModeGroup;
  guide: Guide;
  /** Whether the setup screen shows the group's placement tip (modeTip). The free court mode has none. */
  tip: boolean;
  defaults: ModeSettings;
};

// One set of defaults for everything: the app no longer tells a court from a gym. The buffer is fixed and
// the player picks the clip length on the setup screen.
const DEFAULTS: Omit<Mode, 'id'> = {
  group: 'quadra',
  guide: 'court',
  tip: false,
  defaults: {
    zoom: DEFAULT_ZOOM,
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: BUFFER_SECONDS,
    cutSeconds: DEFAULT_CLIP_SECONDS,
    quality: '1080p60',
    audio: true,
  },
};

/**
 * The modes the app offers. For now there is one, with no drawing over the camera: the player frames the shot freely.
 * A new mode is a new entry here (plus a guide drawing if it needs one).
 */
export const MODES: Mode[] = [{ ...DEFAULTS, id: 'quadra', guide: 'none' }];

/** Modes and sports offered before; games saved with them still need a label (modeLabel) and settings. */
const SAVED_SPORTS: Mode[] = [
  { ...DEFAULTS, id: 'academia' },
  { ...DEFAULTS, id: 'beachTennis' },
  { ...DEFAULTS, id: 'futevolei' },
  { ...DEFAULTS, id: 'voleiPraia' },
  { ...DEFAULTS, id: 'outro' },
  { ...DEFAULTS, id: 'musculacao' },
  { ...DEFAULTS, id: 'crossfit' },
  { ...DEFAULTS, id: 'funcional' },
  { ...DEFAULTS, id: 'outroAcademia' },
];

export function modeById(id: ModeId): Mode {
  return MODES.find((m) => m.id === id) ?? SAVED_SPORTS.find((m) => m.id === id) ?? MODES[0];
}

/** The offered mode a saved id belongs to. With one mode on offer, everything saved before maps to it. */
export function offeredMode(_id: ModeId): ModeId {
  return MODES[0].id;
}

/** The clip length kept within what the buffer can hold; anything unusable falls back to the default. */
function clipSeconds(value: number): number {
  if (!(value > 0)) return DEFAULT_CLIP_SECONDS;
  return Math.min(value, BUFFER_SECONDS);
}

/**
 * The settings a game runs with: the defaults, then the global prefs saved before modes existed, then the
 * player's changes. Every saved id uses the settings of the one mode on offer; the buffer is always the same.
 */
export function effectiveSettings(mode: ModeId, prefs: Prefs): ModeSettings {
  const m = modeById(mode);
  const own = offeredMode(mode);
  // The global lens saved before modes no longer decides the zoom: every launch opens at DEFAULT_ZOOM.
  const legacy: Partial<ModeSettings> = {
    gestureEnabled: prefs.gestureEnabled,
    voiceEnabled: prefs.voiceEnabled,
  };
  const saved = prefs.modeSettings && prefs.modeSettings[own] ? prefs.modeSettings[own] : {};
  const { lens: savedLens, ...rest } = saved;
  // A zoom saved for the mode wins; a lens saved before zoom existed keeps its framing.
  const savedZoom = rest.zoom !== undefined ? rest.zoom : savedLens !== undefined ? zoomFromLens(savedLens) : undefined;
  const merged = { ...m.defaults, ...legacy, ...rest, ...(savedZoom !== undefined ? { zoom: savedZoom } : {}) };
  return { ...merged, bufferSeconds: BUFFER_SECONDS, cutSeconds: clipSeconds(merged.cutSeconds) };
}

/**
 * The zoom lasts one launch: at app start the zoom (and the lens saved before zoom existed) is dropped from every
 * mode, so the camera opens at DEFAULT_ZOOM. Undefined when there is nothing to drop.
 */
export function withoutSavedZoom(prefs: Prefs): Partial<Prefs> | undefined {
  const all = prefs.modeSettings;
  if (all === undefined) return undefined;
  let changed = false;
  const next: Partial<Record<ModeId, StoredModeSettings>> = {};
  for (const id of Object.keys(all) as ModeId[]) {
    const saved = all[id];
    if (saved === undefined) continue;
    if (saved.zoom !== undefined || saved.lens !== undefined) changed = true;
    const kept: StoredModeSettings = { ...saved };
    delete kept.zoom;
    delete kept.lens;
    next[id] = kept;
  }
  return changed ? { modeSettings: next } : undefined;
}

/** The prefs patch that records `patch` as the player's change for `mode` only. */
export function withModeOverride(prefs: Prefs, mode: ModeId, patch: Partial<ModeSettings>): Partial<Prefs> {
  const current = prefs.modeSettings ?? {};
  return { modeSettings: { ...current, [mode]: { ...current[mode], ...patch } } };
}
