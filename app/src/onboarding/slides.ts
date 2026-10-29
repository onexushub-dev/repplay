/** The onboarding stories: five slides grouped in four steps (Save has two: the free ways and the Pro ones). */
export type SlideId = 'record' | 'saveFree' | 'savePro' | 'edit' | 'share';

export type Slide = {
  id: SlideId;
  /** Index into STEPS: the label the slide belongs to in the progress bar. */
  step: number;
  /** How long the slide stays before the next one; 0 means it waits for the player (the last one). */
  ms: number;
  /** How many option cards the slide rotates through (0 when it has none). */
  cards: number;
};

export const SLIDES: readonly Slide[] = [
  { id: 'record', step: 0, ms: 7000, cards: 0 },
  { id: 'saveFree', step: 1, ms: 11000, cards: 4 },
  { id: 'savePro', step: 1, ms: 9000, cards: 2 },
  { id: 'edit', step: 2, ms: 7500, cards: 0 },
  { id: 'share', step: 3, ms: 0, cards: 0 },
];

export const STEP_COUNT = 4;

/** How long each option card shows before the next one takes its place. */
export const CARD_MS = 2700;

export type WayId = 'tap' | 'wave' | 'voice' | 'phone' | 'watch' | 'bluetooth';

export const FREE_WAYS: readonly WayId[] = ['tap', 'wave', 'voice', 'phone'];
export const PRO_WAYS: readonly WayId[] = ['watch', 'bluetooth'];

/** The ways to save a play a slide shows as cards. */
export function waysOf(slide: SlideId): readonly WayId[] {
  return slide === 'saveFree' ? FREE_WAYS : slide === 'savePro' ? PRO_WAYS : [];
}

/** Splits a text at its `*highlighted*` word: [before, highlighted, after]; with no marker the whole text is "before". */
export function splitHighlight(text: string): [string, string, string] {
  const match = /^(.*?)\*(.+?)\*(.*)$/s.exec(text);
  return match ? [match[1], match[2], match[3]] : [text, '', ''];
}
