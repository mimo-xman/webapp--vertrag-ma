"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { AlertTriangle, Radio, RadioTower, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { DatePicker } from "@/components/date-picker";

// Live polling refresh rate.
const POLL_MS = 3000;

interface ExecutionRow {
  _id: string;
  ref_number: string;
  trigger: string;
  status: string;
  mail_sender_name: string;
  total: number;
  success: number;
  failed: number;
  fatal_error: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ExecutionDetail extends ExecutionRow {
  postulations_details: {
    postulation_id: string;
    status: string;
    error: string | null;
    executed_at: string;
    user: { full_name: string; email: string } | null;
    company: { name: string; email: string } | null;
  }[];
}

const TRIGGER_LABELS: Record<string, string> = {
  github: "admin.relanceGithub",
  server: "admin.relanceServer",
  admin: "admin.triggerAdmin",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminExecutionsPage() {
  const { t } = useI18n();
  const { alertApp } = useAppPopup();
  const [date, setDate] = useState(todayISO());
  const [trigger, setTrigger] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [totals, setTotals] = useState<{ executions: number; sent: number; failed: number }>({
    executions: 0,
    sent: 0,
    failed: 0,
  });
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live polling - pauses when the tab is hidden.
  const [live, setLive] = useState(true);
  const liveRef = useRef(live);
  liveRef.current = live;

  const fetchExecutions = useCallback(async () => {
    try {
      // Empty date = NO date filter (all executions, every day). The X of
      // the picker clears it; picking a day narrows the history to that day.
      const data = await apiFetch<{
        data: ExecutionRow[];
        totals: { executions: number; sent: number; failed: number };
        pagination: { total: number; totalPages: number };
      }>(`/api/admin/executions?${date ? `date=${date}&` : ""}trigger=${trigger}&page=${page}&limit=${limit}`);
      setRows(data.data);
      setTotals(data.totals);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorFallback"));
    } finally {
      setLoading(false);
    }
  }, [date, trigger, page]);

  useEffect(() => {
    setLoading(true);
    fetchExecutions();
  }, [fetchExecutions]);

  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchExecutions();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [live, fetchExecutions]);

  // ── Detail dialog ──────────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (row: ExecutionRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await apiFetch<{ execution: ExecutionDetail }>(
        `/api/admin/executions?id=${row._id}`
      );
      setDetail(data.execution);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const changeDate = (value: string) => {
    // "" = cleared (X button) → show EVERYTHING, not just today.
    setDate(value);
    setPage(1);
  };

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.executions")}
        subtitle={t("admin.executionsSubtitle")}
        actions={
          <Button
            variant={live ? "default" : "outline"}
            onClick={() => setLive((v) => !v)}
            className="gap-1.5 font-semibold"
            title={live ? t("admin.execLiveOn") : t("admin.execLiveOff")}
          >
            {live ? (
              <>
                <RadioTower className="h-4 w-4 animate-pulse" />
                LIVE · {POLL_MS / 1000}s
              </>
            ) : (
              <>
                <Radio className="h-4 w-4" />
                {t("admin.execLiveOff")}
              </>
            )}
          </Button>
        }
      />

