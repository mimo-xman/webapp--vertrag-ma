"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Banknote, CalendarClock, Upload, Loader2 } from "lucide-react";

interface DemandeRow {
  _id: string;
  ref_number: string;
  price: number;
  traduction_price: number;
  status: string;
  payed_at: string | null;
  dossier_ready_at: string | null;
  completed_at: string | null;
  dossier_pdf_link: string | null;
  createdAt: string;
  user: { _id: string; full_name: string; email: string } | null;
}

export default function AdminDemandesCreationDossierPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  // Payment confirmation dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<DemandeRow | null>(null);
  const [readyDate, setReadyDate] = useState("");
  const [traductionPrice, setTraductionPrice] = useState("0");
  const [saving, setSaving] = useState(false);

  // Completion dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<DemandeRow | null>(null);
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [finalTraduction, setFinalTraduction] = useState("");
  const [uploading, setUploading] = useState(false);

  const openPay = (row: DemandeRow) => {
    setPayTarget(row);
    setReadyDate("");
    setTraductionPrice("0");
    setPayOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!payTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/demandes-creation-dossier/${payTarget._id}/confirm-payment`, {
        method: "POST",
        body: JSON.stringify({
          ...(readyDate ? { dossier_ready_at: readyDate } : {}),
          ...(Number(traductionPrice) > 0 ? { traduction_price: Number(traductionPrice) } : {}),
        }),
      });
      toast({ title: t("common.operationSuccess") });
      setPayOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const openComplete = (row: DemandeRow) => {
    setCompleteTarget(row);
    setFinalFile(null);
    setFinalTraduction(row.traduction_price ? String(row.traduction_price) : "");
    setCompleteOpen(true);
  };

  const handleComplete = async () => {
    if (!completeTarget || !finalFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", finalFile);
      if (finalTraduction && Number(finalTraduction) > 0) {
        formData.append("traduction_price", finalTraduction);
      }
      const response = await fetch(
        `/api/admin/demandes-creation-dossier/${completeTarget._id}/complete`,
        { method: "POST", body: formData }
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Erreur");
      toast({ title: t("admin.completedSuccess") });
      setCompleteOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUploading(false);
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
      key: "price",
      header: t("demandes.price"),
      sortable: true,
      render: (row) => (
        <div className="num">
          {row.price} $
          {row.traduction_price > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              +{row.traduction_price} $ ({t("dossier.traductionPrice")})
            </span>
          )}
        </div>
      ),
    },
    {
      key: "dossier_ready_at",
      header: t("dossier.readyAt"),
      sortable: true,
      render: (row) =>
        row.dossier_ready_at ? (
          <span className="aktenzeichen">
            {new Date(row.dossier_ready_at).toLocaleDateString("fr-FR")}
          </span>
        ) : (
          <span className="aktenzeichen text-muted-foreground/50">—</span>
        ),
    },
    {
      key: "status",
      header: t("demandes.status"),
      sortable: true,
      render: (row) => <StatusStamp status={row.status} label={t(`statuses.${row.status}`)} />,
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (row) => (
        <div className="flex gap-1">
          {row.status === "en_attente" && (
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => openPay(row)}
            >
              <Banknote className="h-3.5 w-3.5" />
              {t("admin.confirmPayed")}
            </Button>
          )}
          {row.status === "payed" && (
            <>
              <Button
                size="sm"
                className="h-7 gap-1 bg-[#1e4475] text-xs hover:bg-[#163358]"
                onClick={async () => {
                  const ok = await confirmApp("Marquer cette demande comme en cours de création ?", {
                    title: "En cours de création",
                    confirmLabel: "Confirmer",
                  });
                  if (!ok) return;
                  try {
                    await apiFetch(`/api/admin/demandes-creation-dossier/${row._id}/mark-in-creation`, {
                      method: "POST",
                    });
                    toast({ title: t("common.operationSuccess") });
                    setRefreshKey((k) => k + 1);
                  } catch (err) {
                    await alertApp(err instanceof Error ? err.message : "Erreur");
                  }
                }}
              >
                <Loader2 className="h-3.5 w-3.5" />
                En cours
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 bg-[#2f6b4a] text-xs hover:bg-[#245540]"
                onClick={() => openComplete(row)}
              >
                <Upload className="h-3.5 w-3.5" />
                {t("admin.markCompleted")}
              </Button>
            </>
          )}
          {row.status === "in_creation" && (
            <Button
              size="sm"
              className="h-7 gap-1 bg-[#2f6b4a] text-xs hover:bg-[#245540]"
              onClick={() => openComplete(row)}
            >
              <Upload className="h-3.5 w-3.5" />
              {t("admin.markCompleted")}
            </Button>
          )}
          {row.status === "completed" && row.dossier_pdf_link && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
              <a href={row.dossier_pdf_link} target="_blank" rel="noopener noreferrer">
                {t("dossier.downloadDossier")}
              </a>
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.demandesCreation")}
        subtitle={t("admin.demandesCreationSubtitle")}
      />
      <DataTable
        endpoint="/api/admin/demandes-creation-dossier"
        columns={columns}
        refreshKey={refreshKey}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "en_attente", label: t("statuses.en_attente") },
            { value: "payed", label: t("statuses.payed") },
            { value: "completed", label: t("statuses.completed") },
            { value: "canceled", label: t("statuses.canceled") },
          ],
        }}
      />

      {/* Payment confirmation dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.confirmPayed")}</DialogTitle>
            <DialogDescription>
              {payTarget?.ref_number} — {payTarget?.price} $
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                {t("admin.setReadyDate")}
              </Label>
              <Input type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.traductionPriceLabel")}</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={traductionPrice}
                onChange={(e) => setTraductionPrice(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                0 si l'utilisateur a payé ses diplômes déjà traduits.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmPayment} disabled={saving} className="font-semibold">
              {saving ? t("common.loading") : t("admin.confirmPayed")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete dialog (upload final dossier) */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.uploadFinalDossier")}</DialogTitle>
            <DialogDescription>
              {completeTarget?.ref_number} — {t("admin.markCompleted")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>PDF (20 MB max)</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFinalFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.traductionPriceLabel")}</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={finalTraduction}
                onChange={(e) => setFinalTraduction(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleComplete}
              disabled={!finalFile || uploading}
              className="font-semibold"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("admin.markCompleted")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
