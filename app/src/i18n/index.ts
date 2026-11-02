import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { type AppLocale, resolveLocale } from './locale';
import { en, type Messages } from './locales/en';
import { ptBR } from './locales/pt-BR';

export { type AppLocale, resolveLocale, voiceLocale, VOICE_WORD, type VoiceLocale } from './locale';
export type { Messages };

type Plural = { one: string; other: string };
type Leaf = string | Plural;
type Paths<T> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

/** Every translatable text: a dot path to a string or a plural (`{ one, other }`, picked by `count`). */
export type MessageKey = Paths<Messages>;
export type MessageParams = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: MessageParams) => string;

export const catalogs: Record<AppLocale, Messages> = { en, 'pt-BR': ptBR };

// The default pluralizer is English's (1 → one, else other), which is also how Brazilian apps count ("0 clipes").
const i18n = new I18n(catalogs);
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

/** `key` in `locale`, with `%{name}` placeholders filled from `params`. */
export function translate(locale: AppLocale, key: MessageKey, params?: MessageParams): string {
  return i18n.t(key, { ...params, locale });
}

function deviceTags(): string[] {
  try {
    return getLocales().map((l) => l.languageTag);
  } catch {
    return [];
  }
}

let current: AppLocale = resolveLocale(deviceTags());
const listeners = new Set<() => void>();

/** The language the app shows now. */
export function currentLocale(): AppLocale {
  return current;
}

export function setLocale(locale: AppLocale): void {
  if (locale === current) return;
  current = locale;
  i18n.locale = locale;
  listeners.forEach((fn) => fn());
}
i18n.locale = current;

/** Re-reads the device languages (Android can change them while the app runs) and switches when they changed. */
export function syncLocale(tags: string[] = deviceTags()): void {
  setLocale(resolveLocale(tags));
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** For code outside React: the text in the current language, read at call time. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(current, key, params);
}
