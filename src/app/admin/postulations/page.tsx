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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCcw, AlertTriangle } from "lucide-react";

interface PostulationRow {
  _id: string;
  status: string;
  scheduled_at: string;
  posted_at: string | null;
  failed_reason: string | null;
  user: { _id: string; full_name: string; email: string } | null;
  company: { _id: string; name: string; email: string } | null;
}

export default function AdminPostulationsPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [users, setUsers] = useState<{ _id: string; label: string }[]>([]);
  const [companies, setCompanies] = useState<{ _id: string; label: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [reExecuting, setReExecuting] = useState(false);

  // Load users + companies lists for the manual creation dialog.
  const loadLists = useCallback(() => {
    apiFetch<{ users: { _id: string; label: string }[]; companies: { _id: string; label: string }[] }>(
      "/api/admin/postulations?limit=5"
    )
      .then((data) => {
        setUsers(data.users);
        setCompanies(data.companies);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const handleCreate = async (force = false) => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/postulations", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, company_id: companyId, force }),
      });
      toast({ title: t("common.operationSuccess") });
      setAddOpen(false);
      setUserId("");
      setCompanyId("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const error = err as Error & { duplicate?: boolean };
      // Duplicate company: ask for explicit confirmation.
      if ((err as { duplicate?: boolean }).duplicate) {
        const ok = await confirmApp(t("admin.duplicateWarningMessage"), {
          title: t("admin.duplicateWarningTitle"),
        });
        if (ok) {
          setSaving(false);
          await handleCreate(true);
          return;
        }
      } else {
        await alertApp(error.message || "Erreur");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReExecute = async () => {
    const ok = await confirmApp(t("admin.reExecuteDesc"), {
      title: t("admin.reExecuteTitle"),
      confirmLabel: t("admin.reExecuteCta"),
    });
    if (!ok) return;
    setReExecuting(true);
    try {
      const data = await apiFetch<{
        moved_to_re_execute: number;
        total_to_re_execute: number;
        workflow_triggered: boolean;
        workflow_error: string | null;
      }>("/api/admin/postulations/re-execute", { method: "POST" });

      if (data.workflow_triggered) {
        toast({ title: t("admin.reExecuteTriggered") });
        toast({
          title: t("admin.reExecuteCount", { count: data.total_to_re_execute }),
        });
      } else {
        await alertApp(
          `${data.moved_to_re_execute} postulation(s) marquée(s) « à relancer ».\n\n` +
            `Le workflow GitHub Actions n'a pas pu être lancé automatiquement : ${data.workflow_error}. ` +
            `Vous pouvez le lancer manuellement depuis GitHub.`,
          t("admin.reExecuteTitle")
        );
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setReExecuting(false);
    }
  };

  const columns: DataTableColumn<PostulationRow>[] = [
    {
      key: "user",
      header: t("admin.colName"),
      render: (row) => (
        <div>
          <p className="font-medium">{row.user?.full_name || "—"}</p>
          <p className="aktenzeichen">{row.user?.email}</p>
        </div>
      ),
    },
    {
      key: "company",
      header: t("postulations.company"),
      render: (row) => (
        <div>
          <p className="font-medium">{row.company?.name || "—"}</p>
          <p className="aktenzeichen">{row.company?.email}</p>
        </div>
      ),
    },
    {
      key: "scheduled_at",
      header: t("postulations.scheduledAt"),
      sortable: true,
      render: (row) => (
        <span className="aktenzeichen">
          {new Date(row.scheduled_at).toLocaleDateString("fr-FR")}
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
            {new Date(row.posted_at).toLocaleDateString("fr-FR")}
          </span>
        ) : (
          <span className="aktenzeichen text-muted-foreground/50">—</span>
        ),
    },
    {
      key: "status",
      header: t("postulations.status"),
      sortable: true,
      render: (row) => (
        <div className="space-y-1">
          <StatusStamp status={row.status} label={t(`statuses.${row.status}`)} />
          {row.failed_reason && (
            <p className="flex items-start gap-1 text-[11px] text-[#b3391f]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {row.failed_reason.slice(0, 60)}
            </p>
          )}
        </div>
      ),
    },
  ];

  const filteredUsers = users.filter((u) =>
    u.label.toLowerCase().includes(userSearch.toLowerCase())
  );
  const filteredCompanies = companies.filter((c) =>
    c.label.toLowerCase().includes(companySearch.toLowerCase())
  );

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.postulations")}
        subtitle={t("admin.postulationsSubtitle")}
        actions={
          <>
            <Button variant="outline" onClick={handleReExecute} disabled={reExecuting} className="gap-1.5">
              <RefreshCcw className={`h-4 w-4 ${reExecuting ? "animate-spin" : ""}`} />
              {t("admin.reExecuteCta")}
            </Button>
            <Button onClick={() => setAddOpen(true)} className="font-semibold">
              <Plus className="mr-1.5 h-4 w-4" />
              {t("admin.addPostulation")}
            </Button>
          </>
        }
      />

      <DataTable
        endpoint="/api/admin/postulations"
        columns={columns}
        refreshKey={refreshKey}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "en_attente", label: t("statuses.en_attente") },
            { value: "envoyee", label: t("statuses.envoyee") },
            { value: "echouee", label: t("statuses.echouee") },
            { value: "re_execute", label: t("statuses.re_execute") },
          ],
        }}
      />

      {/* Manual creation dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.addPostulation")}</DialogTitle>
            <DialogDescription>{t("admin.addPostulationDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("admin.selectUser")}</Label>
              <Input
                placeholder={t("common.search")}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="mb-1"
              />
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers.slice(0, 100).map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.selectCompany")}</Label>
              <Input
                placeholder={t("common.search")}
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                className="mb-1"
              />
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCompanies.slice(0, 100).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => handleCreate(false)}
              disabled={!userId || !companyId || saving}
              className="font-semibold"
            >
              {saving ? t("common.loading") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