      {/* Toolbar: date + trigger filter + day totals */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="eyebrow block">{t("common.date")}</label>
            {/* Custom popup picker (same as /register) : executions history,
                so the selectable range stops at today. Empty = all days. */}
            <div className="w-40">
              <DatePicker value={date} onChange={changeDate} compact placeholder={t("common.all")} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="eyebrow block">{t("admin.execOpenExecutions")}</label>
            <Select
              value={trigger}
              onValueChange={(v) => {
                setTrigger(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="github">{t("admin.relanceGithub")}</SelectItem>
                <SelectItem value="server">{t("admin.relanceServer")}</SelectItem>
                <SelectItem value="admin">{t("admin.triggerAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="num gap-1 bg-card px-3 py-1.5 text-xs">
            {t("admin.execTotalCount", { count: totals.executions })}
          </Badge>
          <Badge variant="outline" className="num gap-1 bg-card px-3 py-1.5 text-xs text-success">
            {t("admin.execSentTotal", { count: totals.sent })}
          </Badge>
          <Badge variant="outline" className="num gap-1 bg-card px-3 py-1.5 text-xs text-destructive">
            {t("admin.execFailedTotal", { count: totals.failed })}
          </Badge>
        </div>
      </div>

      {/* Table */}
      <div className="form-sheet overflow-hidden">
        <div className="overflow-x-auto scroll-slim">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-secondary bg-paper">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("admin.colRef")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("admin.colType")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("admin.colSender")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("common.status")}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t("admin.execPostulations")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("admin.execStartedAt")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("admin.execFinishedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    {t("admin.execNoData")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row._id}
                    className="cursor-pointer border-b border-secondary last:border-0 hover:bg-paper"
                    onClick={() => openDetail(row)}
                  >
                    <td className="px-4 py-3">
                      <span className="aktenzeichen num font-semibold">{row.ref_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {t(TRIGGER_LABELS[row.trigger] || "admin.triggerAdmin")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs">{row.mail_sender_name || "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusStamp status={row.status} label={t(`statuses.${row.status}`)} animate={row.status === "running"} />
                        {row.fatal_error && (
                          <p className="flex items-start gap-1 text-[11px] text-destructive" title={row.fatal_error}>
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            {row.fatal_error.slice(0, 50)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="num text-xs">
                        <span className="font-semibold">{row.success}</span>
                        <span className="text-success"> ✓</span>
                        {row.failed > 0 && (
                          <>
                            {" / "}
                            <span className="font-semibold text-destructive">{row.failed}</span>
                            <span> ✗</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="aktenzeichen">
                        {new Date(row.started_at).toLocaleTimeString("fr-FR")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.finished_at ? (
                        <span className="aktenzeichen">
                          {new Date(row.finished_at).toLocaleTimeString("fr-FR")}
                        </span>
                      ) : (
                        <span className="aktenzeichen text-muted-foreground/50">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border bg-paper px-4 py-2.5">
          <p className="font-mono text-xs text-muted-foreground">
            {pagination.total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)}{" "}
            {t("common.of")} {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 font-mono text-xs text-muted-foreground">
              {page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Execution detail dialog ─────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {detail ? t("admin.execDetailTitle", { ref: detail.ref_number }) : t("common.loading")}
            </DialogTitle>
            {detail && (
              <DialogDescription>
                {t(TRIGGER_LABELS[detail.trigger] || "admin.triggerAdmin")} · {detail.mail_sender_name}
              </DialogDescription>
            )}
          </DialogHeader>

          {detailLoading || !detail ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t("common.loading")}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="form-sheet p-3">
                  <p className="eyebrow">{t("common.status")}</p>
                  <StatusStamp
                    status={detail.status}
                    label={t(`statuses.${detail.status}`)}
                    animate={detail.status === "running"}
                    className="mt-1"
                  />
                </div>
                <div className="form-sheet p-3">
                  <p className="eyebrow">{t("admin.execSentShort")}</p>
                  <p className="num mt-1 text-lg font-bold text-success">{detail.success}</p>
                </div>
                <div className="form-sheet p-3">
                  <p className="eyebrow">{t("admin.execFailedShort")}</p>
                  <p className="num mt-1 text-lg font-bold text-destructive">{detail.failed}</p>
                </div>
                <div className="form-sheet p-3">
                  <p className="eyebrow">{t("admin.execFinishedAt")}</p>
                  <p className="aktenzeichen mt-1">
                    {detail.finished_at
                      ? new Date(detail.finished_at).toLocaleTimeString("fr-FR")
                      : "-"}
                  </p>
                </div>
              </div>

              {detail.fatal_error && (
                <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <strong>{t("admin.execFatalError")} :</strong> {detail.fatal_error}
                </p>
              )}

              <div>
                <p className="eyebrow mb-2">{t("admin.execPostulations")}</p>
                {detail.postulations_details.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">-</p>
                ) : (
                  <div className="max-h-72 space-y-1.5 overflow-y-auto scroll-slim pr-1">
                    {detail.postulations_details.map((p) => (
                      <div
                        key={p.postulation_id}
                        className="flex items-center justify-between gap-2 border-b border-dashed border-secondary pb-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {p.user?.full_name || "-"} → {p.company?.name || "-"}
                          </p>
                          {p.error && (
                            <p className="truncate text-[11px] text-destructive" title={p.error}>
                              {p.error.slice(0, 100)}
                            </p>
                          )}
                        </div>
                        <StatusStamp
                          status={p.status}
                          label={t(`statuses.${p.status}`)}
                          className="shrink-0 !text-[10px]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
