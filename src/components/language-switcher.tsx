"use client";

import { useI18n } from "@/components/language-provider";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors",
        className
      )}
      aria-label="Changer de langue"
    >
      <Languages className="h-3.5 w-3.5" />
      {locale === "fr" ? "FR" : "EN"}
    </button>
  );
}
