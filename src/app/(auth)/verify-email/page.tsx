"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/language-provider";
import { CheckCircle2, XCircle } from "lucide-react";

function VerifyEmailContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) {
      // Defer to avoid synchronous setState in effect body.
      const timer = setTimeout(() => setState("error"), 0);
      return () => clearTimeout(timer);
    }
    let cancelled = false;
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setState(data.success ? "success" : "error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="form-sheet p-8 text-center">
      {state === "loading" && (
        <>
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </>
      )}
      {state === "success" && (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-success text-success stamp-anim">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-bold">{t("auth.verifySuccess")}</h1>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              {t("auth.loginCta")} →
            </Link>
          </div>
        </>
      )}
      {state === "error" && (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-destructive text-destructive">
            <XCircle className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-bold">{t("auth.verifyFail")}</h1>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/register">{t("auth.registerCta")}</Link>
          </Button>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
