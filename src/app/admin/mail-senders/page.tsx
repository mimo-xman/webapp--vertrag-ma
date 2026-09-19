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
import { Plus, Pencil, Trash2, Send, AlertTriangle } from "lucide-react";

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
  const [saving, setSaving] = useState(false);

  // Test dialog state
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<SenderRow | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testMessage, setTestMessage] = useState("Ceci est un email de test depuis Vertrag.ma.");
  const [testing, setTesting] = useState(false);

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
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name, type };
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
      await alertApp(err instanceof Error ? err.message : "Échec du test");
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
      render: (row) => <span className="num font-semibold">{row.usage_count}</span>,
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
              <span className="text-muted-foreground">—</span>
            ) : (
              <span style={{ color: rate >= 90 ? "#2f6b4a" : rate >= 60 ? "#8a6a1f" : "#b3391f" }}>
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
              className="flex items-start gap-1 text-[11px] text-[#b3391f]"
              title={row.last_error}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {row.last_error.slice(0, 50)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
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
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => openEdit(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 text-[#b3391f] hover:bg-[#b3391f]/10"
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
              {editing ? t("common.edit") : t("common.add")} — {t("admin.mailSenders")}
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
              {t("admin.testTitle")} — {testTarget?.name}
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
                placeholder="vous@exemple.com"
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
              {testing ? t("common.loading") : t("admin.testSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
