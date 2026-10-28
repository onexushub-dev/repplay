import { NativeModule, requireNativeModule } from 'expo';

import type {
  AnalyzeFocusOptions,
  DeviceUpright,
  ExportClipOptions,
  ExportedClip,
  FocusAnalysis,
  ReplayCameraModuleEvents,
  SaveClipOptions,
  RemotePairing,
  RemotePeer,
  SavedClip,
  SessionOptions,
  VoiceLocale,
  WatchStatus,
  ZoomRange,
  Quality,
} from './ReplayCamera.types';

declare class ReplayCameraModule extends NativeModule<ReplayCameraModuleEvents> {
  startSession(opts: SessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  saveClip(opts: SaveClipOptions): Promise<SavedClip>;
  setGestureEnabled(enabled: boolean): void;
  // Gesture test, spike screen (iOS only: missing on Android and in older builds).
  setGestureTrace?(enabled: boolean): void;
  // The phone's position (iOS only: missing on Android and in older builds).
  getUpright?(): DeviceUpright;
  // Continuous zoom (iOS only: missing on Android and in older builds).
  getZoomRange?(): ZoomRange;
  setZoom?(factor: number, animated: boolean): void;
  // Screen economy while recording (iOS only: missing on Android and in older builds).
  setScreenEconomy?(on: boolean): void;
  // Whether the phone records a quality (iOS only: missing on Android and in older builds).
  supportsQuality?(quality: Quality): boolean;
  // TEMP(diag-remote) (iOS only: missing on Android and in older builds).
  diagAudioState?(): string;
  requestPermissions(): Promise<boolean>;
  signalSaved(sound: boolean, flash: boolean): void;
  signalSaveFailed(sound: boolean): void;
  setVoiceEnabled(enabled: boolean, locale: VoiceLocale): void;
  requestSpeechPermission(): Promise<boolean>;
  isVoiceSupported(locale: VoiceLocale): boolean;
  getSpeechPermission(): 'granted' | 'denied' | 'undetermined';
  createThumbnail(clipPath: string, atMs: number): Promise<string>;
  findContentStart?(clipPath: string): Promise<number>;
  exportClip(opts: ExportClipOptions): Promise<ExportedClip>;
  // Modo Foco (iOS only: missing on Android and in older builds).
  analyzeFocus?(opts: AnalyzeFocusOptions): Promise<FocusAnalysis>;
  cancelFocus?(clipPath: string): void;
  getWatchStatus(): WatchStatus;
  watchSync(recording: boolean, clipCount: number, startedAt: number | null): void;
  watchSignal(saved: boolean): void;
  /** Missing on native builds from before the watch trigger was paid. */
  watchSetSaveAllowed?(allowed: boolean): void;
  // Second iPhone as a remote (iOS only: these are missing on Android).
  remoteHostStart?(): void;
  remoteHostStop?(): void;
  remoteHostBeginPairing?(): RemotePairing | null;
  remoteHostEndPairing?(): void;
  remoteHostPeers?(): RemotePeer[];
  remoteHostRemove?(id: string): void;
  remoteHostCheck?(id: string): void;
  remoteHostControllers?(): number;
  remoteSync?(recording: boolean, clipCount: number, startedAt: number | null): void;
  remoteSignal?(saved: boolean): void;
  remoteControllerStart?(): void;
  remoteControllerStop?(): void;
  remoteControllerHost?(): RemotePeer | null;
  remoteControllerForget?(): void;
  remoteControllerPairWithLink?(hostId: string, secret: string, hostName: string): void;
  remoteControllerPairWithCode?(code: string): void;
  remoteControllerSave?(): void;
  remoteControllerEndRecording?(): void;
  remoteControllerStartRecording?(): void;
  remoteControllerPreview?(on: boolean): void;
  remoteDeviceName?(): string;
  remoteSetDeviceName?(name: string): void;
  shareToInstagramStory(videoPath: string, metaAppId: string): Promise<'opened' | 'unavailable'>;
  /** One system share sheet with all these video files. 'shared' when it completed (Android cannot tell: 'shared' once it opens). */
  shareFiles(paths: string[]): Promise<'shared' | 'dismissed'>;
  /** Joins exports of the same size and codec into one video without re-encoding. */
  concatVideos(paths: string[], outPath: string): Promise<{ path: string; durationMs: number }>;
}

export default requireNativeModule<ReplayCameraModule>('ReplayCamera');
