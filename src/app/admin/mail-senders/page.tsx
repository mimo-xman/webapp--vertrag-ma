"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { dateColumns } from "@/components/table-date-columns";
import { Plus, Pencil, Trash2, Send, AlertTriangle, Power, History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SenderRow {
  _id: string;
  name: string;
  type: string;
  has_api_key: boolean;
  sender_email: string;
  smtp_host: string;
  smtp_port: number;
  active: boolean;
  in_use: boolean;
  last_error: string;
  last_error_at: string | null;
  usage_count: number;
  success_count: number;
  failed_count: number;
  daily_limit: number;
  today_usage: number;
  createdAt: string;
  updatedAt: string;
}

interface UsageDay {
  iso: string;
  date: string;
  count: number;
  times: string[];
}

interface UsageResponse {
  _id: string;
  name: string;
  type: string;
  usage_count: number;
  success_count: number;
  failed_count: number;
  daily_limit: number;
  days: UsageDay[];
}

export default function AdminMailSendersPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  // Editor dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SenderRow | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"api" | "smtp">("api");
  const [senderEmail, setSenderEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [dailyLimit, setDailyLimit] = useState("0");
  const [saving, setSaving] = useState(false);

  // Test dialog state
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<SenderRow | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testMessage, setTestMessage] = useState("Ceci est un email de test depuis Vertrag.ma.");
  const [testing, setTesting] = useState(false);

  // Usage history dialog state
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageTarget, setUsageTarget] = useState<SenderRow | null>(null);
  const [usageDays, setUsageDays] = useState<UsageDay[] | null>(null);
  const [usageInfo, setUsageInfo] = useState<UsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setType("api");
    setSenderEmail("");
    setApiKey("");
    setSmtpHost("");
    setSmtpPort("587");
    setSmtpUser("");
    setSmtpPass("");
    setDailyLimit("0");
    setEditOpen(true);
  };

  const openEdit = (row: SenderRow) => {
    setEditing(row);
    setName(row.name);
    setType(row.type as "api" | "smtp");
    setSenderEmail(row.sender_email || "");
    setApiKey("");
    setSmtpHost(row.smtp_host);
    setSmtpPort(String(row.smtp_port || 587));
    setSmtpUser("");
    setSmtpPass("");
    setDailyLimit(String(row.daily_limit || 0));
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name, type, daily_limit: Math.max(0, Number(dailyLimit) || 0) };
      if (type === "api") {
        if (apiKey) payload.api_key = apiKey;
        payload.sender_email = senderEmail.trim() || null;
        payload.smtp_config = null;
      } else {
        payload.smtp_config = {
          host: smtpHost,
          port: Number(smtpPort) || 587,
          username: smtpUser,
          password: smtpPass,
        };
        payload.api_key = null;
        payload.sender_email = null;
      }
      if (editing) {
        await apiFetch(`/api/admin/mail-senders/${editing._id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/mail-senders", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      toast({ title: t("common.savedSuccess") });
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SenderRow) => {
    const ok = await confirmApp(
      `${t("common.confirmDeleteMessage")}\n\n${row.name} (${row.usage_count} envois)`,
      { title: t("common.confirmDeleteTitle"), destructive: true, confirmLabel: t("common.delete") }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/mail-senders/${row._id}`, { method: "DELETE" });
      toast({ title: t("common.deletedSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  // ── Activate / deactivate a sender ───────────────────────────
  // Disabled senders are skipped by the execution waves; re-activating
  // clears the last error (the admin fixed the problem).
  const handleToggleActive = async (row: SenderRow) => {
    const activating = !row.active;
    const ok = await confirmApp(
      activating ? t("admin.activateSenderConfirm") : t("admin.deactivateSenderConfirm"),
      {
        title: activating ? t("admin.activateSender") : t("admin.deactivateSender"),
        confirmLabel: activating ? t("admin.activateSender") : t("admin.deactivateSender"),
        destructive: !activating,
      }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/mail-senders/${row._id}`, {
        method: "PUT",
        body: JSON.stringify({ active: activating }),
      });
      toast({
        title: activating ? t("admin.senderActivated") : t("admin.senderDeactivated"),
        description: row.name,
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  // ── Usage history dialog ─────────────────────────────────
  const openUsage = async (row: SenderRow) => {
    setUsageTarget(row);
    setUsageDays(null);
    setUsageInfo(null);
    setUsageOpen(true);
    setUsageLoading(true);
    try {
      // apiFetch returns the FULL JSON envelope { success, data } - the
      // days live under .data. (Previously read .days directly on the
      // envelope, which is undefined → the popup always looked empty.)
      const data = await apiFetch<{ success: boolean; data: UsageResponse }>(
        `/api/admin/mail-senders/${row._id}/usage`
      );
      setUsageInfo(data.data);
      setUsageDays(data.data?.days ?? []);
    } catch {
      setUsageDays([]);
    } finally {
      setUsageLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testTarget) return;
    setTesting(true);
    try {
      await apiFetch(`/api/admin/mail-senders/${testTarget._id}/test`, {
        method: "POST",
        body: JSON.stringify({ email: testEmail, message: testMessage }),
      });
      toast({ title: t("admin.testSuccess") });
      setTestOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : t("admin.testFailed"));
    } finally {
      setTesting(false);
    }
  };

  const columns: DataTableColumn<SenderRow>[] = [
    {
      key: "name",
      header: t("admin.senderName"),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.type === "api" && row.sender_email && (
            <p className="aktenzeichen">{row.sender_email}</p>
          )}
          {row.type === "smtp" && row.smtp_host && (
            <p className="aktenzeichen">
              {row.smtp_host}:{row.smtp_port}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "type",
      header: t("admin.senderType"),
      sortable: true,
      render: (row) => (
        <Badge variant="outline" className="font-mono uppercase">
          {row.type}
        </Badge>
      ),
    },
    {
      key: "usage_count",
      header: t("admin.colUsage"),
      sortable: true,
      render: (row) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="num font-semibold">{row.usage_count}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title={t("admin.usageHistory")}
              aria-label={t("admin.usageHistory")}
              onClick={() => openUsage(row)}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="num text-[11px] text-muted-foreground">
            {t("admin.todayUsage")}: {row.today_usage}
            {row.daily_limit > 0 ? ` / ${row.daily_limit}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "daily_limit",
      header: t("admin.dailyLimit"),
      sortable: true,
      render: (row) => (
        <span className="num text-xs">
          {row.daily_limit > 0 ? (
            <span className="font-semibold">{row.daily_limit.toLocaleString("fr-FR")}</span>
          ) : (
            <span className="text-muted-foreground">{t("admin.unlimited")}</span>
          )}
        </span>
      ),
    },
    {
      key: "success_rate",
      header: t("admin.colSuccessRate"),
      render: (row) => {
        const total = row.success_count + row.failed_count;
        const rate = total === 0 ? null : Math.round((row.success_count / total) * 100);
        return (
          <span className="num text-xs">
            {rate === null ? (
              <span className="text-muted-foreground">-</span>
            ) : (
              <span
                style={{
                  color:
                    rate >= 90 ? "var(--success)" : rate >= 60 ? "var(--warning)" : "var(--destructive)",
                }}
              >
                {rate}% ({row.success_count}/{total})
              </span>
            )}
          </span>
        );
      },
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
          {row.in_use && <StatusStamp status="in_use" label={t("statuses.in_use")} />}
          {row.last_error && (
            <p
              className="flex items-start gap-1 text-[11px] text-destructive"
              title={row.last_error}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {row.last_error.slice(0, 50)}
            </p>
          )}
        </div>
      ),
    },
    ...dateColumns<SenderRow>(t),
    {
      key: "actions",
      header: t("common.actions"),
      alwaysVisible: true,
      render: (row) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setTestTarget(row);
              setTestOpen(true);
            }}
          >
            <Send className="h-3.5 w-3.5" />
            {t("admin.testSender")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-7 w-7",
              row.active
                ? "text-warning hover:bg-warning/10"
                : "text-success hover:bg-success/10"
            )}
            title={row.active ? t("admin.deactivateSender") : t("admin.activateSender")}
            aria-label={row.active ? t("admin.deactivateSender") : t("admin.activateSender")}
            onClick={() => handleToggleActive(row)}
          >
            <Power className="h-3.5 w-3.5" />
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
    !saving &&
    (type === "api"
      ? editing
        ? senderEmail.trim().length > 0 || editing.sender_email.length > 0
        : apiKey.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail.trim())
      : smtpHost.trim().length > 0 &&
        smtpUser.trim().length > 0 &&
        (editing ? true : smtpPass.length > 0) &&
        (editing || smtpPass.length > 0 || true));

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.mailSenders")}
        subtitle={t("admin.mailSendersSubtitle")}
        actions={
          <Button onClick={openCreate} className="font-semibold">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("common.add")}
          </Button>
        }
      />

      <DataTable
        endpoint="/api/admin/mail-senders"
        columns={columns}
        refreshKey={refreshKey}
        columnToggle
        storageKey="admin-mail-senders"
        dateFilters={[{ prefix: "created", label: t("common.createdAt") }]}
        statusFilter={{
          key: "type",
          label: t("admin.senderType"),
          options: [
            { value: "api", label: "API" },
            { value: "smtp", label: "SMTP" },
          ],
        }}
      />

      {/* Editor dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? t("common.edit") : t("common.add")} · {t("admin.mailSenders")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("admin.senderName")}</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.senderType")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as "api" | "smtp")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API (Brevo)</SelectItem>
                  <SelectItem value="smtp">SMTP (Gmail…)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "api" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("admin.senderEmailLabel")}</Label>
                  <Input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder={t("admin.senderEmailPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.senderEmailHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.apiKeyLabel")}</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={editing ? "Laisser vide pour conserver" : "xkeysib-…"}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("admin.smtpHost")}</Label>
                    <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("admin.smtpPort")}</Label>
                    <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} type="number" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.smtpUsername")}</Label>
                  <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.smtpPassword")}</Label>
                  <Input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={editing ? "Laisser vide pour conserver" : ""}
                  />
                </div>
              </div>
            )}

            {/* Daily send limit : applies to both types */}
            <div className="space-y-1.5">
              <Label>{t("admin.dailyLimit")}</Label>
              <Input
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                type="number"
                min={0}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">{t("admin.dailyLimitHint")}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!canSave} className="font-semibold">
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {t("admin.testTitle")} · {testTarget?.name}
            </DialogTitle>
            <DialogDescription>{t("admin.testDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("admin.testEmail")}</Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={t("common.emailPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.testMessage")}</Label>
              <Textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                placeholder={t("admin.testMessagePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleTest}
              disabled={!testEmail || testing || testMessage.trim().length === 0}
              className="font-semibold"
            >
              {testing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("admin.testSend")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage history dialog : per day, with the exact time of each send
          (postulations AND test emails - every real send is logged). */}
      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto scroll-slim">
          <DialogHeader>
            <DialogTitle className="font-display">
              {t("admin.usageDialogTitle", { name: usageTarget?.name || "" })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.usageDialogDesc")} {t("admin.usageTimesUtc")}
            </DialogDescription>
          </DialogHeader>

          {usageLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t("common.loading")}
            </p>
          ) : !usageDays || usageDays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("admin.usageNoData")}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t("admin.usageLifetime")}:{" "}
                  <span className="num font-semibold text-foreground">
                    {usageInfo?.usage_count ?? usageTarget?.usage_count}
                  </span>
                </span>
                <span className="num">
                  {usageInfo?.daily_limit || usageTarget?.daily_limit
                    ? `${t("admin.dailyLimit")}: ${usageInfo?.daily_limit ?? usageTarget?.daily_limit}`
                    : t("admin.unlimited")}
                </span>
              </div>
              {usageDays.map((day) => (
                <div key={day.iso} className="rounded-sm border border-border bg-paper p-3">
                  <div className="flex items-center justify-between">
                    <span className="num text-xs font-semibold">{day.date}</span>
                    <span className="num text-[11px] text-muted-foreground">
                      {t("admin.usageTimesCount", { count: day.count })}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {day.times.map((time, i) => (
                      <span
                        key={`${day.iso}-${i}`}
                        className="num rounded-sm border border-border bg-card px-1.5 py-0.5 text-[11px]"
                      >
                        {time}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
