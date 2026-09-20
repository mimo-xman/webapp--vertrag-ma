"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/language-provider";
import { ShieldOff, CheckCircle2, XCircle } from "lucide-react";

function TwoFADisableContent() {
  const { t } = useI18n();
  const status = useSearchParams().get("status");

  return (
    <div className="form-sheet p-8 text-center">
      {status === "success" ? (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-success text-success stamp-anim">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-bold">{t("auth.2faDisableTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.2faDisabledSuccess")}
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-destructive text-destructive">
            {status === "invalid" ? <XCircle className="h-7 w-7" /> : <ShieldOff className="h-7 w-7" />}
          </div>
          <h1 className="font-display text-xl font-bold">
            {status === "invalid" ? t("auth.2faLinkInvalid") : t("auth.2faDisableTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "invalid"
              ? t("auth.2faLinkInvalidDesc")
              : t("auth.2faErrorRetry")}
          </p>
        </>
      )}
      <Button asChild variant="outline" className="mt-6">
        <Link href="/login">{t("auth.loginCta")}</Link>
      </Button>
    </div>
  );
}

export default function TwoFADisablePage() {
  return (
    <Suspense>
      <TwoFADisableContent />
    </Suspense>
  );
}
