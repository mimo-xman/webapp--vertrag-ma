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
import { DatePicker } from "@/components/date-picker";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  RefreshCcw,
  AlertTriangle,
  Play,
  PenLine,
  History,
  Github,
  Server,
  Loader2,
  Ban,
  Zap,
} from "lucide-react";

interface PostulationExecutionEntry {
  execution_id: string;
  status: "success" | "failed";
  error: string | null;
  executed_at: string;
}

interface PostulationRow {
  _id: string;
  status: string;
  scheduled_at: string;
  posted_at: string | null;
  failed_reason: string | null;
  demande_ref: string | null;
  created_by_admin: boolean;
  createdAt?: string;
  executions: PostulationExecutionEntry[];
  user: { _id: string; full_name: string; email: string } | null;
  company: { _id: string; name: string; email: string } | null;
}

interface SenderOption {
  _id: string;
  name: string;
  type: string;
  active: boolean;
  in_use: boolean;
}

interface ExecutionOfPostulation {
  _id: string;
  ref_number: string;
  trigger: string;
  status: string;
  mail_sender_name: string;
  started_at: string;
  finished_at: string | null;
  outcome: { status: string; error: string | null } | null;
}

const TRIGGER_LABELS: Record<string, string> = {
  github: "admin.relanceGithub",
  server: "admin.relanceServer",
  admin: "admin.triggerAdmin",
};

