import type { StyleProp, ViewStyle } from 'react-native';

export type Lens = 'ultraWide' | 'wide';
export type Quality = '1080p60' | '1080p30' | '720p60' | '720p30';
export type TriggerSource = 'screen' | 'gesture' | 'remote' | 'watch' | 'voice' | 'phone';
/** The language the voice command listens in (iOS speech recognizer locale). */
export type VoiceLocale = 'pt-BR' | 'en-US';
export type ThermalLevel ='nominal' | 'fair' | 'serious' | 'critical';
export type ReplayErrorCode =
  | 'LOW_STORAGE'
  | 'CAMERA_PERMISSION'
  | 'CAMERA_UNAVAILABLE'
  | 'ENCODER_FAILED'
  | 'NO_SESSION'
  | 'CANCELLED'
  | 'FOCUS_FAILED'
  | 'FOCUS_INTERRUPTED';

/**
 * `bufferSeconds`: the rolling window kept for saves (default 60; gym modes use 120).
 * `zoom`: the starting zoom where zoom is continuous (iOS: 0.5 = ultra-wide, 1 = wide); `lens` is what the others open.
 */
/** `audio`: record the microphone into the buffer (off on the free plan); native support is separate. */
export type SessionOptions = { lens: Lens; zoom?: number; maxQuality: Quality; bufferSeconds?: number; audio?: boolean };
/** What the camera can zoom: `continuous` is false where only the two lenses exist (Android). */
/** Which edge of the phone points up (UIDeviceOrientation naming). */
export type DeviceUpright = 'portrait' | 'portraitUpsideDown' | 'landscapeLeft' | 'landscapeRight';

export type ZoomRange = { min: number; max: number; continuous: boolean };
/** `at` = ms since epoch when the trigger happened. */
export type SaveClipOptions = {
  source: TriggerSource;
  at: number;
  /** How much of the buffer the file keeps, from its end (the clip's cut plus a margin); absent = the whole buffer. */
  keepMs?: number;
};
export type SavedClip = { clipPath: string; durationMs: number };

/** Apple Watch link: no paired watch · paired without the Repplay app · ready. */
export type WatchStatus = 'unsupported' | 'notInstalled' | 'ready';

/** Second iPhone as a remote: idle · looking for the other phone · talking to it · Local Network not allowed. */
export type RemoteLink = 'idle' | 'searching' | 'connected' | 'denied';
/** Why the link is `denied`: Bluetooth is off, or the Repplay is not allowed to use it. */
export type RemoteLinkReason = 'off' | 'unauthorized';
/** `connected` is only filled in for the paired remotes of the camera phone (`remoteHostPeers`): is the link up right now. */
export type RemotePeer = { id: string; name: string; connected?: boolean };
/** What the camera phone shows to pair: the QR link, the 6-digit code, when both stop working (ms) and the QR image. */
export type RemotePairing = { url: string; code: string; expiresAt: number; qrPath: string };
/** `expired` is only about time. `used`: another remote is pairing with this code. `closed`: the camera phone is not offering a pairing. */
export type RemotePairFailure = 'expired' | 'locked' | 'notFound' | 'wrong' | 'denied' | 'full' | 'used' | 'closed';

