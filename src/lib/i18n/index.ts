// Lightweight i18n foundation: cookie-based locale, type-safe dictionaries.
// Adding a language = add one dictionary file + register it below.

import fr from "./dictionaries/fr";
import en from "./dictionaries/en";

export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";
export const LOCALE_COOKIE = "vertrag_locale";

const dictionaries: Record<Locale, unknown> = { fr, en };

export function getDictionary(locale: Locale) {
  return dictionaries[locale] || dictionaries[defaultLocale];
}

export function isValidLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
