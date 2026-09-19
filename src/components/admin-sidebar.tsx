"use client";

// Admin navigation — dark "file cabinet" sidebar with the Amt aesthetic.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useI18n } from "@/components/language-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderTree,
  Building2,
  Users,
  Send,
  FileStack,
  FolderUp,
  FilePlus2,
  Mail,
  Settings,
  ScrollText,
  LogOut,
  ArrowLeft,
  Menu,
  Inbox,
  Activity,
} from "lucide-react";
import { useState } from "react";

export function AdminSidebar({ userEmail }: { userEmail: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = [
    { href: "/admin", label: t("admin.dashboard"), icon: LayoutDashboard, exact: true },
    { href: "/admin/categories", label: t("admin.categories"), icon: FolderTree },
    { href: "/admin/companies", label: t("admin.companies"), icon: Building2 },
    { href: "/admin/users", label: t("admin.users"), icon: Users },
    { href: "/admin/postulations", label: t("admin.postulations"), icon: Send },
    { href: "/admin/demandes-postulations", label: t("admin.demandesPostulations"), icon: FileStack },
    { href: "/admin/demandes-ajout-dossier", label: t("admin.demandesAjout"), icon: FolderUp },
    { href: "/admin/demandes-creation-dossier", label: t("admin.demandesCreation"), icon: FilePlus2 },
    { href: "/admin/mail-senders", label: t("admin.mailSenders"), icon: Mail },
    { href: "/admin/executions", label: t("admin.executions"), icon: Activity },
    { href: "/admin/messages", label: t("admin.messages"), icon: Inbox },
    { href: "/admin/settings", label: t("admin.settings"), icon: Settings },
    { href: "/admin/audit-logs", label: t("admin.auditLogs"), icon: ScrollText },
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

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[#2a2e34] px-4 py-4">
        <Logo inverted />
        <p className="eyebrow mt-1 !text-[#75797f]">Verwaltung</p>
      </div>

      {/* User */}
      <div className="border-b border-[#2a2e34] px-4 py-3">
        <p className="truncate font-mono text-xs text-[#9a9ea6]">{userEmail}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto scroll-slim p-2" aria-label="Navigation admin">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[#f4f2ec] text-[#1a1d21]"
                  : "text-[#9a9ea6] hover:bg-[#2a2e34] hover:text-[#f4f2ec]"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-[#2a2e34] p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium text-[#9a9ea6] transition-colors hover:bg-[#2a2e34] hover:text-[#f4f2ec]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("nav.dashboard")}
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium text-[#9a9ea6] transition-colors hover:bg-[#2a2e34] hover:text-[#f4f2ec]"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.logout")}
        </button>
        <div className="pt-2">
          <LanguageSwitcher className="border-[#2a2e34] bg-transparent text-[#9a9ea6] hover:text-[#f4f2ec] hover:border-[#9a9ea6]" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 bg-[#1a1d21] lg:block">
        {sidebar}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between border-b border-[#2a2e34] bg-[#1a1d21] px-4 lg:hidden">
        <Logo inverted />
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-sm p-2 text-[#9a9ea6] hover:text-[#f4f2ec]"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-[#1a1d21] pt-12">{sidebar}</aside>
        </div>
      )}
      <div className="h-12 lg:hidden" />
    </>
  );
}