export type ReplayCameraModuleEvents = {
  onTrigger: (e: { source: TriggerSource; at: number }) => void;
  onWatchStatus: (e: { status: WatchStatus }) => void;
  /**
   * Both sides of the phone remote send it, since the same app runs on both phones: `side` says which one. The remote
   * screen reads only `remote`, the camera screens only `camera` (a missing side is treated as the camera's, as before).
   */
  onRemoteStatus: (e: {
    side?: 'camera' | 'remote';
    link: RemoteLink;
    reason?: RemoteLinkReason;
    peerName?: string;
    controllers?: number;
  }) => void;
  /** Remote phone only: what the camera phone is doing. */
  onRemoteState: (e: { recording: boolean; clipCount: number; startedAt?: number }) => void;
  /** Remote phone only: how the last save ended. */
  onRemoteResult: (e: { saved: boolean }) => void;
  /** Camera phone only: a remote asked to end the recording (the game screen decides whether it makes sense). */
  onRemoteStop: () => void;
  /** Camera phone only: a remote asked to start a new recording (only the game screen knows if it may). */
  onRemoteStart: () => void;
  /** Remote phone only: one picture of the camera phone's view, a JPEG in base64. */
  onRemoteFrame: (e: { jpeg: string }) => void;
  /**
   * `paired` / `failed`: the end of a pairing, on either phone. Camera phone only: `connecting` (a remote proved the code
   * and is linking up), `released` (that link failed, the code is free again) and `offerEnded` (five wrong tries).
   */
  onRemotePairing: (
    e:
      | { phase: 'paired'; peer: RemotePeer }
      | { phase: 'failed'; reason: RemotePairFailure }
      | { phase: 'connecting'; peer: RemotePeer }
      | { phase: 'released' }
      | { phase: 'offerEnded'; reason: 'locked' },
  ) => void;
  /** Camera phone only: the answer to `remoteHostCheck`. `ms` is the round trip; 0 when `ok` is false. */
  onRemoteCheck: (e: { id: string; ok: boolean; ms: number }) => void;
  /** `quality`: what the camera records now ("1080p30", "720p30"…); missing in older builds. */
  onThermalChange: (e: { level: ThermalLevel; degraded: boolean; quality?: string }) => void;
  onInterrupted: () => void;
  onResumed: () => void;
  /** TEMP(diag-remote): one line for the in-app diagnostic log. iOS only. */
  onDiag: (e: { message: string }) => void;
  onError: (e: { code: ReplayErrorCode; message: string }) => void;
  /** Diagnostic (Etapa 0): what the gesture detector saw in the last second. iOS only for now. */
  onGestureDebug: (e: GestureDebug) => void;
};

export type GestureDebug = {
  people: number;
  isX: boolean;
  /** Both wrists above the head line in at least one person (the cue for sampling faster). iOS only. */
  raised?: boolean;
  /** The wave gesture fired in this sample. iOS only. */
  waved?: boolean;
  orientation: number;
  samples: number;
  missing?: string;
  minConf?: number;
  wristsUp?: boolean;
  elbowsUp?: boolean;
  crossed?: boolean;
  /** Wrist distance in shoulder widths: positive = uncrossed, negative = crossed. */
  wristGap?: number;
};

export type ExportClipOptions = {
  clipPath: string;
  startMs: number;
  endMs: number;
  /** 0.5, 1, 1.5 or 2. Anything but 1 plays without sound. */
  speed: number;
  muted: boolean;
  /** The visible part of the video (0..1 of its size) after a zoom; omit for the whole video. iOS only for now. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Modo Foco: follow this framing file's track (ignored when `crop` is set). iOS only. */
  focus?: { path: string; aspect: 'landscape' | 'portrait' };
  /** Extra clockwise turn (0, 90, 180 or 270) on top of the clip's own. iOS only for now. */
  rotation?: number;
  width: number;
  height: number;
  /** Full-frame PNG drawn over the video (the Story template bands). */
  overlayPngPath?: string;
  /** '#RRGGBB' behind the video where the overlay is transparent. */
  background: string;
};

export type ExportedClip = { path: string; durationMs: number };

/** Modo Foco analysis of a clip (iOS only). Writes the framing to `outPath` (see `focusPath`). */
export type AnalyzeFocusOptions = {
  clipPath: string;
  startMs: number;
  endMs: number;
  outPath: string;
  /** Also write the people found in each analysed frame (`samples`), for the test screen. */
  debug?: boolean;
};

/** `none`: too few people for a framing (the file has empty tracks). */
export type FocusAnalysis = {
  status: 'ready' | 'none';
  frames: number;
  framesWithPeople: number;
  meanPeople: number;
  elapsedMs: number;
};

export type ReplayCameraViewProps = {
  style?: StyleProp<ViewStyle>;
};
