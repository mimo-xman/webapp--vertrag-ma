"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { apiFetch } from "@/lib/api-utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Building2,
  FolderTree,
  Send,
  FileStack,
  FolderOpen,
  Mail,
  ScrollText,
} from "lucide-react";

interface StatsResponse {
  stats: {
    users: number;
    companies: number;
    categories: number;
    postulations: { total: number; en_attente: number; envoyee: number; echouee: number; re_execute: number };
    demandes: { total: number; en_attente: number; payed: number; canceled: number };
    dossiers: number;
    mail_senders: number;
  };
  recent_audit: { _id: string; admin_email: string; action: string; entity_type: string; createdAt: string }[];
}

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<StatsResponse | null>(null);

  useEffect(() => {
    apiFetch<StatsResponse>("/api/admin/stats").then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="p-6">
        <div className="h-8 w-56 animate-pulse rounded-sm bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-sm bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const { stats } = data;

  const cards = [
    { label: t("admin.statUsers"), value: stats.users, icon: Users, href: "/admin/users", color: "#1e4475" },
    { label: t("admin.statCompanies"), value: stats.companies, icon: Building2, href: "/admin/companies", color: "#1e4475" },
    { label: t("admin.statCategories"), value: stats.categories, icon: FolderTree, href: "/admin/categories", color: "#1e4475" },
    { label: t("admin.statPostulations"), value: stats.postulations.total, icon: Send, href: "/admin/postulations", color: "#1a1d21" },
    { label: t("admin.statDemandes"), value: stats.demandes.total, icon: FileStack, href: "/admin/demandes-postulations", color: "#1a1d21" },
    { label: t("admin.statDossiers"), value: stats.dossiers, icon: FolderOpen, href: "/admin/users", color: "#2f6b4a" },
    { label: t("admin.statMailSenders"), value: stats.mail_senders, icon: Mail, href: "/admin/mail-senders", color: "#1e4475" },
  ];

  const statusCards = [
    { label: t("statuses.en_attente"), value: stats.postulations.en_attente, color: "#75797f" },
    { label: t("statuses.envoyee"), value: stats.postulations.envoyee, color: "#2f6b4a" },
    { label: t("statuses.echouee"), value: stats.postulations.echouee, color: "#b3391f" },
    { label: t("statuses.re_execute"), value: stats.postulations.re_execute, color: "#8a6a1f" },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.dashboard")}
        subtitle={t("admin.dashboardSubtitle")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((card, i) => (
          <Link key={card.label} href={card.href} className="group">
            <Card className="form-sheet fade-up border-border transition-shadow hover:shadow-md" style={{ animationDelay: `${i * 0.04}s` }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                  <span className="num text-xl font-bold">{card.value}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  {card.label}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Postulations by status */}
        <div className="form-sheet">
          <div className="sheet-band px-5 py-3.5">
            <h2 className="font-display text-sm font-bold">{t("admin.postulationsByStatus")}</h2>
          </div>
          <div className="space-y-3 p-5">
            {statusCards.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className="num text-lg font-semibold" style={{ color: s.color }}>
                  {s.value}
                </span>
              </div>
            ))}
            <div className="rule-dashed" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("admin.statDemandes")}</span>
              <span className="num font-semibold">{stats.demandes.en_attente} / {stats.demandes.total}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.demandes.en_attente} {t("statuses.en_attente").toLowerCase()}
            </p>
          </div>
        </div>

        {/* Recent audit */}
        <div className="form-sheet lg:col-span-2">
          <div className="sheet-band flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-[#1e4475]" />
              <h2 className="font-display text-sm font-bold">{t("admin.recentActivity")}</h2>
            </div>
            <Link href="/admin/audit-logs" className="text-xs font-medium text-[#1e4475] hover:underline">
              {t("admin.auditLogs")} →
            </Link>
          </div>
          <div className="max-h-72 overflow-y-auto scroll-slim">
            {data.recent_audit.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recent_audit.map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-medium">{a.action}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.admin_email}</p>
                    </div>
                    <span className="aktenzeichen shrink-0">
                      {new Date(a.createdAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
