import type { VoiceLocale } from '../../modules/replay-camera/src/ReplayCamera.types';

/** The languages the app ships. English is the default for every other device language. */
export type AppLocale = 'en' | 'pt-BR';

export type { VoiceLocale };

/**
 * The app language for the device's preferred languages, in the user's order: the first Portuguese one gives
 * pt-BR (pt-PT included), the first English one gives en; unsupported ones are skipped; nothing supported gives en.
 */
export function resolveLocale(tags: string[]): AppLocale {
  for (const tag of tags) {
    const language = tag.split(/[-_]/)[0].toLowerCase();
    if (language === 'pt') return 'pt-BR';
    if (language === 'en') return 'en';
  }
  return 'en';
}

/** The speech recognizer's language for an app language. */
export function voiceLocale(locale: AppLocale): VoiceLocale {
  return locale === 'pt-BR' ? 'pt-BR' : 'en-US';
}

/**
 * The spoken save command shown in the UI, per app language (one word since 2026-11-01: "salvar"/"save"; "gravar"/
 * "record" said the wrong thing, the app saves a clip). The native list lives in ReplayCore's
 * VoiceCommand.swift and the permission prompt in app/locales/*.json: change all three together.
 */
export const VOICE_WORD: Record<AppLocale, string> = {
  'pt-BR': 'salvar',
  en: 'save',
};
