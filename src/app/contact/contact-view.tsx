"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LifeBuoy, Send, CheckCircle2, ArrowLeft } from "lucide-react";

const REASONS = [
  { value: "account_suspended", key: "contact.reasonSuspended" },
  { value: "postulations", key: "contact.reasonPostulations" },
  { value: "dossier", key: "contact.reasonDossier" },
  { value: "payment", key: "contact.reasonPayment" },
  { value: "other", key: "contact.reasonOther" },
] as const;

export function ContactView({ defaultName, defaultEmail }: { defaultName: string; defaultEmail: string }) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    fullName.trim().length >= 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    reason !== "" &&
    message.trim().length >= 10 &&
    !sending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          reason,
          message: message.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Une erreur est survenue");
      }
      setSentRef(data.ref_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setSending(false);
    }
  };

  if (sentRef) {
    return (
      <div className="form-sheet p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-sm border border-[#2f6b4a]/30 bg-[#2f6b4a]/10">
          <CheckCircle2 className="h-7 w-7 text-[#2f6b4a]" />
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          {t("contact.successTitle")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("contact.successDesc")}
        </p>
        <p className="aktenzeichen mt-4 border border-dashed border-[#d8d5cc] bg-[#fafaf6] px-4 py-2.5">
          {t("contact.yourRef")}: <span className="num font-semibold">{sentRef}</span>
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("contact.backHome")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="form-sheet p-8">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-sm border border-[#1e4475]/30 bg-[#1e4475]/5">
        <LifeBuoy className="h-7 w-7 text-[#1e4475]" />
      </div>

      <h1 className="font-display text-2xl font-extrabold tracking-tight">
        {t("contact.title")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("contact.subtitle")}
      </p>

      <div className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label>{t("contact.fullName")}</Label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("auth.fullNamePlaceholder")}
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("contact.email")}</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t("contact.reason")}</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder={t("contact.reasonPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {t(r.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("contact.message")}</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder={t("contact.messagePlaceholder")}
            maxLength={5000}
          />
          <p className="text-xs text-muted-foreground">{t("contact.messageHint")}</p>
        </div>

        {error && (
          <p className="rounded-sm border border-[#b3391f]/30 bg-[#b3391f]/10 px-3 py-2 text-sm text-[#b3391f]">
            {error}
          </p>
        )}

        <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full font-semibold">
          {sending ? (
            t("common.loading")
          ) : (
            <>
              <Send className="mr-1.5 h-4 w-4" />
              {t("contact.submit")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
