"use client";

// Client-side i18n context. Locale stored in cookie, set server-side in layouts.

import { createContext, useCallback, useContext, useMemo } from "react";

export type Locale = "fr" | "en";

type Dict = Record<string, unknown>;

function resolve(dict: Dict, path: string): string {
  const parts = path.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Dict)) {
      current = (current as Dict)[part];
    } else {
      return path;
    }
  }
  return typeof current === "string" ? current : path;
}

interface I18nContextValue {
  locale: Locale;
  t: (path: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dict;
  children: React.ReactNode;
}) {
  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => {
      let value = resolve(dictionary, path);
      if (vars) {
        for (const [key, replacement] of Object.entries(vars)) {
          value = value.replace(new RegExp(`\\{${key}\\}`, "g"), String(replacement));
        }
      }
      return value;
    },
    [dictionary]
  );

  const setLocale = useCallback((newLocale: Locale) => {
    document.cookie = `vertrag_locale=${newLocale}; path=/; max-age=31536000`;
    window.location.reload();
  }, []);

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside LanguageProvider");
  return context;
}
