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
import {
  addStatusKey,
  statusVariant,
  addPriceParts,
  adminCanCancel,
  isAddDemandePayed,
} from "@/lib/dossier-status";
import { dateColumns } from "@/components/table-date-columns";
import {
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  MessageSquare,
  Ban,
  Banknote,
} from "lucide-react";

interface DemandeRow {
  _id: string;
  ref_number: string;
  dossier_pdf_link: string;
  status: string;
  price: number;
  payed_at: string | null;
  cancelled_by: "user" | "admin" | null;
  cancelled_at: string | null;
  cancel_message: string | null;
  message_on_failed: string | null;
  createdAt: string;
  updatedAt: string;
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

  // Admin cancellation dialog (message required once the payment was validated)
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DemandeRow | null>(null);
  const [cancelMessage, setCancelMessage] = useState("");

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

  // ── Payment workflow (price > 0) ────────────────────────────────────
  const handleConfirmPayment = async (row: DemandeRow) => {
    const ok = await confirmApp(
      t("admin.confirmPaymentAddMessage", { ref: row.ref_number, price: row.price }),
      { title: t("admin.confirmPaymentAddTitle"), confirmLabel: t("admin.confirmPaymentAdd") }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/demandes-ajout-dossier/${row._id}/confirm-payment`, {
        method: "POST",
      });
      toast({ title: t("admin.paymentAddConfirmed") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleMarkInReview = async (row: DemandeRow) => {
    const ok = await confirmApp(
      t("admin.markInReviewConfirm"),
      {
        title: t("admin.markInReviewTitle"),
        confirmLabel: t("common.confirm"),
      }
    );
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
  };

  const openCancel = (row: DemandeRow) => {
    setCancelTarget(row);
    setCancelMessage("");
    setCancelOpen(true);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/demandes-ajout-dossier/${cancelTarget._id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ message: cancelMessage.trim() || undefined }),
      });
      toast({ title: t("admin.demandeCancelledSuccess") });
      setCancelOpen(false);
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
          <p className="font-medium">{row.user?.full_name || "-"}</p>
          <p className="aktenzeichen">{row.user?.email}</p>
        </div>
      ),
    },
    {
      key: "price",
      header: t("demandes.price"),
      sortable: true,
      render: (row) => <span className="num">{addPriceParts(t, row)}</span>,
    },
    ...dateColumns<DemandeRow>(t, { createdVisible: true }),
    {
      key: "status",
      header: t("demandes.status"),
      sortable: true,
      render: (row) => (
        <div className="space-y-1">
          <StatusStamp status={statusVariant(row)} label={t(addStatusKey(row))} />
          {(row.status === "rejected" || row.status === "cancelled") &&
            row.status === "rejected" &&
            row.message_on_failed && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  title={t("admin.viewMessage")}
                  aria-label={t("admin.viewMessage")}
                  onClick={() =>
                    alertApp(row.message_on_failed!, t("admin.rejectMessageTitle", { ref: row.ref_number }))
                  }
                >
                  <MessageSquare className="h-3 w-3" />
                </Button>
              </div>
            )}
          {row.status === "cancelled" && row.cancel_message && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                title={t("admin.viewCancelMessage")}
                aria-label={t("admin.viewCancelMessage")}
                onClick={() =>
                  alertApp(row.cancel_message!, t("admin.cancelMessageTitleAdd", { ref: row.ref_number }))
                }
              >
                <MessageSquare className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
            <a href={row.dossier_pdf_link} target="_blank" rel="noopener noreferrer">
              <Eye className="h-3.5 w-3.5" />
              {t("admin.previewDossier")}
            </a>
          </Button>

          {/* ── PRICED workflow (price > 0): payment → review → confirm/reject ── */}
          {row.status === "waiting_payment" && (
            <Button
              size="sm"
              className="h-7 gap-1 bg-primary text-xs hover:bg-primary/90"
              onClick={() => handleConfirmPayment(row)}
            >
              <Banknote className="h-3.5 w-3.5" />
              {t("admin.confirmPaymentAdd")}
            </Button>
          )}
          {row.status === "payed_waiting_review" && (
            <Button
              size="sm"
              className="h-7 gap-1 bg-primary text-xs hover:bg-primary/90"
              onClick={() => handleMarkInReview(row)}
            >
              <Clock className="h-3.5 w-3.5" />
              {t("admin.markInReview")}
            </Button>
          )}

          {/* ── FREE workflow: mark in review from en_attente ── */}
          {row.status === "en_attente" && (
            <Button
              size="sm"
              className="h-7 gap-1 bg-primary text-xs hover:bg-primary/90"
              onClick={() => handleMarkInReview(row)}
            >
              <Clock className="h-3.5 w-3.5" />
              {t("admin.markInReview")}
            </Button>
          )}

          {/* ── Review outcomes (both workflows) ── */}
          {["en_attente", "en_cours_de_revision", "payed_waiting_review", "payed_in_review"].includes(
            row.status
          ) && (
            <>
              <Button
                size="sm"
                className="h-7 gap-1 bg-success text-xs hover:bg-success/90"
                onClick={() => handleConfirm(row)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("admin.confirmDossier")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => openReject(row)}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("admin.rejectDossier")}
              </Button>
            </>
          )}

          {/* ── Admin cancellation (any active status) ── */}
          {adminCanCancel("ajout", row) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => openCancel(row)}
              title={
                isAddDemandePayed(row)
                  ? t("admin.cancelMessageRequiredAfterPayment")
                  : t("admin.cancelDemandeAdd")
              }
            >
              <Ban className="h-3.5 w-3.5" />
              {t("admin.cancelDemandeAdd")}
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
        title={t("admin.demandesAjout")}
        subtitle={t("admin.demandesAjoutSubtitle")}
      />
      <DataTable
        endpoint="/api/admin/demandes-ajout-dossier"
        columns={columns}
        refreshKey={refreshKey}
        columnToggle
        storageKey="admin-demandes-ajout"
        dateFilters={[{ prefix: "created", label: t("common.createdAt") }]}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "waiting_payment", label: t("dossier.statusWaitingPayment") },
            { value: "en_attente", label: t("dossier.statusAwaitingReview") },
            { value: "payed_waiting_review", label: t("dossier.statusPayedAwaitingReview") },
            { value: "payed_in_review", label: t("dossier.statusPayedInReview") },
            { value: "en_cours_de_revision", label: t("dossier.statusUnderReview") },
            { value: "confirmed", label: t("dossier.statusConfirmed") },
            { value: "rejected", label: t("dossier.statusRejected") },
            { value: "cancelled_user", label: t("dossier.statusCancelledByUser") },
            { value: "cancelled_admin", label: t("dossier.statusCancelledByAdmin") },
          ],
        }}
      />

      {/* Reject with message dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.rejectDossier")}</DialogTitle>
            <DialogDescription>
              {rejectTarget?.ref_number} · {t("admin.rejectMessageLabel")}
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

      {/* Admin cancellation dialog : message required when already payed */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("admin.cancelDemandeAddTitle")}</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  {t("admin.cancelDemandeAddMessage", { ref: cancelTarget.ref_number })}
                  {isAddDemandePayed(cancelTarget) && (
                    <span className="mt-1.5 block text-destructive">
                      {t("admin.cancelMessageRequiredAfterPayment")}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={cancelMessage}
            onChange={(e) => setCancelMessage(e.target.value)}
            placeholder={t("admin.cancelMessagePlaceholderAdd")}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={
                saving ||
                (cancelTarget !== null &&
                  isAddDemandePayed(cancelTarget) &&
                  cancelMessage.trim().length < 5)
              }
              className="font-semibold"
            >
              {saving ? t("common.loading") : t("admin.cancelDemandeAdd")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
