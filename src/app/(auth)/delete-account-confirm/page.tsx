"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/language-provider";
import { useAppPopup } from "@/components/app-popup";
import { TriangleAlert } from "lucide-react";

function DeleteAccountConfirmContent() {
  const { t } = useI18n();
  const token = useSearchParams().get("token");
  const { confirmApp, alertApp } = useAppPopup();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleDelete = async () => {
    const confirmed = await confirmApp(t("profile.deleteAccountFinalMessage"), {
      title: t("profile.deleteAccountFinalTitle"),
      destructive: true,
      confirmLabel: t("common.delete"),
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/confirm-delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setDone(true);
        setTimeout(() => {
          window.location.href = "/";
        }, 2500);
      } else {
        await alertApp(data.error || "Erreur");
      }
    } catch {
      await alertApp(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="form-sheet p-8 text-center">
        <h1 className="font-display text-xl font-bold">Lien invalide</h1>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Vertrag.ma</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="form-sheet p-8 text-center">
        <h1 className="font-display text-xl font-bold">{t("auth.accountDeleted")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Toutes vos données ont été effacées. Redirection…
        </p>
      </div>
    );
  }

  return (
    <div className="form-sheet">
      <div className="sheet-band px-6 py-5 border-b border-border rounded-t-[var(--radius)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-destructive/30 bg-destructive/10 text-destructive">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div>
            <p className="eyebrow mb-0.5">Vertrag.ma</p>
            <h1 className="font-display text-xl font-bold tracking-tight">
              {t("profile.deleteAccountFinalTitle")}
            </h1>
          </div>
        </div>
      </div>
      <div className="p-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("profile.deleteAccountDesc")}
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/">Annuler</Link>
          </Button>
          <Button
            variant="destructive"
            className="flex-1 font-semibold"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? t("common.loading") : t("profile.deleteAccountCta")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DeleteAccountConfirmPage() {
  return (
    <Suspense>
      <DeleteAccountConfirmContent />
    </Suspense>
  );
}
