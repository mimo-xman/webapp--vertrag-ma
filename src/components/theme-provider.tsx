"use client";

// Dark theme provider - next-themes with the "Das Amt" design system.
// class-based strategy (see the .dark block in globals.css), system default
// so the app follows the OS preference until the user makes an explicit
// choice (stored in localStorage by next-themes).

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="vertrag_theme"
    >
      {children}
    </NextThemesProvider>
  );
}
