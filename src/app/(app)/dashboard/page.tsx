"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-utils";
import { useI18n } from "@/components/language-provider";
import { StatusStamp } from "@/components/stamp";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createStatusKey,
  addStatusKey,
  statusVariant,
  createPriceParts,
  addPriceParts,
  type DossierDemandeType,
  type StatusLike,
} from "@/lib/dossier-status";
import {
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  FolderOpen,
  CalendarDays,
  FolderX,
  FilePlus2,
  FolderUp,
} from "lucide-react";

interface DemandeInfo {
  type: DossierDemandeType;
  ref_number: string;
  status: string;
  cancelled_by: "user" | "admin" | null;
  price: number;
  traduction_price: number;
  payed_at: string | null;
  created_at: string;
}

interface StatsResponse {
  stats: {
    postulations: { total: number; envoyee: number; en_attente: number; echouee: number; re_execute: number };
    demandes: { total: number; en_attente: number; payed: number; canceled: number };
    dossier: {
      has_dossier: boolean;
      dossier_pdf_link: string | null;
      active_demande: DemandeInfo | null;
      last_demande: DemandeInfo | null;
      total_add_demandes: number;
      total_create_demandes: number;
    };
  };
  upcoming: { _id: string; scheduled_at: string; company_name: string }[];
}

export default function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<StatsResponse>("/api/dashboard/stats")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-sm bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-sm bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { stats } = data;

  const cards = [
    {
      label: t("dashboard.postulationsTotal"),
      value: stats.postulations.total,
      icon: Send,
      color: "#1e4475",
    },
    {
      label: t("dashboard.postulationsSent"),
      value: stats.postulations.envoyee,
      icon: CheckCircle2,
      color: "#2f6b4a",
    },
    {
      label: t("dashboard.postulationsPending"),
      value: stats.postulations.en_attente,
      icon: Clock,
      color: "#75797f",
    },
    {
      label: t("dashboard.postulationsFailed"),
      value: stats.postulations.echouee,
      icon: XCircle,
      color: "#b3391f",
    },
  ];

  // Unified dossier status — the exact same wording as the dossier page.
  const activeDemande = stats.dossier.active_demande;
  const lastDemande = stats.dossier.last_demande;

  const statusKeyOf = (d: DemandeInfo) =>
    d.type === "creation" ? createStatusKey(d as StatusLike) : addStatusKey(d as StatusLike);

  const priceLabelOf = (d: DemandeInfo) =>
    d.type === "creation"
      ? createPriceParts(t, {
          status: d.status,
          price: d.price,
          traduction_price: d.traduction_price,
          payed_at: d.payed_at,
        })
      : addPriceParts(t, { status: d.status, price: d.price });

  const dossierState = stats.dossier.has_dossier
    ? { variant: "green" as const, label: t("dashboard.dossierActive") }
    : activeDemande
      ? {
          variant: statusVariant(activeDemande) === "red" ? "red" as const : "blue" as const,
          label: t(statusKeyOf(activeDemande)),
        }
      : { variant: "red" as const, label: t("dashboard.dossierMissing") };

  return (
    <div className="space-y-6">
      {/* Header - sans badge */}
      <div>
        <p className="eyebrow mb-1">{t("dashboard.title")}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("dashboard.welcome", { name: "" })}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <Card key={card.label} className={`form-sheet fade-up fade-up-delay-${i + 1} border-border`}>
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border"
                style={{
                  borderColor: `${card.color}40`,
                  backgroundColor: `${card.color}10`,
                  color: card.color,
                }}
              >
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="num text-2xl font-semibold leading-none">{card.value}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dossier warning banner */}
      {!stats.dossier.has_dossier && !activeDemande && (
        <div className="form-sheet flex flex-col gap-3 border-[#d9a441]/50 bg-[#d9a441]/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FolderX className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6a1f]" />
            <div>
              <p className="font-display font-bold">{t("dashboard.needDossierTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("dashboard.needDossierDesc")}</p>
            </div>
          </div>
          <Button asChild className="shrink-0 font-semibold">
            <Link href="/dossier">{t("dashboard.needDossierCta")}</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming postulations */}
        <div className="form-sheet">
          <div className="sheet-band flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#1e4475]" />
              <h2 className="font-display text-sm font-bold">{t("dashboard.upcomingTitle")}</h2>
            </div>
            <Link href="/postulations" className="text-xs font-medium text-[#1e4475] hover:underline">
              {t("nav.postulations")} →
            </Link>
          </div>
          <div className="max-h-72 overflow-y-auto scroll-slim">
            {data.upcoming.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("dashboard.upcomingEmpty")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.upcoming.map((p) => (
                  <li key={p._id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm font-medium">{p.company_name}</span>
                    <span className="aktenzeichen">
                      {new Date(p.scheduled_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Dossier summary — dossier-related info only */}
        <div className="form-sheet">
          <div className="sheet-band flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[#1e4475]" />
              <h2 className="font-display text-sm font-bold">{t("dashboard.dossierTitle")}</h2>
            </div>
            <Link href="/dossier" className="text-xs font-medium text-[#1e4475] hover:underline">
              {t("nav.dossier")} →
            </Link>
          </div>
          <div className="space-y-3 p-5">
            {/* Unified status — same wording as the dossier page */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("dashboard.dossierStatus")}</span>
              <StatusStamp
                status={dossierState.variant === "green" ? "active" : "en_attente"}
                label={dossierState.label}
              />
            </div>

            {/* Totals */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("dashboard.totalAddDemandes")}</span>
              <span className="num text-sm font-semibold">{stats.dossier.total_add_demandes}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("dashboard.totalCreateDemandes")}</span>
              <span className="num text-sm font-semibold">{stats.dossier.total_create_demandes}</span>
            </div>

            {/* Latest demande */}
            {lastDemande && (
              <>
                <div className="rule-dashed" />
                <p className="eyebrow">{t("dossier.lastDemande")}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm">
                    {lastDemande.type === "creation" ? (
                      <FilePlus2 className="h-3.5 w-3.5 text-[#1e4475]" />
                    ) : (
                      <FolderUp className="h-3.5 w-3.5 text-[#1e4475]" />
                    )}
                    <span className="aktenzeichen">{lastDemande.ref_number}</span>
                  </span>
                  <StatusStamp
                    status={statusVariant(lastDemande)}
                    label={t(statusKeyOf(lastDemande))}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("dossier.lastDemandeType")} :{" "}
                    {t(lastDemande.type === "creation" ? "dossier.typeCreate" : "dossier.typeAdd")}
                    {" · "}
                    {new Date(lastDemande.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <span className="num">{priceLabelOf(lastDemande)}</span>
                </div>
              </>
            )}

            <div className="rule-dashed" />
            {stats.dossier.dossier_pdf_link ? (
              <a
                href={stats.dossier.dossier_pdf_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1e4475] hover:underline"
              >
                {t("dossier.downloadDossier")} →
              </a>
            ) : (
              <Link
                href="/dossier"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1e4475] hover:underline"
              >
                {t("dossier.optionsTitle")} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
