"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { LifeBuoy, LogOut, ShieldAlert } from "lucide-react";

export function SuspendedView({ email, reason }: { email: string; reason: string | null }) {
  const { t } = useI18n();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — clear the cookie client-side anyway
    }
    document.cookie = "vertrag_token=; path=/; max-age=0";
    window.location.href = "/login";
  };

  return (
    <div className="form-sheet relative p-8">
      <div className="stamp stamp-red stamp-anim absolute -right-3 -top-3 rotate-6 !text-xs sm:!text-sm">
        GESPERRT
      </div>

      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-sm border border-destructive/30 bg-destructive/10">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>

      <h1 className="font-display text-2xl font-extrabold tracking-tight">
        {t("suspended.title")}
      </h1>
      <p className="aktenzeichen mt-1">{email}</p>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {t("suspended.message")}
      </p>

      {reason && (
        <div className="mt-4 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5">
          <p className="eyebrow mb-1 !text-warning">{t("suspended.reasonLabel")}</p>
          <p className="text-sm leading-relaxed text-warning">{reason}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Button asChild className="font-semibold">
          <Link href="/contact">
            <LifeBuoy className="mr-1.5 h-4 w-4" />
            {t("suspended.contactCta")}
          </Link>
        </Button>
        <Button variant="outline" onClick={handleLogout} disabled={loggingOut}>
          <LogOut className="mr-1.5 h-4 w-4" />
          {loggingOut ? t("common.loading") : t("nav.logout")}
        </Button>
      </div>
    </div>
  );
}
