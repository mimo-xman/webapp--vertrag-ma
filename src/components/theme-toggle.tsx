"use client";

// Theme toggle — sun/moon button with a smooth cross-theme transition.
// The html.theme-transition class is added BEFORE switching and removed
// right after, so page loads never animate (no flash) — only explicit
// user toggles get the 200ms color transition (see globals.css).

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theme-transition");
      window.setTimeout(() => root.classList.remove("theme-transition"), 280);
    }
    setTheme(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={`relative h-9 w-9 text-muted-foreground hover:text-foreground ${className || ""}`}
      aria-label={resolvedTheme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}
      title={resolvedTheme === "dark" ? "Thème clair" : "Thème sombre"}
      suppressHydrationWarning
    >
      {/* Both icons render; CSS keeps only the one matching the theme —
          no hydration mismatch, smooth crossfade via opacity/rotation. */}
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
