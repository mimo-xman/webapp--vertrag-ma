"use client";

import { useI18n } from "@/components/language-provider";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { AlertTriangle } from "lucide-react";

interface PostulationRow {
  _id: string;
  status: string;
  scheduled_at: string;
  posted_at: string | null;
  failed_reason: string | null;
  company: { _id: string; name: string; categories: string[] } | null;
}

export default function PostulationsPage() {
  const { t } = useI18n();

  const columns: DataTableColumn<PostulationRow>[] = [
    {
      key: "company",
      header: t("postulations.company"),
      render: (row) => (
        <div>
          <p className="font-medium">{row.company?.name || "-"}</p>
          {row.company && row.company.categories && row.company.categories.length > 0 && (
            <p className="text-xs text-muted-foreground">{row.company.categories.join(", ")}</p>
          )}
        </div>
      ),
    },
    {
      key: "scheduled_at",
      header: t("postulations.scheduledAt"),
      sortable: true,
      render: (row) => (
        <span className="aktenzeichen">
          {new Date(row.scheduled_at).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "posted_at",
      header: t("postulations.postedAt"),
      sortable: true,
      render: (row) =>
        row.posted_at ? (
          <span className="aktenzeichen">
            {new Date(row.posted_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : (
          <span className="aktenzeichen text-muted-foreground/50">-</span>
        ),
    },
    {
      key: "status",
      header: t("postulations.status"),
      sortable: true,
      render: (row) => (
        <div className="space-y-1">
          <StatusStamp status={row.status} label={t(`statuses.${row.status}`)} />
          {row.status === "echouee" && (
            <p className="flex items-start gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
              {t("postulations.failedReasonUser")}
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-1">Vertrag.ma · {t("postulations.title")}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("postulations.title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("postulations.subtitle")}</p>
      </div>

      <DataTable
        endpoint="/api/postulations"
        columns={columns}
        storageKey="user-postulations"
        emptyMessage={t("postulations.empty")}
        dateFilters={[
          { prefix: "scheduled", label: t("postulations.scheduledAt") },
          { prefix: "posted", label: t("postulations.postedAt") },
        ]}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "en_attente", label: t("statuses.en_attente") },
            { value: "envoyee", label: t("statuses.envoyee") },
            { value: "echouee", label: t("statuses.echouee") },
            { value: "re_execute", label: t("statuses.re_execute") },
            { value: "annulee_admin", label: t("statuses.annulee_admin") },
          ],
        }}
      />
    </div>
  );
}
