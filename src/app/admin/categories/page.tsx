"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";

interface CategoryRow {
  _id: string;
  name: string;
  active: boolean;
  companies_count: number;
}

export default function AdminCategoriesPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  };

  const openEdit = (row: CategoryRow) => {
    setEditing(row);
    setName(row.name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/categories/${editing._id}`, {
          method: "PUT",
          body: JSON.stringify({ name }),
        });
      } else {
        await apiFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
      }
      toast({ title: t("common.savedSuccess") });
      setDialogOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: CategoryRow) => {
    // Client-side pre-check: the API refuses the deletion of a non-empty
    // category, but warning BEFORE the call avoids a useless request.
    if (row.companies_count > 0) {
      await alertApp(t("admin.deleteCategoryBlocked", { count: row.companies_count }));
      return;
    }
    const ok = await confirmApp(
      t("admin.deleteCategoryWarning", { count: row.companies_count }),
      { title: t("common.confirmDeleteTitle"), destructive: true, confirmLabel: t("common.delete") }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/categories/${row._id}`, { method: "DELETE" });
      toast({ title: t("common.deletedSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  // Activate / deactivate — the recommended alternative to deletion: a
  // deactivated category disappears from the user's selector and its
  // companies stop being targeted by new demandes, but the data stays intact.
  const handleToggle = async (row: CategoryRow) => {
    const ok = await confirmApp(
      row.active ? t("admin.deactivateCategoryConfirm") : t("admin.activateCategoryConfirm"),
      {
        title: row.active ? t("admin.deactivateCategory") : t("admin.activateCategory"),
        confirmLabel: row.active ? t("admin.deactivateCategory") : t("admin.activateCategory"),
        destructive: row.active,
      }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/categories/${row._id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !row.active }),
      });
      toast({
        title: row.active ? t("admin.categoryDeactivated") : t("admin.categoryActivated"),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      key: "name",
      header: t("admin.categoryName"),
      sortable: true,
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "companies_count",
      header: t("admin.colCompanies"),
      sortable: true,
      render: (row) => (
        <span className="num rounded-sm bg-paper px-2 py-0.5 text-xs font-semibold">
          {row.companies_count}
        </span>
      ),
    },
    {
      key: "active",
      header: t("statuses.active"),
      sortable: true,
      render: (row) => (
        <StatusStamp
          status={row.active ? "active" : "canceled"}
          label={row.active ? t("statuses.active") : t("statuses.inactive")}
        />
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (row) => (
        <div className="flex justify-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className={
              row.active
                ? "h-7 w-7 text-destructive hover:bg-destructive/10"
                : "h-7 w-7 text-success hover:bg-success/10"
            }
            title={row.active ? t("admin.deactivateCategory") : t("admin.activateCategory")}
            aria-label={row.active ? t("admin.deactivateCategory") : t("admin.activateCategory")}
            onClick={() => handleToggle(row)}
          >
            {row.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => openEdit(row)}>
            <Pencil className="h-3.5 w-3.5" />
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
        title={t("admin.categories")}
        subtitle={t("admin.categoriesSubtitle")}
        actions={
          <Button onClick={openCreate} className="font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("common.add")}
          </Button>
        }
      />

      <DataTable
        endpoint="/api/admin/categories"
        columns={columns}
        refreshKey={refreshKey}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "active", label: t("statuses.active") },
            { value: "inactive", label: t("statuses.inactive") },
          ],
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? t("common.edit") : t("common.add")} — {t("admin.categories")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t("admin.categoryName")}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Santé, IT, BTP…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={name.trim().length < 2 || saving} className="font-semibold">
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
