"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-utils";
import { useI18n } from "@/components/language-provider";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionReason = searchParams.get("reason");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        requires2FA?: boolean;
        userId?: string;
        user?: { role: string };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (data.requires2FA && data.userId) {
        setUserId(data.userId);
      } else if (data.user) {
        router.push(data.user.role === "admin" ? "/admin" : "/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        success: boolean;
        user: { role: string };
        warning?: string;
      }>("/api/auth/2fa/challenge", {
        method: "POST",
        body: JSON.stringify({ userId, code }),
      });
      if (data.warning) {
        toast({ title: data.warning, variant: "destructive" });
      }
      router.push(data.user.role === "admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-sheet">
      {/* Form band header */}
      <div className="sheet-band px-6 py-5 border-b border-border rounded-t-[var(--radius)]">
        <p className="eyebrow mb-1.5">Vertrag.ma — {t("auth.loginTitle")}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {userId ? t("auth.twoFATitle") : t("auth.loginTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {userId ? t("auth.twoFASubtitle") : t("auth.loginSubtitle")}
        </p>
      </div>

      <div className="p-6">
        {sessionReason === "session_expired" && (
          <div className="mb-4 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
            {t("auth.sessionExpired")}
          </div>
        )}
        {sessionReason === "auth_required" && (
          <div className="mb-4 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
            {t("auth.authRequired")}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {!userId ? (
          <form onSubmit={handleLogin} className="space-y-4">
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              {loading ? t("common.loading") : t("auth.loginCta")}
            </Button>
          </form>
        ) : (
          <form onSubmit={handle2FA} className="space-y-4">
            <div className="flex items-center gap-3 rounded-sm border border-border bg-paper p-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <p className="text-xs text-muted-foreground">{t("auth.twoFAOrBackup")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">{t("auth.twoFACode")}</Label>
              <Input
                id="code"
                required
                autoFocus
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456 / ABCD1234"
                className="font-mono tracking-widest text-center text-lg"
                maxLength={10}
              />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={loading}>
              <KeyRound className="mr-2 h-4 w-4" />
              {loading ? t("common.loading") : t("auth.twoFACta")}
            </Button>
          </form>
        )}

        <div className="rule-dashed my-5" />

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.loginNoAccount")}{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {t("auth.registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
