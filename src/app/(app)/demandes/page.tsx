"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/language-provider";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-utils";
import { useAppPopup } from "@/components/app-popup";
import { useToast } from "@/hooks/use-toast";
import { Plus, MessageCircle, TrendingDown, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
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
}

interface PricingAxis {
  step: number;
  step_price: number;
  min: number;
  max: number;
  free_amount: number;
}

interface OptionsResponse {
  has_dossier: boolean;
  companies_available: number;
  categories: { _id: string; name: string; companies_available: number }[];
  total_options: number[];
  per_day_options: number[];
  pricing: { total: PricingAxis; per_day: PricingAxis };
}

interface PriceBreakdown {
  total_price: number;
  total_full_price: number;
  total_discount: number;
  per_day_price: number;
  per_day_discount: number;
  per_day_price_after_discount: number;
  final_price: number;
}

export default function DemandesPage() {
  const { t } = useI18n();
  const { confirmApp, alertApp } = useAppPopup();
  const { toast } = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<DemandeRow | null>(null);

  // ── History table ─────────────────────────────────────────
  const columns: DataTableColumn<DemandeRow>[] = [
    {
      key: "ref_number",
      header: t("demandes.refNumber"),
      render: (row) => <span className="aktenzeichen">{row.ref_number}</span>,
    },
    {
      key: "categories",
      header: t("demandes.categories"),
      render: (row) =>
        row.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.categories.slice(0, 3).map((c) => (
              <Badge key={c} variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                {c}
              </Badge>
            ))}
            {row.categories.length > 3 && (
              <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                +{row.categories.length - 3}
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
      render: (row) => <span className="num">{row.nmbr_total.toLocaleString("fr-FR")}</span>,
    },
    {
      key: "nmbr_per_day",
      header: t("demandes.nmbrPerDay"),
      render: (row) => <span className="num">{row.nmbr_per_day.toLocaleString("fr-FR")}</span>,
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
            title={t("demandes.viewPriceDetails")}
            aria-label={t("demandes.viewPriceDetails")}
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
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={async () => {
              const ok = await confirmApp(t("demandes.cancelConfirmMessage"), {
                title: t("demandes.cancelConfirmTitle"),
                destructive: true,
                confirmLabel: t("demandes.cancel"),
              });
              if (!ok) return;
              try {
                await apiFetch(`/api/postulation-demandes/${row._id}/cancel`, { method: "POST" });
                toast({ title: t("common.operationSuccess") });
                setRefreshKey((k) => k + 1);
              } catch (err) {
                await alertApp(err instanceof Error ? err.message : t("common.errorFallback"));
              }
            }}
          >
            {t("demandes.cancel")}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Vertrag.ma · {t("demandes.title")}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("demandes.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("demandes.subtitle")}</p>
        </div>
        <Button className="font-semibold" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("demandes.submit")}
        </Button>
      </div>

      <DataTable
        endpoint="/api/postulation-demandes"
        columns={columns}
        refreshKey={refreshKey}
        storageKey="user-demandes"
        emptyMessage={t("postulations.empty")}
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

      <CreateDemandeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />

      {/* Price details : parameters frozen at creation time */}
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

// ═══════════════════════════════════════════════════════════
// Create demande dialog - dynamic options + live price
// ═══════════════════════════════════════════════════════════
function CreateDemandeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const { alertApp } = useAppPopup();

  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [nmbrTotal, setNmbrTotal] = useState<number | null>(null);
  const [nmbrPerDay, setNmbrPerDay] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<PriceBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ref: string;
    price: number;
    whatsapp_url: string;
  } | null>(null);

  // Load options when dialog opens or categories change.
  const loadOptions = useCallback(async (categories: string[]) => {
    const params = categories.length ? `?categories=${categories.join(",")}` : "";
    const data = await apiFetch<OptionsResponse>(`/api/postulation-demandes/options${params}`);
    setOptions(data);
    // A selected category may have been deactivated meanwhile - prune it
    // so the selection always matches what is actually offered.
    const visibleIds = new Set(data.categories.map((c) => c._id));
    setSelectedCategories((prev) => {
      const pruned = prev.filter((id) => visibleIds.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });
    setNmbrTotal(null);
    setNmbrPerDay(null);
    setBreakdown(null);
  }, []);

  useEffect(() => {
    if (open) {
      loadOptions([]);
    }
  }, [open, loadOptions]);

  // Compute price when selection changes.
  useEffect(() => {
    if (!nmbrTotal || !nmbrPerDay) {
      setBreakdown(null);
      return;
    }
    apiFetch<{ breakdown: PriceBreakdown }>("/api/postulation-demandes/options", {
      method: "POST",
      body: JSON.stringify({ categorie_ids: selectedCategories, nmbr_total: nmbrTotal, nmbr_per_day: nmbrPerDay }),
    })
      .then((data) => setBreakdown(data.breakdown))
      .catch(() => setBreakdown(null));
  }, [nmbrTotal, nmbrPerDay, selectedCategories]);

  const perDayOptions = useMemo(() => {
    if (!options) return [];
    return options.per_day_options.filter((v) => !nmbrTotal || v <= nmbrTotal);
  }, [options, nmbrTotal]);

  const estimatedDays =
    nmbrTotal && nmbrPerDay ? Math.ceil(nmbrTotal / nmbrPerDay) : null;

  const toggleCategory = (id: string) => {
    const next = selectedCategories.includes(id)
      ? selectedCategories.filter((c) => c !== id)
      : [...selectedCategories, id];
    setSelectedCategories(next);
    loadOptions(next);
  };

  const handleSubmit = async () => {
    if (!nmbrTotal || !nmbrPerDay) return;
    setLoading(true);
    try {
      const data = await apiFetch<{
        success: boolean;
        demande: { ref_number: string; price: number };
        whatsapp_url: string;
      }>("/api/postulation-demandes", {
        method: "POST",
        body: JSON.stringify({
          categorie_ids: selectedCategories,
          nmbr_total: nmbrTotal,
          nmbr_per_day: nmbrPerDay,
        }),
      });
      setResult({
        ref: data.demande.ref_number,
        price: data.demande.price,
        whatsapp_url: data.whatsapp_url,
      });
      onCreated();
    } catch (err) {
      await alertApp(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const closeDialog = () => {
    onOpenChange(false);
    if (result) {
      setResult(null);
      setSelectedCategories([]);
    }
  };

  const minTotal = options?.pricing.total.min ?? 100;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto scroll-slim">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">{t("demandes.newTitle")}</DialogTitle>
              <DialogDescription>{t("demandes.newSubtitle")}</DialogDescription>
            </DialogHeader>

            {options && !options.has_dossier && (
              <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {t("demandes.requireDossier")}
              </div>
            )}

            {options && options.companies_available < minTotal && (
              <div className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
                {t("demandes.notEnoughCompanies", {
                  count: options.companies_available,
                  min: minTotal,
                })}
              </div>
            )}

            <div className="space-y-5">
              {/* Categories multi-select */}
              <div className="space-y-2">
                <Label>{t("demandes.categoriesLabel")}</Label>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto scroll-slim rounded-sm border border-border bg-card p-2.5">
                  {options?.categories.map((cat) => (
                    <button
                      key={cat._id}
                      type="button"
                      onClick={() => toggleCategory(cat._id)}
                      className={cn(
                        "rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors",
                        selectedCategories.includes(cat._id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-paper text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      )}
                    >
                      {cat.name}
                      <span className="ml-1.5 font-mono opacity-70">{cat.companies_available}</span>
                    </button>
                  ))}
                  {options && options.categories.length === 0 && (
                    <p className="text-xs text-muted-foreground">-</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {options
                    ? t("demandes.companiesAvailable", {
                        count: options.companies_available.toLocaleString("fr-FR"),
                      })
                    : t("common.loading")}
                </p>
              </div>

              {/* Totals */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("demandes.nmbrTotalLabel")}</Label>
                  <Select
                    value={nmbrTotal ? String(nmbrTotal) : ""}
                    onValueChange={(v) => {
                      setNmbrTotal(Number(v));
                      setNmbrPerDay(null);
                    }}
                    disabled={!options || options.total_options.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.total_options.map((v) => (
                        <SelectItem key={v} value={String(v)} className="font-mono">
                          {v.toLocaleString("fr-FR")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("demandes.nmbrPerDayLabel")}</Label>
                  <Select
                    value={nmbrPerDay ? String(nmbrPerDay) : ""}
                    onValueChange={(v) => setNmbrPerDay(Number(v))}
                    disabled={!nmbrTotal}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {perDayOptions.map((v) => (
                        <SelectItem key={v} value={String(v)} className="font-mono">
                          {v.toLocaleString("fr-FR")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Price panel */}
              {breakdown && (
                <div className="form-sheet border-primary/30 bg-paper p-4">
                  <p className="eyebrow mb-3">{t("demandes.priceTitle")}</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 text-muted-foreground">{t("demandes.priceTotalLabel")}</span>
                      <span className="num flex shrink-0 items-center gap-2">
                        {breakdown.total_discount > 0 && (
                          <span className="relative text-muted-foreground">
                            {breakdown.total_full_price} $
                            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-destructive" />
                          </span>
                        )}
                        <span className="font-medium">{breakdown.total_price} $</span>
                      </span>
                    </div>
                    {breakdown.total_discount > 0 && (options?.pricing.total.free_amount ?? 0) > 0 && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-1 text-success">
                          <TrendingDown className="h-3 w-3 shrink-0" />
                          {t("admin.freeTotal")}
                        </span>
                        <span className="num shrink-0 text-success">−{breakdown.total_discount} $</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 text-muted-foreground">{t("demandes.pricePerDayLabel")}</span>
                      <span className="num flex shrink-0 items-center gap-2">
                        {breakdown.per_day_discount > 0 && (
                          <span className="relative text-muted-foreground">
                            {breakdown.per_day_price} $
                            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-destructive" />
                          </span>
                        )}
                        <span className="font-medium">
                          {breakdown.per_day_price_after_discount === 0
                            ? `0 $ ${t("demandes.priceFree")}`
                            : `${breakdown.per_day_price_after_discount} $`}
                        </span>
                      </span>
                    </div>
                    {breakdown.per_day_discount > 0 && (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-1 text-success">
                          <TrendingDown className="h-3 w-3 shrink-0" />
                          {t("admin.freePerDay")}
                        </span>
                        <span className="num shrink-0 text-success">−{breakdown.per_day_discount} $</span>
                      </div>
                    )}
                    <div className="rule-dashed" />
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold">
                        {t("demandes.priceTotal")}
                      </span>
                      <span className="num font-display text-lg font-extrabold text-primary">
                        {breakdown.final_price} $
                      </span>
                    </div>
                    {estimatedDays && (
                      <p className="pt-1 text-xs text-muted-foreground">
                        {t("demandes.daysEstimate", { days: estimatedDays })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                className="font-semibold"
                disabled={!breakdown || loading || !options?.has_dossier}
                onClick={handleSubmit}
              >
                {loading ? t("common.loading") : t("demandes.submit")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                {t("demandes.createdWhaTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("demandes.createdWhaDesc", {
                  ref: result.ref,
                  price: result.price,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:flex-row">
              <Button variant="outline" onClick={closeDialog}>
                {t("common.close")}
              </Button>
              <Button asChild className="font-semibold">
                <a href={result.whatsapp_url} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  {t("demandes.createdWhaCta")}
                </a>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