const POSTULATION_STATUSES = [
  "en_attente",
  "envoyee",
  "echouee",
  "re_execute",
  "executing",
  "annulee_admin",
] as const;

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

  // "Lancer la relance" - choose the execution target + optional date interval.
  const [relanceOpen, setRelanceOpen] = useState(false);
  const [relanceFrom, setRelanceFrom] = useState("");
  const [relanceTo, setRelanceTo] = useState("");

  // "Lancer l'exécution" - manual launch of the daily wave (pending postulations).
  const [execPendingOpen, setExecPendingOpen] = useState(false);
  const [execPendingRunning, setExecPendingRunning] = useState(false);

  // Execute-one-postulation dialog (mail sender selection).
  const [execOpen, setExecOpen] = useState(false);
  const [execTarget, setExecTarget] = useState<PostulationRow | null>(null);
  const [execSenders, setExecSenders] = useState<SenderOption[]>([]);
  const [execSendersLoading, setExecSendersLoading] = useState(false);
  const [execSenderId, setExecSenderId] = useState("");
  const [executing, setExecuting] = useState(false);

  // Modify-status dialog.
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<PostulationRow | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusSaving, setStatusSaving] = useState(false);

  // Executions-of-postulation dialog.
  const [execHistoryOpen, setExecHistoryOpen] = useState(false);
  const [execHistoryTarget, setExecHistoryTarget] = useState<PostulationRow | null>(null);
  const [execHistory, setExecHistory] = useState<ExecutionOfPostulation[]>([]);
  const [execHistoryLoading, setExecHistoryLoading] = useState(false);

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

  // ── "Lancer la relance" - two targets + optional date interval ────────

  const relanceIntervalValid =
    !relanceFrom || !relanceTo || relanceFrom <= relanceTo; // ISO dates compare lexically

  const handleRelance = async (target: "github" | "server") => {
    if (!relanceIntervalValid) {
      await alertApp(t("admin.relanceDateError"));
      return;
    }
    setReExecuting(true);
    try {
      const data = await apiFetch<{
        moved_to_re_execute: number;
        total_to_re_execute: number;
        target: string;
        executions_created: number;
        execution_ids: string[];
        workflow_triggered: boolean;
        workflow_error: string | null;
        message?: string | null;
      }>("/api/admin/postulations/re-execute", {
        method: "POST",
        body: JSON.stringify({
          target,
          ...(relanceFrom ? { date_from: relanceFrom } : {}),
          ...(relanceTo ? { date_to: relanceTo } : {}),
        }),
      });
      setRelanceOpen(false);

      if (target === "server") {
        if (data.executions_created > 0) {
          toast({ title: t("admin.reExecuteTriggered") });
          toast({
            title: t("admin.relanceServerStarted", { count: data.executions_created }),
          });
        } else {
          await alertApp(
            `${data.moved_to_re_execute} · ${t("statuses.re_execute")}\n\n` +
              t("admin.noSendersAlert"),
            t("admin.reExecuteTitle")
          );
        }
      } else {
        if (data.workflow_triggered) {
          toast({ title: t("admin.reExecuteTriggered") });
          toast({
            title: t("admin.reExecuteCount", { count: data.total_to_re_execute }),
          });
        } else {
          await alertApp(
            `${data.moved_to_re_execute} · ${t("statuses.re_execute")}\n\n` +
              t("admin.workflowLaunchError", { error: data.workflow_error || "" }),
            t("admin.reExecuteTitle")
          );
        }
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : t("common.errorFallback"));
    } finally {
      setReExecuting(false);
    }
  };

  // ── "Lancer l'exécution" - manual daily wave (pending postulations) ────

  const handleExecutePending = async (target: "github" | "server") => {
    setExecPendingRunning(true);
    try {
      const data = await apiFetch<{
        pending: number;
        target: string;
        executions_created: number;
        workflow_triggered: boolean;
        workflow_error: string | null;
        message?: string | null;
      }>("/api/admin/postulations/execute-pending", {
        method: "POST",
        body: JSON.stringify({ target }),
      });
      setExecPendingOpen(false);

      if (data.pending === 0) {
        toast({ title: t("admin.executePendingNone") });
      } else if (target === "server") {
        if (data.executions_created > 0) {
          toast({
            title: t("admin.executePendingStarted", { count: data.executions_created }),
          });
        } else {
          await alertApp(
            `${data.pending} · ${t("statuses.en_attente")}\n\n` + t("admin.noSendersAlert"),
            t("admin.executePendingTitle")
          );
        }
      } else {
        if (data.workflow_triggered) {
          toast({ title: t("admin.reExecuteTriggered") });
          toast({ title: t("admin.reExecuteCount", { count: data.pending }) });
        } else {
          await alertApp(
            `${data.pending} · ${t("statuses.en_attente")}\n\n` +
              t("admin.workflowLaunchError", { error: data.workflow_error || "" }),
            t("admin.executePendingTitle")
          );
        }
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setExecPendingRunning(false);
    }
  };

  // ── Cancel by admin - never executed, kept for history ─────────────────

  const handleCancelByAdmin = async (row: PostulationRow) => {
    const ok = await confirmApp(t("admin.cancelPostulationConfirm"), {
      title: t("admin.cancelPostulationTitle"),
      destructive: true,
      confirmLabel: t("admin.cancelPostulation"),
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/postulations/${row._id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "annulee_admin" }),
      });
      toast({ title: t("common.operationSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  // ── Execute ONE postulation with a selected mail sender ────────────────

  const openExecute = async (row: PostulationRow) => {
    setExecTarget(row);
    setExecSenderId("");
    setExecOpen(true);
    setExecSendersLoading(true);
    try {
      const data = await apiFetch<{ data: SenderOption[] }>(
        "/api/admin/mail-senders?limit=100"
      );
      // Only active senders not currently claimed by an execution.
      setExecSenders(data.data.filter((s) => s.active && !s.in_use));
    } catch {
      setExecSenders([]);
    } finally {
      setExecSendersLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!execTarget || !execSenderId) return;
    setExecuting(true);
    try {
      const data = await apiFetch<{
        status: "success" | "failed";
        error: string | null;
        sender_disabled: boolean;
        ref_number: string;
      }>(`/api/admin/postulations/${execTarget._id}/execute`, {
        method: "POST",
        body: JSON.stringify({ mail_sender_id: execSenderId }),
      });

      if (data.status === "success") {
        toast({ title: t("admin.executeSuccess") });
      } else if (data.sender_disabled) {
        await alertApp(
          `${t("admin.executeFailedSenderDisabled")}\n\n${data.error || ""}`,
          t("admin.executeTitle")
        );
      } else {
        await alertApp(data.error || t("admin.executeFailedFallback"), t("admin.executeTitle"));
      }
      setExecOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setExecuting(false);
    }
  };

  // ── Modify status manually ─────────────────────────────────────────────

  const openStatus = (row: PostulationRow) => {
    setStatusTarget(row);
    setNewStatus(row.status);
    setStatusOpen(true);
  };

  const handleStatusSave = async () => {
    if (!statusTarget || !newStatus) return;
    setStatusSaving(true);
    try {
      await apiFetch(`/api/admin/postulations/${statusTarget._id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: t("common.operationSuccess") });
      setStatusOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setStatusSaving(false);
    }
  };

  // ── Executions of one postulation ──────────────────────────────────────

  const openExecHistory = async (row: PostulationRow) => {
    setExecHistoryTarget(row);
    setExecHistory([]);
    setExecHistoryOpen(true);
    setExecHistoryLoading(true);
    try {
      const data = await apiFetch<{ data: ExecutionOfPostulation[] }>(
        `/api/admin/executions?postulation_id=${row._id}`
      );
      setExecHistory(data.data);
    } catch {
      // leave empty
    } finally {
      setExecHistoryLoading(false);
    }
  };

  // ── Table columns ───────────────────────────────────────────────────────

  const columns: DataTableColumn<PostulationRow>[] = [
    {
      key: "user",
      header: t("admin.colName"),
      render: (row) => (
        <div>
          <p className="font-medium">{row.user?.full_name || "-"}</p>
          <p className="aktenzeichen">{row.user?.email}</p>
        </div>
      ),
    },
    {
      key: "company",
      header: t("postulations.company"),
      render: (row) => (
        <div>
          <p className="font-medium">{row.company?.name || "-"}</p>
          <p className="aktenzeichen">{row.company?.email}</p>
        </div>
      ),
    },
    {
      key: "origin",
      header: t("admin.colOrigin"),
      render: (row) =>
        row.created_by_admin ? (
          <span className="stamp stamp-ink stamp-flat !text-[10px]">{t("admin.originManual")}</span>
        ) : row.demande_ref ? (
          <span className="aktenzeichen">{t("admin.originAuto", { ref: row.demande_ref })}</span>
        ) : (
          <span className="aktenzeichen">{t("admin.originAuto", { ref: "-" })}</span>
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
          <span className="aktenzeichen text-muted-foreground/50">-</span>
        ),
    },
    {
      key: "status",
      header: t("postulations.status"),
      sortable: true,
      render: (row) => (
        <div className="space-y-1">
          <StatusStamp
            status={row.status}
            label={t(`statuses.${row.status}`)}
            animate={row.status === "executing"}
          />
          {row.failed_reason && (
            <p className="flex items-start gap-1 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {row.failed_reason.slice(0, 60)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "executions",
      header: t("admin.colExecutions"),
      render: (row) => {
        if (!row.executions || row.executions.length === 0) {
          return <span className="aktenzeichen text-muted-foreground/50">-</span>;
        }
        const failed = row.executions.filter((e) => e.status === "failed").length;
        return (
          <div className="flex items-center gap-1.5">
            <span className="num text-xs font-semibold">
              {row.executions.length}
              {failed > 0 && (
                <span className="ml-1 text-destructive">({failed} ✗)</span>
              )}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6"
              title={t("admin.viewExecutions")}
              aria-label={t("admin.viewExecutions")}
              onClick={() => openExecHistory(row)}
            >
              <History className="h-3 w-3" />
            </Button>
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: t("common.createdAt"),
      sortable: true,
      defaultHidden: true,
      render: (row) => (
        <span className="aktenzeichen">
          {new Date(row.createdAt || row.scheduled_at).toLocaleDateString("fr-FR")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      alwaysVisible: true,
      render: (row) => (
        <div className="flex gap-1">
          {(row.status === "en_attente" || row.status === "re_execute") && (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 text-success hover:bg-success/10"
              title={t("admin.executePostulation")}
              aria-label={t("admin.executePostulation")}
              onClick={() => openExecute(row)}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title={t("admin.modifyStatus")}
            aria-label={t("admin.modifyStatus")}
            onClick={() => openStatus(row)}
          >
            <PenLine className="h-3.5 w-3.5" />
          </Button>
          {(row.status === "en_attente" || row.status === "re_execute") && (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              title={t("admin.cancelPostulation")}
              aria-label={t("admin.cancelPostulation")}
              onClick={() => handleCancelByAdmin(row)}
            >
              <Ban className="h-3.5 w-3.5" />
            </Button>
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
            <Button
              variant="outline"
              onClick={() => {
                setRelanceFrom("");
                setRelanceTo("");
                setRelanceOpen(true);
              }}
              disabled={reExecuting}
              className="gap-1.5"
            >
              <RefreshCcw className={`h-4 w-4 ${reExecuting ? "animate-spin" : ""}`} />
              {t("admin.reExecuteCta")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setExecPendingOpen(true)}
              disabled={execPendingRunning}
              className="gap-1.5"
            >
              <Zap className={`h-4 w-4 ${execPendingRunning ? "animate-pulse" : ""}`} />
              {t("admin.executePendingCta")}
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
        columnToggle
        storageKey="admin-postulations"
        dateFilters={[
          { prefix: "scheduled", label: t("postulations.scheduledAt") },
          { prefix: "posted", label: t("postulations.postedAt") },
        ]}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: POSTULATION_STATUSES.map((s) => ({
            value: s,
            label: t(`statuses.${s}`),
          })),
        }}
      />

      {/* ── Relance target chooser + date interval ─────────────── */}
      <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.reExecuteCta")}</DialogTitle>
            <DialogDescription>{t("admin.reExecuteDesc")}</DialogDescription>
          </DialogHeader>

          {/* Date interval : same custom popup picker as /register, max = today */}
          <div className="space-y-2.5 rounded-sm border border-border bg-paper p-3.5">
            <div>
              <p className="eyebrow">{t("admin.relanceIntervalTitle")}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("admin.relanceIntervalDesc")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">{t("admin.relanceDateFrom")}</Label>
                <DatePicker value={relanceFrom} onChange={setRelanceFrom} compact />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("admin.relanceDateTo")}</Label>
                <DatePicker value={relanceTo} onChange={setRelanceTo} compact />
              </div>
            </div>
            {!relanceIntervalValid && (
              <p className="text-xs text-destructive">{t("admin.relanceDateError")}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={reExecuting || !relanceIntervalValid}
              onClick={() => handleRelance("github")}
              className="form-sheet group flex flex-col items-start gap-2 p-4 text-left transition-shadow hover:shadow-md disabled:opacity-60"
            >
              <Github className="h-6 w-6 text-foreground" />
              <span className="font-display text-sm font-bold">{t("admin.relanceGithub")}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("admin.relanceGithubDesc")}
              </span>
              {reExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
            <button
              type="button"
              disabled={reExecuting || !relanceIntervalValid}
              onClick={() => handleRelance("server")}
              className="form-sheet group flex flex-col items-start gap-2 p-4 text-left transition-shadow hover:shadow-md disabled:opacity-60"
            >
              <Server className="h-6 w-6 text-primary" />
              <span className="font-display text-sm font-bold">{t("admin.relanceServer")}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("admin.relanceServerDesc")}
              </span>
              {reExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Execute pending postulations (manual daily wave) ────── */}
      <Dialog open={execPendingOpen} onOpenChange={setExecPendingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.executePendingCta")}</DialogTitle>
            <DialogDescription>{t("admin.executePendingDesc")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={execPendingRunning}
              onClick={() => handleExecutePending("github")}
              className="form-sheet group flex flex-col items-start gap-2 p-4 text-left transition-shadow hover:shadow-md disabled:opacity-60"
            >
              <Github className="h-6 w-6 text-foreground" />
              <span className="font-display text-sm font-bold">{t("admin.relanceGithub")}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("admin.executePendingGithubDesc")}
              </span>
              {execPendingRunning && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
            <button
              type="button"
              disabled={execPendingRunning}
              onClick={() => handleExecutePending("server")}
              className="form-sheet group flex flex-col items-start gap-2 p-4 text-left transition-shadow hover:shadow-md disabled:opacity-60"
            >
              <Server className="h-6 w-6 text-primary" />
              <span className="font-display text-sm font-bold">{t("admin.relanceServer")}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("admin.executePendingServerDesc")}
              </span>
              {execPendingRunning && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Execute one postulation (mail sender selection) ────── */}
      <Dialog open={execOpen} onOpenChange={setExecOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.executeTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.executeDesc")} ·{" "}
              <span className="aktenzeichen">
                {execTarget?.user?.full_name} → {execTarget?.company?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>{t("admin.colSender")}</Label>
            {execSendersLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                {t("common.loading")}
              </p>
            ) : execSenders.length === 0 ? (
              <p className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
                {t("admin.executeNoSenders")}
              </p>
            ) : (
              <Select value={execSenderId} onValueChange={setExecSenderId}>
                <SelectTrigger>
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  {execSenders.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name} ({s.type === "api" ? "API" : "SMTP"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExecOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleExecute}
              disabled={!execSenderId || executing || execSenders.length === 0}
              className="font-semibold"
            >
              {executing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-4 w-4" />
                  {t("admin.executePostulation")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modify status dialog ───────────────────────────────── */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.modifyStatusTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.modifyStatusDesc")} ·{" "}
              <span className="aktenzeichen">
                {statusTarget?.user?.full_name} → {statusTarget?.company?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>{t("admin.newStatus")}</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSTULATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleStatusSave}
              disabled={!newStatus || statusSaving || newStatus === statusTarget?.status}
              className="font-semibold"
            >
              {statusSaving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Executions of one postulation ──────────────────────── */}
      <Dialog open={execHistoryOpen} onOpenChange={setExecHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.executionsOfPostulation")}</DialogTitle>
            <DialogDescription>
              <span className="aktenzeichen">
                {execHistoryTarget?.user?.full_name} → {execHistoryTarget?.company?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          {execHistoryLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t("common.loading")}
            </p>
          ) : execHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.noExecutions")}</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto scroll-slim pr-1">
              {execHistory.map((e) => (
                <div key={e._id} className="form-sheet p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="aktenzeichen num">{e.ref_number}</span>
                    <StatusStamp
                      status={e.outcome?.status || e.status}
                      label={
                        e.outcome
                          ? t(`statuses.${e.outcome.status}`)
                          : t(`statuses.${e.status}`)
                      }
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(TRIGGER_LABELS[e.trigger] || "admin.triggerAdmin")}
                    {" · "}
                    {e.mail_sender_name} ·{" "}
                    {new Date(e.started_at).toLocaleString("fr-FR")}
                  </p>
                  {e.outcome?.error && (
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {e.outcome.error.slice(0, 120)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                  <SelectValue placeholder="-" />
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
                  <SelectValue placeholder="-" />
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
