// Server-side locale resolution from cookie (used in layouts).

import { cookies } from "next/headers";
import { isValidLocale, getDictionary, defaultLocale, type Locale } from "./i18n";

export async function getLocaleAndDict(): Promise<{ locale: Locale; dict: Record<string, unknown> }> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("vertrag_locale")?.value;
  const locale = isValidLocale(cookieLocale) ? cookieLocale : defaultLocale;
  return { locale, dict: getDictionary(locale) as Record<string, unknown> };
}
