"use client";

import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface AuditRow {
  _id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  createdAt: string;
}

export default function AdminAuditLogsPage() {
  const { t } = useI18n();

  const columns: DataTableColumn<AuditRow>[] = [
    {
      key: "createdAt",
      header: t("common.date"),
      sortable: true,
      render: (row) => (
        <span className="aktenzeichen">
          {new Date(row.createdAt).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "admin_email",
      header: t("admin.colAdmin"),
      sortable: true,
      render: (row) => <span className="aktenzeichen">{row.admin_email}</span>,
    },
    {
      key: "action",
      header: t("admin.colAction"),
      sortable: true,
      render: (row) => (
        <Badge variant="outline" className="font-mono text-[11px]">
          {row.action}
        </Badge>
      ),
    },
    {
      key: "entity_type",
      header: t("admin.colEntity"),
      sortable: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.entity_type}</span>
      ),
    },
    {
      key: "details",
      header: t("common.details"),
      render: (row) => (
        <span className="text-xs">{row.details || "—"}</span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.auditLogs")}
        subtitle={t("admin.auditLogsSubtitle")}
      />
      <DataTable endpoint="/api/admin/audit-logs" columns={columns} />
    </div>
  );
}
