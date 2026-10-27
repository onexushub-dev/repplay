import type { Quality, TriggerSource } from '../../modules/replay-camera/src/ReplayCamera.types';

export type { TriggerSource };

/**
 * A usage mode. The app has a single free mode (`quadra`); the other ids are kept only so games saved with
 * them stay valid and keep their label.
 */
export type ModeId =
  | 'quadra'
  | 'academia'
  | 'beachTennis'
  | 'futevolei'
  | 'voleiPraia'
  | 'outro'
  | 'musculacao'
  | 'crossfit'
  | 'funcional'
  | 'outroAcademia';
/** Kept as the field type name: Session.sport and Prefs.sport hold a mode id. */
export type Sport = ModeId;

/** How far back the camera keeps video for a save. Fixed: the player picks the clip length, not the buffer. */
export const BUFFER_SECONDS = 60;

/** The clip lengths the player can pick on the setup screen (seconds). */
export const CLIP_SECONDS_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_CLIP_SECONDS = 30;

/** 0.5 = the ultra-wide lens, 1 = the wide lens, above 1 a digital crop. */
export type ModeSettings = {
  zoom: number;
  gestureEnabled: boolean;
  voiceEnabled: boolean;
  bufferSeconds: typeof BUFFER_SECONDS;
  /** The clip length the player picked: each save cuts at most this much, never reaching back before the previous clip. */
  cutSeconds: number;
  quality: Quality;
  audio: boolean;
};

/** What was saved for a mode: before zoom existed it held `lens` (read, never written). */
export type StoredModeSettings = Partial<ModeSettings> & { lens?: 'ultraWide' | 'wide' };

export type Session = { id: string; sport: Sport; startedAt: number; endedAt?: number; name?: string; /** Fixed at start: true if Pro or a Single Pass unlocked this game; absent on games recorded before the free plan. */ paid?: boolean; /** RevenueCat transaction id of the single pass that unlocked this game; absent = no pass. */ passTransactionId?: string };

export const MAX_GAME_NAME = 40;
export const MAX_CLIP_NAME = 40;

export type ClipFocus = { v: 1; status: 'pending' | 'ready' | 'none' | 'failed'; file?: string };

export type Clip = {
  id: string;
  sessionId: string;
  createdAt: number;
  source: TriggerSource;
  path: string;
  durationMs: number;
  trim: { startMs: number; endMs: number };
  /** The video's resolution in pixels, its short side (2160 = 4K). Absent on Android and older clips: Full HD. */
  shortSide?: number;
  /** Its place in the recording when saved; kept when earlier clips are deleted. Absent on older clips (their place in the list is used). */
  number?: number;
  /**
   * The part of the saved file this clip may show: the cut it was first saved with. The editor can shorten the cut
   * inside it but never reach the rest of the buffer, which holds moments already in other clips.
   * Absent on clips saved before this existed: those can use the whole file.
   */
  bounds?: { startMs: number; endMs: number };
  /** Where the useful video starts after a black start (0 = from the beginning); unset until the editor first checked. */
  contentStartMs?: number;
  /** Editor choices; absent = normal speed, with sound, no zoom. `slowmo` is how clips saved before speeds were stored. */
  edit?: {
    slowmo?: boolean;
    speed?: 0.5 | 1 | 1.5 | 2;
    muted: boolean;
    zoom?: { scale: number; cx: number; cy: number };
    rotation?: 0 | 90 | 180 | 270;
    /** Modo Foco for this clip; absent = on. */
    focus?: boolean;
  };
  /**
   * The Modo Foco analysis: `pending` while queued or running, `ready` with the framing `file`, `none` when there were
   * too few people for a framing, `failed` when the analysis broke. Absent = never analysed (clips from before it).
   */
  focus?: ClipFocus;
  /** Optional name the player gives the clip (like a recording's name). */
  name?: string;
  /** When the edited video was last saved to Photos / sent through the share sheet (the clip itself stays inside the app). */
  savedAt?: number;
  sharedAt?: number;
};

export type Prefs = {
  onboardingDone: boolean;
  sport: Sport;
  lens: 'ultraWide' | 'wide';
  gestureEnabled: boolean;
  /** Feedback the moment a save is accepted, for a player far from the phone. */
  soundOnSave: boolean;
  flashOnSave: boolean;
  /** "salvar" / "gravar" by voice (iOS). Off until speech permission is granted. */
  voiceEnabled: boolean;
  /** When a press of the Bluetooth remote was first heard; the app cannot see the iOS pairing, only presses. */
  remoteTestedAt?: number;
  /** The Modo Foco introduction (the first framed clip) was shown. */
  focusIntroSeen?: boolean;
  /** Battery saving while recording: the screen goes dark after a while without a touch (the recording goes on). */
  screenEconomy: boolean;
  /** The player's changes to a mode's defaults, kept per mode. */
  modeSettings?: Partial<Record<ModeId, StoredModeSettings>>;
};

export const DEFAULT_PREFS: Prefs = {
  onboardingDone: false,
  sport: 'quadra',
  lens: 'ultraWide',
  gestureEnabled: true,
  soundOnSave: true,
  flashOnSave: true,
  voiceEnabled: false,
  screenEconomy: true,
};

/** Default cut: the last 30s of the saved 60s window (spec 3.3). */
export const DEFAULT_TRIM_MS = DEFAULT_CLIP_SECONDS * 1000;
