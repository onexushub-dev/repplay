// TEMP(diag-remote): Bluetooth remote investigation; this whole file goes with its commit.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';

import { addReplayListener, diagAudioState } from '../../modules/replay-camera';
import type { ReplaySession } from '../session/useReplaySession';
import { diag, diagFlags, diagRecordingEnded, diagRecordingStarted } from './diagLog';

/** While recording, one line a minute with the audio state: shows when the remote's path changes or goes quiet. */
const PULSE_MS = 60_000;

/**
 * Writes what a recording goes through to the diagnostic log (Bluetooth remote investigation; temporary): start and
 * end, heat and quality steps, app state, the audio session's own events (native `onDiag`) and a pulse a minute.
 */
export function useSessionDiag(session: ReplaySession): void {
  const { phase, thermal } = session.state;
  const recording = phase === 'recording';

  useEffect(() => {
    if (!recording) return;
    const economy = diagFlags().economyOff ? 'economia de tela DESLIGADA' : 'economia de tela ligada';
    diagRecordingStarted(`${economy} — ${diagAudioState()}`);
    let minute = 0;
    const pulse = setInterval(() => {
      minute += 1;
      VolumeManager.getVolume()
        .then(({ volume }) => diag(`pulso ${minute} min: volume lido pelo app ${volume.toFixed(2)} — ${diagAudioState()}`))
        .catch(() => diag(`pulso ${minute} min: volume ILEGÍVEL — ${diagAudioState()}`));
    }, PULSE_MS);
    return () => {
      clearInterval(pulse);
      diagRecordingEnded();
    };
  }, [recording]);

  const thermalLine = `calor: ${thermal.level}${thermal.quality !== undefined ? `, gravando em ${thermal.quality}` : ''}${thermal.degraded ? ' (qualidade reduzida)' : ''}`;
  const lastThermal = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!recording) {
      lastThermal.current = undefined;
      return;
    }
    if (thermalLine === lastThermal.current) return;
    lastThermal.current = thermalLine;
    diag(thermalLine);
  }, [recording, thermalLine]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (next) => diag(`app: ${next}`));
    const native = addReplayListener('onDiag', (e) => diag(e.message));
    const interrupted = addReplayListener('onInterrupted', () => diag('câmera: INTERROMPIDA pelo iOS'));
    const resumed = addReplayListener('onResumed', () => diag('câmera: voltou'));
    return () => {
      appState.remove();
      native.remove();
      interrupted.remove();
      resumed.remove();
    };
  }, []);
}
