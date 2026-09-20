"use client";

// Price-details dialog - shows the pricing parameters that were in effect
// when a postulation demande was created, plus the stored computation.
// Shared by the USER demandes page and the ADMIN demandes page so both
// sides see the exact same figures.
//
// Layout notes: every label uses min-w-0 + truncate and every value is
// nowrap on a shrink-0 container, so long numbers (100 000…) can never
// push content outside the dialog, whatever the locale or viewport.

import { useI18n } from "@/components/language-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TrendingDown, Info } from "lucide-react";

export interface PricingAxisSnapshot {
  step: number;
  step_price: number;
  min: number;
  max: number;
  free_amount: number;
}

export interface PricingSnapshotData {
  total: PricingAxisSnapshot;
  per_day: PricingAxisSnapshot;
  breakdown: {
    total_price: number;
    /** Full total price before free units (absent on legacy demandes). */
    total_full_price?: number;
    /** Discount from the free units on the TOTAL axis (legacy: 0). */
    total_discount?: number;
    per_day_price: number;
    per_day_discount: number;
    per_day_price_after_discount: number;
    final_price: number;
  };
}

function formatNum(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString("fr-FR") : String(v);
}

function AxisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="num shrink-0 whitespace-nowrap font-medium">{value}</dd>
    </div>
  );
}

function AxisBlock({
  title,
  axis,
  labels,
}: {
  title: string;
  axis: PricingAxisSnapshot;
  labels: {
    step: string;
    stepPrice: string;
    min: string;
    max: string;
    free: string;
    stepPriceHint: string;
  };
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-sm border border-border bg-paper p-3.5">
      <p className="truncate font-display text-xs font-bold uppercase tracking-wide">{title}</p>
      <dl className="mt-2.5 space-y-1.5 text-xs">
        <AxisRow label={labels.step} value={formatNum(axis.step)} />
        <AxisRow label={labels.stepPrice} value={`${axis.step_price} $`} />
        <AxisRow label={labels.min} value={formatNum(axis.min)} />
        <AxisRow label={labels.max} value={formatNum(axis.max)} />
        <AxisRow label={labels.free} value={formatNum(axis.free_amount)} />
      </dl>
      <p className="mt-2 break-words text-[11px] leading-snug text-muted-foreground">
        {labels.stepPriceHint.replace("{step}", formatNum(axis.step))}
      </p>
    </div>
  );
}

export function PriceDetailsDialog({
  open,
  onOpenChange,
  refNumber,
  nmbrTotal,
  nmbrPerDay,
  snapshot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refNumber: string;
  nmbrTotal: number;
  nmbrPerDay: number;
  snapshot: PricingSnapshotData | null;
}) {
  const { t } = useI18n();

  const totalDiscount = snapshot?.breakdown.total_discount ?? 0;
  const totalFullPrice = snapshot?.breakdown.total_full_price;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto scroll-slim">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {t("demandes.priceDetailsTitle", { ref: refNumber })}
          </DialogTitle>
          <DialogDescription>
            {nmbrTotal.toLocaleString("fr-FR")} × · {nmbrPerDay.toLocaleString("fr-FR")} /{" "}
            {t("postulations.perDayUnit")}
          </DialogDescription>
        </DialogHeader>

        {!snapshot ? (
          <p className="text-sm text-muted-foreground">
            {t("demandes.priceDetailsLegacy")}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Parameters at creation */}
            <div className="space-y-2.5">
              <p className="eyebrow">{t("demandes.priceDetailsParamsTitle")}</p>
              <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
                <AxisBlock
                  title={t("demandes.priceDetailsAxisTotal")}
                  axis={snapshot.total}
                  labels={{
                    step: t("demandes.priceDetailsStep"),
                    stepPrice: t("demandes.priceDetailsStepPrice"),
                    min: t("demandes.priceDetailsMin"),
                    max: t("demandes.priceDetailsMax"),
                    free: t("demandes.priceDetailsFree"),
                    stepPriceHint: t("admin.stepPriceHint"),
                  }}
                />
                <AxisBlock
                  title={t("demandes.priceDetailsAxisPerDay")}
                  axis={snapshot.per_day}
                  labels={{
                    step: t("demandes.priceDetailsStep"),
                    stepPrice: t("demandes.priceDetailsStepPrice"),
                    min: t("demandes.priceDetailsMin"),
                    max: t("demandes.priceDetailsMax"),
                    free: t("demandes.priceDetailsFree"),
                    stepPriceHint: t("admin.stepPriceHint"),
                  }}
                />
              </div>
            </div>

            {/* Stored computation */}
            <div className="min-w-0 space-y-2.5">
              <p className="eyebrow">{t("demandes.priceDetailsBreakdownTitle")}</p>
              <div className="min-w-0 rounded-sm border border-border p-3.5">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">
                      {t("demandes.priceTotalLabel")}
                    </span>
                    <span className="num flex shrink-0 items-center gap-2">
                      {totalDiscount > 0 && typeof totalFullPrice === "number" && (
                        <span className="relative text-muted-foreground">
                          {totalFullPrice} $
                          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-destructive" />
                        </span>
                      )}
                      <span className="font-medium">{snapshot.breakdown.total_price} $</span>
                    </span>
                  </div>
                  {totalDiscount > 0 && snapshot.total.free_amount > 0 && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-1 text-success">
                        <TrendingDown className="h-3 w-3 shrink-0" />
                        {t("admin.freeTotal")}
                      </span>
                      <span className="num shrink-0 text-success">−{totalDiscount} $</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-muted-foreground">
                      {t("demandes.pricePerDayLabel")}
                    </span>
                    <span className="num flex shrink-0 items-center gap-2">
                      {snapshot.breakdown.per_day_discount > 0 && (
                        <span className="relative text-muted-foreground">
                          {snapshot.breakdown.per_day_price} $
                          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 rotate-[-6deg] bg-destructive" />
                        </span>
                      )}
                      <span className="font-medium">
                        {snapshot.breakdown.per_day_price_after_discount} $
                      </span>
                    </span>
                  </div>
                  {snapshot.breakdown.per_day_discount > 0 && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-1 text-success">
                        <TrendingDown className="h-3 w-3 shrink-0" />
                        {t("demandes.priceDetailsDiscount")}
                      </span>
                      <span className="num shrink-0 text-success">
                        −{snapshot.breakdown.per_day_discount} $
                      </span>
                    </div>
                  )}
                  <div className="rule-dashed" />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display font-bold">{t("demandes.priceTotal")}</span>
                    <span className="num font-display text-xl font-extrabold text-primary">
                      {snapshot.breakdown.final_price} $
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="flex items-start gap-1.5 break-words text-[11px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {t("demandes.priceDetailsSnapshotNote")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
