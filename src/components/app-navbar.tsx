"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/language-provider";
import { apiFetch } from "@/lib/api-utils";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Send,
  FileStack,
  FolderOpen,
  UserRound,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppNavbar({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/postulations", label: t("nav.postulations"), icon: Send },
    { href: "/demandes", label: t("nav.demandes"), icon: FileStack },
    { href: "/dossier", label: t("nav.dossier"), icon: FolderOpen },
    { href: "/profile", label: t("nav.profile"), icon: UserRound },
  ];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    document.cookie = "vertrag_token=; path=/; max-age=0";
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#d8d5cc] bg-[#fafaf6]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Logo />

        {/* Desktop nav */}
        <nav className="ml-6 hidden items-center gap-0.5 lg:flex" aria-label="Navigation principale">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#1e4475] text-[#f4f2ec]"
                    : "text-muted-foreground hover:bg-[#e9e6dd] hover:text-foreground"
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "ml-1 flex items-center gap-1.5 rounded-sm border border-[#1e4475]/40 px-3 py-1.5 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-[#1a1d21] text-[#f4f2ec] border-[#1a1d21]"
                  : "text-[#1e4475] hover:bg-[#1e4475]/10"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("nav.admin")}
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-1.5 font-medium"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("nav.logout")}</span>
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav
        className="flex items-center gap-1 overflow-x-auto scroll-slim border-t border-[#d8d5cc] px-3 py-1.5 lg:hidden"
        aria-label="Navigation mobile"
      >
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-[#1e4475] text-[#f4f2ec]"
                  : "text-muted-foreground hover:bg-[#e9e6dd] hover:text-foreground"
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-[#1a1d21] text-[#f4f2ec]"
                : "text-[#1e4475] hover:bg-[#1e4475]/10"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("nav.admin")}
          </Link>
        )}
      </nav>
    </header>
  );
}
