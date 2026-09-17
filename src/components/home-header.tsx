"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { ShieldCheck, LayoutDashboard, LogOut, UserRound } from "lucide-react";

interface AuthUser {
  _id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
}

export function HomeHeader() {
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-[#d8d5cc] bg-[#fafaf6]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-6 md:flex" aria-label="Navigation principale">
          <a href="#services" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t("home.servicesTitle")}
          </a>
          <a href="#how" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t("home.howTitle")}
          </a>
          <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t("home.pricingTitle")}
          </a>
          <a href="#faq" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t("home.faqTitle")}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-sm bg-[#e9e6dd]" />
          ) : user ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("nav.dashboard")}</span>
              </Link>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-sm border border-[#1e4475]/40 px-3 py-1.5 text-sm font-medium text-[#1e4475] hover:bg-[#1e4475]/10 transition-colors"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("nav.admin")}</span>
                </Link>
              )}
              <span className="hidden sm:inline text-sm font-medium text-muted-foreground truncate max-w-32">
                {user.full_name}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  document.cookie = "vertrag_token=; path=/; max-age=0";
                  window.location.href = "/";
                }}
                className="gap-1.5 font-medium"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t("nav.logout")}</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild className="font-semibold">
                <Link href="/register">{t("nav.register")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
