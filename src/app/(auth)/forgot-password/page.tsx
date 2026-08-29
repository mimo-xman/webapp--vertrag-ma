"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-utils";
import { useI18n } from "@/components/language-provider";
import { MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setSent(true); // anti-enumeration: same behavior
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-sheet">
      <div className="sheet-band px-6 py-5 border-b border-border rounded-t-[var(--radius)]">
        <p className="eyebrow mb-1.5">Vertrag.ma</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("auth.forgotTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgotSubtitle")}</p>
      </div>

      <div className="p-6">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-[#2f6b4a] text-[#2f6b4a]">
              <MailCheck className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("auth.forgotSent")}</p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/login">{t("auth.forgotBack")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
              />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              {loading ? t("common.loading") : t("auth.forgotCta")}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                ← {t("auth.forgotBack")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
