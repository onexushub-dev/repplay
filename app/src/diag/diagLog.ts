// TEMP(diag-remote): Bluetooth remote investigation; this whole file goes with its commit.
import { File, Paths } from 'expo-file-system';

/**
 * In-app diagnostic log (Bluetooth remote investigation; temporary). One readable line per event, kept in
 * `Documents/diagnostico.txt` so it survives the app being closed, and shown and shared from the Diagnóstico screen.
 * Every file access is guarded: logging must never break a recording (and there is no file system in tests).
 */

const LOG_NAME = 'diagnostico.txt';
const FLAGS_NAME = 'diagnostico-flags.json';
/** Older lines go first; a long game logs a few hundred. */
const MAX_LINES = 5000;

let lines: string[] | undefined;
let recordingSince: number | undefined;
let flags: DiagFlags | undefined;
const listeners = new Set<() => void>();

export type DiagFlags = {
  /** Screen economy off (the screen never goes dark while recording), to compare the remote with and without it. */
  economyOff: boolean;
};

function logFile(): File {
  return new File(Paths.document, LOG_NAME);
}

function load(): string[] {
  if (lines !== undefined) return lines;
  try {
    const f = logFile();
    lines = f.exists ? f.textSync().split('\n').filter((l) => l.length > 0) : [];
  } catch {
    lines = [];
  }
  return lines;
}

function persist(all: string[]): void {
  try {
    const f = logFile();
    if (!f.exists) f.create();
    f.write(all.length > 0 ? all.join('\n') + '\n' : '');
  } catch {
    // no file system (tests) or a full disk: the log stays in memory
  }
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

function stamp(ms: number): string {
  const d = new Date(ms);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (recordingSince === undefined) return clock;
  const s = Math.max(0, Math.floor((ms - recordingSince) / 1000));
  return `${clock} [+${pad(Math.floor(s / 60))}:${pad(s % 60)}]`;
}

/** Adds one line. */
export function diag(event: string): void {
  const all = load();
  all.push(`${stamp(Date.now())} ${event}`);
  if (all.length > MAX_LINES) all.splice(0, all.length - MAX_LINES);
  persist(all);
  listeners.forEach((l) => l());
}

/** Marks a recording's start: lines after it also show the time since (`[+09:58]`). */
export function diagRecordingStarted(details: string): void {
  recordingSince = Date.now();
  diag(`===== GRAVAÇÃO INICIADA — ${details} =====`);
}

export function diagRecordingEnded(): void {
  diag('===== GRAVAÇÃO ENCERRADA =====');
  recordingSince = undefined;
}

export function diagText(): string {
  return load().join('\n');
}

export function diagClear(): void {
  lines = [];
  persist(lines);
  listeners.forEach((l) => l());
}

/** The log file's `file://` address, for the share sheet; undefined when it can't be reached. */
export function diagFileUri(): string | undefined {
  try {
    persist(load());
    return logFile().uri;
  } catch {
    return undefined;
  }
}

/** Calls `listener` after every change; returns the unsubscribe. */
export function diagSubscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function diagFlags(): DiagFlags {
  if (flags !== undefined) return flags;
  flags = { economyOff: false };
  try {
    const f = new File(Paths.document, FLAGS_NAME);
    if (f.exists) {
      const saved = JSON.parse(f.textSync()) as Partial<DiagFlags>;
      flags = { economyOff: saved.economyOff === true };
    }
  } catch {
    // defaults
  }
  return flags;
}

export function setDiagFlags(next: DiagFlags): void {
  flags = next;
  try {
    const f = new File(Paths.document, FLAGS_NAME);
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // kept for this run only
  }
  diag(`diagnóstico: economia de tela ${next.economyOff ? 'DESLIGADA' : 'ligada'}`);
}
