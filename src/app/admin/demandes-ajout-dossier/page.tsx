"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, ExternalLink, Eye, Clock } from "lucide-react";

interface DemandeRow {
  _id: string;
  ref_number: string;
  dossier_pdf_link: string;
  status: string;
  message_on_failed: string | null;
  createdAt: string;
  user: { _id: string; full_name: string; email: string } | null;
}

export default function AdminDemandesAjoutDossierPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<DemandeRow | null>(null);
  const [rejectMessage, setRejectMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async (row: DemandeRow) => {
    try {
      await apiFetch(`/api/admin/demandes-ajout-dossier/${row._id}/confirm`, { method: "POST" });
      toast({ title: t("admin.dossierConfirmed") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const openReject = (row: DemandeRow) => {
    setRejectTarget(row);
    setRejectMessage("");
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/demandes-ajout-dossier/${rejectTarget._id}/reject`, {
        method: "POST",
        body: JSON.stringify({ message: rejectMessage }),
      });
      toast({ title: t("admin.dossierRejected") });
      setRejectOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const columns: DataTableColumn<DemandeRow>[] = [
    {
      key: "ref_number",
      header: t("demandes.refNumber"),
      render: (row) => <span className="aktenzeichen">{row.ref_number}</span>,
    },
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
      key: "status",
      header: t("demandes.status"),
      sortable: true,
      render: (row) => (
        <div className="space-y-1">
          <StatusStamp status={row.status} label={t(`statuses.${row.status}`)} />
          {row.status === "rejected" && row.message_on_failed && (
            <p className="max-w-48 truncate text-[11px] text-[#b3391f]" title={row.message_on_failed}>
              {row.message_on_failed}
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
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
            <a href={row.dossier_pdf_link} target="_blank" rel="noopener noreferrer">
              <Eye className="h-3.5 w-3.5" />
              {t("admin.previewDossier")}
            </a>
          </Button>
          {row.status === "en_attente" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-[#1e4475] text-xs hover:bg-[#163358]"
                          onClick={async () => {
                            const ok = await confirmApp("Marquer ce dossier comme en cours de révision ? L'utilisateur ne pourra plus l'annuler.", {
                              title: "En cours de révision",
                              confirmLabel: "Confirmer",
                            });
                            if (!ok) return;
                            try {
                              await apiFetch(`/api/admin/demandes-ajout-dossier/${row._id}/mark-in-review`, {
                                method: "POST",
                              });
                              toast({ title: t("common.operationSuccess") });
                              setRefreshKey((k) => k + 1);
                            } catch (err) {
                              await alertApp(err instanceof Error ? err.message : "Erreur");
                            }
                          }}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          En cours de révision
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-[#2f6b4a] text-xs hover:bg-[#245540]"
                          onClick={() => handleConfirm(row)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t("admin.confirmDossier")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs text-[#b3391f] hover:bg-[#b3391f]/10"
                          onClick={() => openReject(row)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t("admin.rejectDossier")}
                        </Button>
                      </div>
                    )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.demandesAjout")}
        subtitle={t("admin.demandesAjoutSubtitle")}
      />
      <DataTable
        endpoint="/api/admin/demandes-ajout-dossier"
        columns={columns}
        refreshKey={refreshKey}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "en_attente", label: t("statuses.en_attente") },
            { value: "en_cours_de_revision", label: t("statuses.en_cours_de_revision") },
            { value: "confirmed", label: t("statuses.confirmed") },
            { value: "rejected", label: t("statuses.rejected") },
            { value: "cancelled", label: t("statuses.cancelled") },
          ],
        }}
      />

      {/* Reject with message dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.rejectDossier")}</DialogTitle>
            <DialogDescription>
              {rejectTarget?.ref_number} — {t("admin.rejectMessageLabel")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={rejectMessage}
            onChange={(e) => setRejectMessage(e.target.value)}
            placeholder={t("admin.rejectMessagePlaceholder")}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMessage.trim().length < 5 || saving}
              className="font-semibold"
            >
              {saving ? t("common.loading") : t("admin.rejectDossier")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
