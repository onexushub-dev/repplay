/**
 * Cut suggestion (experiment; prototype and numbers in docs/superpowers/backlog.md): finds the play inside a clip from
 * how much of the court moved every 100 ms (written by the Modo Foco analysis) and proposes a cut around it.
 *
 * The save comes right after the play, so among the stretches of activity the one closest to the save weighs most;
 * the cut keeps a little lead-in, and when the play runs up to the save it ends at the save.
 */

export type MotionSample = [tMs: number, share: number];
type Cut = { startMs: number; endMs: number };

const STEP_S = 0.1;
const SMOOTH = 10; // 1 s
const ACTIVE = 0.35; // on the clip's own scale: 0 its quiet level (20th percentile), 1 its busy level (95th)
const MERGE_S = 2; // pauses shorter than this stay inside one play
const MIN_STRETCH_S = 1.5;
const PRE_S = 2.5; // lead-in before the activity starts
const POST_S = 0.5;
const TO_SAVE_S = 5; // a play ending this close to the save runs up to it
const MIN_S = 6;
const MAX_S = 15;

function percentile(sorted: number[], p: number): number {
  const at = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Mean of the `SMOOTH` samples around each one (zeros past the ends). */
function smooth(x: number[]): number[] {
  const back = Math.floor(SMOOTH / 2);
  return x.map((_, i) => {
    let sum = 0;
    for (let j = i - back; j < i - back + SMOOTH; j++) if (j >= 0 && j < x.length) sum += x[j];
    return sum / SMOOTH;
  });
}

/** The suggested cut inside `window` (file ms), or undefined when the motion says nothing (too short, no samples). */
export function suggestCut(samples: MotionSample[], window: Cut): Cut | undefined {
  const values = samples.filter(([t]) => t >= window.startMs && t < window.endMs).map(([, v]) => v);
  if (values.length < (MIN_S / STEP_S) * 1.5) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = percentile(sorted, 20);
  const hi = percentile(sorted, 95);
  if (hi - lo <= 0) return undefined; // a still picture: nothing to pick
  const act = smooth(values.map((v) => Math.min(1.5, Math.max(0, (v - lo) / (hi - lo + 1e-9)))));
  const dur = values.length * STEP_S;

  const stretches: [number, number][] = [];
  for (let i = 0; i < act.length; ) {
    if (act[i] > ACTIVE) {
      let j = i;
      while (j < act.length && act[j] > ACTIVE) j++;
      const last = stretches[stretches.length - 1];
      if (last && (i - last[1]) * STEP_S < MERGE_S) last[1] = j;
      else stretches.push([i, j]);
      i = j;
    } else i++;
  }
  let best: [number, number] | undefined;
  let bestScore = -1;
  for (const s of stretches) {
    if ((s[1] - s[0]) * STEP_S < MIN_STRETCH_S) continue;
    let energy = 0;
    for (let i = s[0]; i < s[1]; i++) energy += act[i];
    const recency = (s[1] * STEP_S) / dur;
    const score = energy * STEP_S * (0.4 + 0.6 * recency * recency);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }

  let a: number;
  let b: number;
  if (!best) {
    a = dur - 10;
    b = dur;
  } else {
    a = best[0] * STEP_S - PRE_S;
    b = Math.min(dur, best[1] * STEP_S + POST_S);
    if (dur - b < TO_SAVE_S) b = dur;
  }
  if (b - a < MIN_S) a = b - MIN_S;
  if (b - a > MAX_S) a = b - MAX_S; // the end stays: the play finishes there
  a = Math.max(0, a);
  const startMs = Math.round(window.startMs + a * 1000);
  const endMs = Math.min(window.endMs, Math.round(window.startMs + b * 1000));
  return { startMs, endMs };
}
