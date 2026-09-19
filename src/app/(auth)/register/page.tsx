"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-utils";
import { useI18n } from "@/components/language-provider";
import { DatePicker } from "@/components/date-picker";
import {
  PasswordStrengthMeter,
  PasswordMatchHint,
} from "@/components/password-strength";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function RegisterPage() {
  const { t } = useI18n();

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Debounced email validation via @el-zazo/email-verifier.
  const [emailState, setEmailState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailState("idle");
      setEmailMessage(null);
      return;
    }
    setEmailState("checking");
    setEmailMessage(null);
    const timer = setTimeout(async () => {
      try {
        const data = await fetch("/api/auth/validate-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).then((r) => r.json());
        if (data.valid) {
          setEmailState("valid");
          setEmailMessage(null);
        } else {
          setEmailState("invalid");
          setEmailMessage(data.message);
        }
      } catch {
        setEmailState("valid"); // benefit of the doubt
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [email]);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit =
    fullName.length >= 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    emailState === "valid" &&
    password.length >= 6 &&
    passwordsMatch &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          date_of_birth: dateOfBirth || null,
          email,
          password,
          confirm_password: confirmPassword,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="form-sheet p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-success text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="font-display text-xl font-bold">{t("auth.emailSent")}</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Cliquez sur le lien d'activation reçu par email pour activer votre compte. Le lien expire
          dans 24 heures.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/login">{t("auth.loginCta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="form-sheet">
      <div className="sheet-band px-6 py-5 border-b border-border rounded-t-[var(--radius)]">
        <p className="eyebrow mb-1.5">Vertrag.ma — {t("auth.registerTitle")}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("auth.registerTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.registerSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        {error && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="fullname">{t("auth.fullName")} *</Label>
          <Input
            id="fullname"
            required
            minLength={3}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("auth.fullNamePlaceholder")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dob">
            {t("auth.dateOfBirth")} <span className="text-muted-foreground">({t("common.optional")})</span>
          </Label>
          <DatePicker id="dob" value={dateOfBirth} onChange={setDateOfBirth} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">{t("auth.email")} *</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="pr-9"
            />
            {emailState === "checking" && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {emailState === "valid" && (
              <CheckCircle2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />
            )}
            {emailState === "invalid" && (
              <XCircle className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive" />
            )}
          </div>
          {emailState === "checking" && (
            <p className="text-xs text-muted-foreground">{t("auth.emailChecking")}</p>
          )}
          {emailState === "invalid" && emailMessage && (
            <p className="text-xs text-destructive">{emailMessage}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">{t("auth.password")} *</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrengthMeter password={password} />
          <p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">{t("auth.confirmPassword")} *</Label>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={confirmPassword ? (passwordsMatch ? "border-success" : "border-destructive") : ""}
          />
          <PasswordMatchHint password={password} confirmPassword={confirmPassword} />
        </div>

        <Button type="submit" className="w-full font-semibold" disabled={!canSubmit}>
          {loading ? t("common.loading") : t("auth.registerCta")}
        </Button>

        <div className="rule-dashed my-1" />

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.registerHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("auth.loginLink")}
          </Link>
        </p>
      </form>
    </div>
  );
}
