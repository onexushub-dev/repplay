/**
 * When the app was in the background, so a duration measured on the wall clock can say how much of it the app was
 * away (2026-11-02: a 43 s clip showed "analisado em 2504 s": the analysis waited 41 minutes in the background).
 */
export type BackgroundClock = {
  background(at: number): void;
  foreground(at: number): void;
  /** Milliseconds the app spent in the background between `from` and `to` (a stretch still going counts to `to`). */
  backgroundMsBetween(from: number, to: number): number;
};

/** Stretches older than this are forgotten (no analysis lasts that long). */
const KEEP_MS = 6 * 60 * 60 * 1000;

export function createBackgroundClock(): BackgroundClock {
  const stretches: { from: number; to: number | undefined }[] = [];
  const open = () => (stretches.length > 0 && stretches[stretches.length - 1].to === undefined ? stretches[stretches.length - 1] : undefined);

  return {
    background(at) {
      if (open() !== undefined) return;
      stretches.push({ from: at, to: undefined });
      while (stretches.length > 0 && stretches[0].to !== undefined && at - (stretches[0].to as number) > KEEP_MS) stretches.shift();
    },
    foreground(at) {
      const current = open();
      if (current !== undefined) current.to = at;
    },
    backgroundMsBetween(from, to) {
      let total = 0;
      for (const s of stretches) {
        const end = s.to === undefined ? to : s.to;
        total += Math.max(0, Math.min(end, to) - Math.max(s.from, from));
      }
      return total;
    },
  };
}
