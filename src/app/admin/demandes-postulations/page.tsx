"use client";

import { useState } from "react";
import { useI18n } from "@/components/language-provider";
import { AdminPageHeader } from "@/components/admin-page-header";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { StatusStamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, ReceiptText } from "lucide-react";
import {
  PriceDetailsDialog,
  type PricingSnapshotData,
} from "@/components/price-details-dialog";

interface DemandeRow {
  _id: string;
  ref_number: string;
  nmbr_total: number;
  nmbr_per_day: number;
  price: number;
  pricing_snapshot: PricingSnapshotData | null;
  status: string;
  createdAt: string;
  categories: string[];
  user: { _id: string; full_name: string; email: string } | null;
}

export default function AdminDemandesPostulationsPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailsTarget, setDetailsTarget] = useState<DemandeRow | null>(null);

  const handleConfirm = async (row: DemandeRow) => {
    const ok = await confirmApp(
      t("admin.confirmPaymentMessage", { ref: row.ref_number, price: row.price }),
      { title: t("admin.confirmPaymentTitle"), confirmLabel: t("admin.confirmPayment") }
    );
    if (!ok) return;
    try {
      const data = await apiFetch<{ created: number; days: { date: string; count: number }[] }>(
        `/api/admin/demandes-postulations/${row._id}/confirm`,
        { method: "POST" }
      );
      toast({
        title: t("admin.paymentConfirmed", { count: data.created }),
        description: data.days
          .slice(0, 5)
          .map((d) => `${d.date}: ${d.count}`)
          .join(" · "),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleReject = async (row: DemandeRow) => {
    const ok = await confirmApp(t("admin.rejectConfirmMessage", { ref: row.ref_number }), {
      title: t("admin.rejectConfirmTitle"),
      destructive: true,
      confirmLabel: t("admin.rejectDemande"),
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/demandes-postulations/${row._id}/reject`, { method: "POST" });
      toast({ title: t("admin.paymentRejected") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
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
      key: "categories",
      header: t("demandes.categories"),
      render: (row) =>
        row.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.categories.slice(0, 2).map((c) => (
              <Badge key={c} variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                {c}
              </Badge>
            ))}
            {row.categories.length > 2 && (
              <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                +{row.categories.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{t("demandes.allCategories")}</span>
        ),
    },
    {
      key: "nmbr_total",
      header: t("demandes.nmbrTotal"),
      sortable: true,
      render: (row) => (
        <div className="num">
          {row.nmbr_total.toLocaleString("fr-FR")}
          <span className="ml-1 text-xs text-muted-foreground">
            ({row.nmbr_per_day}/j)
          </span>
        </div>
      ),
    },
    {
      key: "price",
      header: t("demandes.price"),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="num font-semibold">{row.price} $</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title={t("admin.viewPriceDetails")}
            aria-label={t("admin.viewPriceDetails")}
            onClick={() => setDetailsTarget(row)}
          >
            <ReceiptText className="h-3.5 w-3.5" />
          </Button>
        </div>
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
      render: (row) =>
        row.status === "en_attente" ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-7 gap-1 bg-success text-xs hover:bg-success/90"
              onClick={() => handleConfirm(row)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("admin.confirmPayment")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => handleReject(row)}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("admin.rejectDemande")}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="p-6">
      <AdminPageHeader
        eyebrow="Verwaltung"
        title={t("admin.demandesPostulations")}
        subtitle={t("admin.demandesPostulationsSubtitle")}
      />
      <DataTable
        endpoint="/api/admin/demandes-postulations"
        columns={columns}
        refreshKey={refreshKey}
        statusFilter={{
          key: "status",
          label: t("common.status"),
          options: [
            { value: "en_attente", label: t("statuses.en_attente") },
            { value: "payed", label: t("statuses.payed") },
            { value: "canceled", label: t("statuses.canceled") },
          ],
        }}
      />

      {/* Price details — parameters frozen at creation time (admin view) */}
      <PriceDetailsDialog
        open={detailsTarget !== null}
        onOpenChange={(o) => !o && setDetailsTarget(null)}
        refNumber={detailsTarget?.ref_number || ""}
        nmbrTotal={detailsTarget?.nmbr_total || 0}
        nmbrPerDay={detailsTarget?.nmbr_per_day || 0}
        snapshot={detailsTarget?.pricing_snapshot || null}
      />
    </div>
  );
}
