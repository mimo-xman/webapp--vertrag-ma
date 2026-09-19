"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, Save } from "lucide-react";

type CloudinaryTestStatus = "ok" | "blocked" | "not_configured" | "error";

interface CloudinaryTestResult {
  status: CloudinaryTestStatus;
  message: string;
  testedUrl?: string;
}

interface PricingAxis {
  step: number;
  step_price: number;
  min: number;
  max: number;
  free_amount: number;
}

interface SettingsData {
  postulation_pricing: {
    total: PricingAxis;
    per_day: PricingAxis;
  };
  postulations: { email_message: string; email_subject: string };
  dossier: { creation_price: number; add_price: number };
  contact: { whatsapp_url: string };
}

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const { alertApp } = useAppPopup();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [cloudTest, setCloudTest] = useState<CloudinaryTestResult | null>(null);
  const [cloudTesting, setCloudTesting] = useState(false);

  useEffect(() => {
    apiFetch<{ settings: SettingsData }>("/api/admin/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => {});
  }, []);

  // Cloudinary self-diagnostic: upload a tiny test PDF, verify its public
  // delivery, then the server deletes the test asset. Returns the exact fix
  // steps when the account blocks PDF delivery (console setting).
  const handleCloudinaryTest = async () => {
    setCloudTesting(true);
    setCloudTest(null);
    try {
      const data = await apiFetch<{ result: CloudinaryTestResult }>(
        "/api/admin/cloudinary-test",
        { method: "POST" }
      );
      setCloudTest(data.result);
    } catch (err) {
      setCloudTest({
        status: "error",
        message: err instanceof Error ? err.message : "Erreur lors du test.",
      });
    } finally {
      setCloudTesting(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      toast({ title: t("admin.settingsSaved") });
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="p-6">
        <div className="h-40 animate-pulse rounded-sm bg-muted" />
      </div>
    );
  }

  // Update one axis (total / per_day) of the postulation pricing.
  const setAxis = (axis: "total" | "per_day", key: keyof PricingAxis, value: number) => {
    setSettings({
      ...settings,
      postulation_pricing: {
        ...settings.postulation_pricing,
        [axis]: { ...settings.postulation_pricing[axis], [key]: value },
      },
    });
  };

  // One labeled number input bound to a pricing axis field.
  const axisField = (
    axis: "total" | "per_day",
    key: keyof PricingAxis,
    label: string,
    hint?: string,
    step = "1"
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        value={settings.postulation_pricing[axis][key]}
        onChange={(e) => setAxis(axis, key, Number(e.target.value))}
      />
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );

  // ── One pricing sub-section: [Postulations total] or [Postulation/jour] ──
  const pricingSubSection = (axis: "total" | "per_day") => {
    const isTotal = axis === "total";
    const stepValue = settings.postulation_pricing[axis].step;
    return (
      <div className="rounded-sm border border-border bg-paper">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="font-display text-sm font-bold">
            {isTotal ? t("admin.pricingSubTotal") : t("admin.pricingSubPerDay")}
          </h3>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {axisField(axis, "step", t("admin.stepOptionsLabel"))}
          {axisField(
            axis,
            "step_price",
            t("admin.stepPriceLabel"),
            t("admin.stepPriceHint").replace("{step}", String(stepValue)),
            "0.5"
          )}
          {axisField(axis, "min", t("admin.minLabel"))}
          {axisField(axis, "max", t("admin.maxLabel"), t("admin.maxLabelHint"))}
          {axisField(
            axis,
            "free_amount",
            t("admin.freeAmountLabel"),
            t("admin.freeAmountHint")
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.settings")}
        subtitle={t("admin.settingsSubtitle")}
        actions={
          <Button onClick={handleSave} disabled={saving} className="font-semibold">
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Section [Postulations] — two independent pricing axes ── */}
        <div className="form-sheet lg:col-span-2">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">
              {t("admin.pricingSectionPostulations")} — {t("demandes.priceTitle")}
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {t("admin.pricingSectionPostulationsHint")}
            </p>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {pricingSubSection("total")}
            {pricingSubSection("per_day")}
          </div>
        </div>

        {/* ── Section [Dossier] — creation & add prices ── */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">
              {t("admin.pricingSectionDossier")} — {t("demandes.priceTitle")}
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {t("admin.pricingSectionDossierHint")}
            </p>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("admin.dossierCreationPrice")}</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={settings.dossier.creation_price}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dossier: {
                      ...settings.dossier,
                      creation_price: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.dossierAddPrice")}</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={settings.dossier.add_price ?? 0}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dossier: {
                      ...settings.dossier,
                      add_price: Number(e.target.value),
                    },
                  })
                }
              />
              <p className="text-xs leading-snug text-muted-foreground">
                {t("admin.dossierAddPriceHintV2")}
              </p>
            </div>
          </div>
        </div>

        {/* Email message to companies */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">
              {t("admin.emailMessageLabel")}
            </h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label>{t("admin.emailSubjectLabel")}</Label>
              <Input
                value={settings.postulations.email_subject}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    postulations: {
                      ...settings.postulations,
                      email_subject: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.emailMessageLabel")}</Label>
              <Textarea
                value={settings.postulations.email_message}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    postulations: {
                      ...settings.postulations,
                      email_message: e.target.value,
                    },
                  })
                }
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{t("admin.emailMessageHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.whatsappUrl")}</Label>
              <Input
                value={settings.contact.whatsapp_url}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    contact: { whatsapp_url: e.target.value },
                  })
                }
                placeholder="https://wa.me/2126XXXXXXXX"
              />
            </div>
          </div>
        </div>
        {/* Cloudinary — PDF hosting diagnostic */}
        <div className="form-sheet lg:col-span-2">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("admin.cloudinaryTitle")}</h2>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">{t("admin.cloudinaryHint")}</p>
            <div>
              <Button
                variant="outline"
                onClick={handleCloudinaryTest}
                disabled={cloudTesting}
                className="font-semibold"
              >
                <CloudUpload className="mr-1.5 h-4 w-4" />
                {cloudTesting ? t("common.loading") : t("admin.cloudinaryTestBtn")}
              </Button>
            </div>
            {cloudTest && (
              <div
                className={`rounded-sm border p-4 text-sm leading-relaxed ${
                  cloudTest.status === "ok"
                    ? "border-success/30 bg-success/10"
                    : cloudTest.status === "not_configured"
                      ? "border-warning/40 bg-warning/10"
                      : "border-destructive/30 bg-destructive/10"
                }`}
              >
                <p className="mb-1 font-display font-bold">
                  {cloudTest.status === "ok"
                    ? t("admin.cloudinaryStatusOk")
                    : cloudTest.status === "blocked"
                      ? t("admin.cloudinaryStatusBlocked")
                      : cloudTest.status === "not_configured"
                        ? t("admin.cloudinaryStatusNotConfigured")
                        : t("admin.cloudinaryStatusError")}
                </p>
                <p className="break-all whitespace-pre-line text-muted-foreground">
                  {cloudTest.message}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
