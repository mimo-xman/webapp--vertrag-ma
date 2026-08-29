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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-[#2f6b4a] text-[#2f6b4a] stamp-anim">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-bold">2FA désactivé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            La double authentification a été désactivée. Vous pouvez vous reconnecter normalement.
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-[#b3391f] text-[#b3391f]">
            {status === "invalid" ? <XCircle className="h-7 w-7" /> : <ShieldOff className="h-7 w-7" />}
          </div>
          <h1 className="font-display text-xl font-bold">
            {status === "invalid" ? "Lien invalide ou expiré" : "Désactivation du 2FA"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "invalid"
              ? "Ce lien de désactivation est invalide ou a expiré."
              : "Une erreur est survenue. Réessayez depuis votre profil."}
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
