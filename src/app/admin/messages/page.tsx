"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Lock, LockOpen } from "lucide-react";

interface MessageRow {
  _id: string;
  ref_id: string;
  full_name: string;
  email: string;
  reason: string;
  message: string;
  status: "active" | "closed";
  closed_at: string | null;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  account_suspended: "contact.reasonSuspended",
  postulations: "contact.reasonPostulations",
  dossier: "contact.reasonDossier",
  payment: "contact.reasonPayment",
  other: "contact.reasonOther",
};

export default function AdminMessagesPage() {
  const { t } = useI18n();
  const { alertApp, confirmApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [toggling, setToggling] = useState<string | null>(null);

  // Toggle closed ↔ active (a closed message can always be re-activated).
  const handleToggle = async (row: MessageRow) => {
    setToggling(row._id);
    try {
      await apiFetch(`/api/admin/messages/${row._id}`, {
        method: "PATCH",
        body: JSON.stringify({ closed: row.status !== "closed" }),
      });
      toast({
        title: row.status !== "closed" ? t("admin.messageToggleClosed") : t("admin.messageToggleActive"),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setToggling(null);
    }
  };

  const columns: DataTableColumn<MessageRow>[] = [
    {
      key: "ref_id",
      header: t("admin.colRef"),
      sortable: true,
      render: (row) => <span className="aktenzeichen num">{row.ref_id}</span>,
    },
    {
      key: "full_name",
      header: t("admin.colName"),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium">{row.full_name}</p>
          <p className="aktenzeichen">{row.email}</p>
        </div>
      ),
    },
    {
      key: "reason",
      header: t("admin.colReason"),
      sortable: true,
      render: (row) => (
        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {t(REASON_LABELS[row.reason] || "contact.reasonOther")}
        </Badge>
      ),
    },
    {
      key: "message",
      header: t("contact.message"),
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="max-w-56 truncate text-xs text-muted-foreground">{row.message}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 shrink-0"
            title={t("common.view")}
            aria-label={t("common.view")}
            onClick={() =>
              alertApp(row.message, t("admin.messageViewTitle", { ref: row.ref_id }))
            }
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      sortable: true,
      render: (row) => (
        <StatusStamp
          status={row.status === "closed" ? "closed" : "active"}
          label={row.status === "closed" ? t("statuses.closed") : t("statuses.active")}
        />
      ),
    },
    {
      key: "createdAt",
      header: t("common.createdAt"),
      sortable: true,
      render: (row) => (
        <span className="aktenzeichen">
          {new Date(row.createdAt).toLocaleDateString("fr-FR")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (row) => (
        <Button
          variant="outline"
          size="icon"
          className={
            row.status === "closed"
              ? "h-7 w-7 text-success hover:bg-success/10"
              : "h-7 w-7 text-warning hover:bg-warning/10"
          }
          title={row.status === "closed" ? t("admin.messageToggleActive") : t("admin.messageToggleClosed")}
          aria-label={row.status === "closed" ? t("admin.messageToggleActive") : t("admin.messageToggleClosed")}
          disabled={toggling === row._id}
          onClick={() => handleToggle(row)}
        >
          {row.status === "closed" ? (
            <LockOpen className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.messages")}
        subtitle={t("admin.messagesSubtitle")}
      />
      <p className="mb-4 rounded-sm border border-border bg-paper px-3 py-2 text-xs text-muted-foreground">
        {t("admin.messageCloseHint")}
      </p>

      <DataTable
        endpoint="/api/admin/messages"
        columns={columns}
        refreshKey={refreshKey}
        columnToggle
        storageKey="admin-messages"
        dateFilters={[{ prefix: "created", label: t("common.date") }]}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "active", label: t("statuses.active") },
            { value: "closed", label: t("statuses.closed") },
          ],
        }}
      />
    </div>
  );
}
