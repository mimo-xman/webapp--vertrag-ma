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
import { ArrowUpDown, Trash2, ShieldCheck, UserRound, Ban, LockOpen } from "lucide-react";

interface UserRow {
  _id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  suspended: boolean;
  two_factor_enabled: boolean;
  has_dossier: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp, promptApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTransferRole = async (row: UserRow) => {
    const newRole = row.role === "admin" ? "user" : "admin";
    const ok = await confirmApp(
      t("admin.transferConfirmMessage", { name: row.full_name, role: newRole }),
      { title: t("admin.transferConfirmTitle") }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/users/${row._id}/transfer-role`, {
        method: "POST",
        body: JSON.stringify({ role: newRole }),
      });
      toast({ title: t("common.operationSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleSuspend = async (row: UserRow) => {
    const reason = await promptApp(t("admin.suspendReasonLabel"), {
      title: t("admin.suspendConfirmTitle"),
      placeholder: t("admin.suspendReasonPlaceholder"),
    });
    if (reason === null) return; // cancelled
    const ok = await confirmApp(
      t("admin.suspendConfirmMessage", { name: row.full_name }),
      { title: t("admin.suspendConfirmTitle"), destructive: true, confirmLabel: t("admin.suspend") }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/users/${row._id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      toast({ title: t("admin.suspendSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleUnsuspend = async (row: UserRow) => {
    const ok = await confirmApp(t("admin.unsuspendConfirmMessage", { name: row.full_name }), {
      title: t("admin.unsuspendConfirmTitle"),
      confirmLabel: t("admin.unsuspend"),
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/users/${row._id}/unsuspend`, { method: "POST" });
      toast({ title: t("admin.unsuspendSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleDelete = async (row: UserRow) => {
    const ok = await confirmApp(t("admin.deleteUserConfirmMessage", { name: row.full_name }), {
      title: t("admin.deleteUserConfirmTitle"),
      destructive: true,
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/users/${row._id}`, { method: "DELETE" });
      toast({ title: t("common.deletedSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const columns: DataTableColumn<UserRow>[] = [
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
      key: "role",
      header: t("admin.colRole"),
      sortable: true,
      render: (row) => (
        <Badge
          variant="outline"
          className={
            row.role === "admin"
              ? "border-foreground bg-foreground text-background"
              : "font-normal"
          }
        >
          {row.role}
        </Badge>
      ),
    },
    {
      key: "active",
      header: t("statuses.active"),
      sortable: true,
      render: (row) => (
        <div className="space-y-1">
          <StatusStamp
            status={row.active ? "active" : "canceled"}
            label={row.active ? t("statuses.active") : t("statuses.inactive")}
          />
          {row.suspended && (
            <StatusStamp status="suspended" label={t("statuses.suspended")} />
          )}
        </div>
      ),
    },
    {
      key: "dossier",
      header: t("nav.dossier"),
      render: (row) => (
        <span className="text-xs">
          {row.has_dossier ? "✓" : "—"}
          {row.two_factor_enabled && <span className="ml-2 text-primary">2FA</span>}
        </span>
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
        <div className="flex gap-1">
          {row.role === "user" && (
            <Button
              variant="outline"
              size="icon"
              className={
                row.suspended
                  ? "h-7 w-7 text-success hover:bg-success/10"
                  : "h-7 w-7 text-destructive hover:bg-destructive/10"
              }
              title={row.suspended ? t("admin.unsuspend") : t("admin.suspend")}
              aria-label={row.suspended ? t("admin.unsuspend") : t("admin.suspend")}
              onClick={() => (row.suspended ? handleUnsuspend(row) : handleSuspend(row))}
            >
              {row.suspended ? (
                <LockOpen className="h-3.5 w-3.5" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => handleTransferRole(row)}
          >
            {row.role === "admin" ? (
              <>
                <UserRound className="h-3 w-3" />
                User
              </>
            ) : (
              <>
                <ShieldCheck className="h-3 w-3" />
                Admin
              </>
            )}
            <ArrowUpDown className="h-3 w-3 opacity-50" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
            onClick={() => handleDelete(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.users")}
        subtitle={t("admin.usersSubtitle")}
      />
      <p className="mb-4 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        {t("admin.excludedSelf")}
      </p>

      <DataTable
        endpoint="/api/admin/users"
        columns={columns}
        refreshKey={refreshKey}
        statusFilter={{
          key: "role",
          label: t("admin.colRole"),
          options: [
            { value: "user", label: "user" },
            { value: "admin", label: "admin" },
          ],
        }}
      />
    </div>
  );
}
