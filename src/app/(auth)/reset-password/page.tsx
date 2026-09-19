"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-utils";
import { useI18n } from "@/components/language-provider";
import { useAppPopup } from "@/components/app-popup";
import { CheckCircle2 } from "lucide-react";

function ResetPasswordContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { alertApp } = useAppPopup();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      await alertApp("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="form-sheet p-8 text-center">
        <h1 className="font-display text-xl font-bold">{t("auth.verifyFail")}</h1>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/forgot-password">{t("auth.forgotCta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="form-sheet">
      <div className="sheet-band px-6 py-5 border-b border-border rounded-t-[var(--radius)]">
        <p className="eyebrow mb-1.5">Vertrag.ma</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("auth.resetTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.resetSubtitle")}</p>
      </div>

      <div className="p-6">
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-success text-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground">{t("auth.resetSuccess")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.newPassword")}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              {loading ? t("common.loading") : t("auth.resetCta")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
