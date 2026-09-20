"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { dateColumns } from "@/components/table-date-columns";
import { Plus, Pencil, Trash2, Loader2, CheckCircle2, Power, PowerOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyRow {
  _id: string;
  name: string;
  email: string;
  active: boolean;
  categories: { _id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

interface Category {
  _id: string;
  name: string;
}

export default function AdminCompaniesPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [forceInvalid, setForceInvalid] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(() => {
    apiFetch<{ categories: Category[] }>("/api/admin/companies", {
      method: "OPTIONS",
    })
      .then((data) => setCategories(data.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, refreshKey]);

  // Debounced email verification via @el-zazo/email-verifier (admin side).
  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || editing) {
      setEmailValid(null);
      return;
    }
    setEmailChecking(true);
    setEmailValid(null);
    const timer = setTimeout(async () => {
      try {
        const data = await fetch("/api/auth/validate-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).then((r) => r.json());
        setEmailValid(Boolean(data.valid));
      } catch {
        setEmailValid(true);
      } finally {
        setEmailChecking(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [email, editing]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setSelectedCategories([]);
    setForceInvalid(false);
    setEmailValid(null);
    setDialogOpen(true);
  };

  const openEdit = (row: CompanyRow) => {
    setEditing(row);
    setName(row.name);
    setEmail(row.email);
    setSelectedCategories(row.categories.map((c) => c._id));
    setForceInvalid(false);
    setEmailValid(null);
    setDialogOpen(true);
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        email,
        categorie_ids: selectedCategories,
        ...(forceInvalid ? { force_invalid_email: true } : {}),
      };
      if (editing) {
        await apiFetch(`/api/admin/companies/${editing._id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/companies", {
          method: "POST",
          body: JSON.stringify(payload),
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

  const handleDelete = async (row: CompanyRow) => {
    const ok = await confirmApp(
      `${t("common.confirmDeleteMessage")}\n\n${row.name} · ${row.email}`,
      { title: t("common.confirmDeleteTitle"), destructive: true, confirmLabel: t("common.delete") }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/companies/${row._id}`, { method: "DELETE" });
      toast({ title: t("common.deletedSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  // Activate / deactivate - recommended instead of deletion when the company
  // is referenced by postulations (data integrity is preserved).
  const handleToggle = async (row: CompanyRow) => {
    const ok = await confirmApp(
      row.active ? t("admin.deactivateCompanyConfirm") : t("admin.activateCompanyConfirm"),
      {
        title: row.active ? t("admin.deactivateCompany") : t("admin.activateCompany"),
        confirmLabel: row.active ? t("admin.deactivateCompany") : t("admin.activateCompany"),
        destructive: row.active,
      }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/companies/${row._id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !row.active }),
      });
      toast({
        title: row.active ? t("admin.companyDeactivated") : t("admin.companyActivated"),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const columns: DataTableColumn<CompanyRow>[] = [
    {
      key: "name",
      header: t("admin.companyName"),
      sortable: true,
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "email",
      header: t("admin.companyEmail"),
      sortable: true,
      render: (row) => <span className="aktenzeichen">{row.email}</span>,
    },
    {
      key: "categories",
      header: t("admin.companyCategories"),
      render: (row) =>
        row.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.categories.map((c) => (
              <Badge key={c._id} variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                {c.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
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
    ...dateColumns<CompanyRow>(t),
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
            title={row.active ? t("admin.deactivateCompany") : t("admin.activateCompany")}
            aria-label={row.active ? t("admin.deactivateCompany") : t("admin.activateCompany")}
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

  const canSave =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !saving &&
    (editing || emailChecking || emailValid === true || forceInvalid);

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.companies")}
        subtitle={t("admin.companiesSubtitle")}
        actions={
          <Button onClick={openCreate} className="font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("common.add")}
          </Button>
        }
      />

      <DataTable
        endpoint="/api/admin/companies"
        columns={columns}
        refreshKey={refreshKey}
        columnToggle
        storageKey="admin-companies"
        dateFilters={[{ prefix: "created", label: t("common.createdAt") }]}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? t("common.edit") : t("common.add")} · {t("admin.companies")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("admin.companyName")}</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.companyEmail")}</Label>
              <div className="relative">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    "pr-9",
                    emailValid === false && !forceInvalid && "border-destructive",
                    emailValid === true && "border-success"
                  )}
                />
                {emailChecking && (
                  <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {emailValid === true && (
                  <CheckCircle2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />
                )}
              </div>
              {emailValid === false && !forceInvalid && (
                <div className="rounded-sm border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  <p>{t("admin.emailInvalid")}</p>
                  <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-medium">
                    <Checkbox
                      checked={forceInvalid}
                      onCheckedChange={(v) => setForceInvalid(Boolean(v))}
                    />
                    Forcer l'ajout quand même
                  </label>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.companyCategories")}</Label>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto scroll-slim rounded-sm border border-border bg-paper p-2.5">
                {categories.map((cat) => (
                  <button
                    key={cat._id}
                    type="button"
                    onClick={() => toggleCategory(cat._id)}
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors",
                      selectedCategories.includes(cat._id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
                {categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Créez d'abord des catégories.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!canSave} className="font-semibold">
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
