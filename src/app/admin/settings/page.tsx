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
import { Save } from "lucide-react";

interface SettingsData {
  postulation_demandes: {
    price_of_hundred_total: number;
    price_of_hundred_per_day: number;
    free_per_day_amount: number;
    min_total: number;
    min_per_day: number;
    step_total: number;
    step_per_day: number;
  };
  postulations: { email_message: string; email_subject: string };
  dossier: { creation_price: number };
  contact: { whatsapp_url: string };
}

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const { alertApp } = useAppPopup();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ settings: SettingsData }>("/api/admin/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => {});
  }, []);

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

  const num = (key: keyof SettingsData["postulation_demandes"], label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step="0.5"
        value={settings.postulation_demandes[key]}
        onChange={(e) =>
          setSettings({
            ...settings,
            postulation_demandes: {
              ...settings.postulation_demandes,
              [key]: Number(e.target.value),
            },
          })
        }
      />
    </div>
  );

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
        {/* Pricing */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("demandes.priceTitle")}</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {num("price_of_hundred_total", t("admin.priceHundredTotal"))}
            {num("price_of_hundred_per_day", t("admin.priceHundredPerDay"))}
            {num("free_per_day_amount", t("admin.freePerDay"))}
            {num("min_total", "Minimum total")}
            {num("min_per_day", "Minimum par jour")}
            {num("step_total", "Pas des options total")}
            {num("step_per_day", "Pas des options par jour")}
            <div className="space-y-1.5">
              <Label>{t("admin.dossierCreationPrice")}</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={settings.dossier.creation_price}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dossier: { creation_price: Number(e.target.value) },
                  })
                }
              />
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
      </div>
    </div>
  );
}
