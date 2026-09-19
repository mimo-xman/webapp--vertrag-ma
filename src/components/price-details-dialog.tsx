"use client";

// Price-details dialog — shows the pricing parameters that were in effect
// when a postulation demande was created, plus the stored computation.
// Shared by the USER demandes page and the ADMIN demandes page so both
// sides see the exact same figures.

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
    per_day_price: number;
    per_day_discount: number;
    per_day_price_after_discount: number;
    final_price: number;
  };
}

function formatNum(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString("fr-FR") : String(v);
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
    <div className="rounded-sm border border-border bg-paper p-3.5">
      <p className="font-display text-xs font-bold uppercase tracking-wide">{title}</p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{labels.step}</dt>
          <dd className="num font-medium">{formatNum(axis.step)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{labels.stepPrice}</dt>
          <dd className="num font-medium">{axis.step_price} $</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{labels.min}</dt>
          <dd className="num font-medium">{formatNum(axis.min)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{labels.max}</dt>
          <dd className="num font-medium">{formatNum(axis.max)}</dd>
        </div>
        <div className="col-span-2 flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">{labels.free}</dt>
          <dd className="num font-medium text-success">{formatNum(axis.free_amount)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto scroll-slim">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {t("demandes.priceDetailsTitle", { ref: refNumber })}
          </DialogTitle>
          <DialogDescription>
            {nmbrTotal.toLocaleString("fr-FR")} × — {nmbrPerDay.toLocaleString("fr-FR")} / jour
          </DialogDescription>
        </DialogHeader>

        {!snapshot ? (
          <p className="text-sm text-muted-foreground">
            Les paramètres de prix n&apos;ont pas été enregistrés pour cette demande (ancienne
            demande antérieure à l&apos;enregistrement automatique).
          </p>
        ) : (
          <div className="space-y-4">
            {/* Parameters at creation */}
            <div className="space-y-2.5">
              <p className="eyebrow">{t("demandes.priceDetailsParamsTitle")}</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
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
            <div className="space-y-2.5">
              <p className="eyebrow">{t("demandes.priceDetailsBreakdownTitle")}</p>
              <div className="rounded-sm border border-border p-3.5">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("demandes.priceTotalLabel")}
                    </span>
                    <span className="num font-medium">{snapshot.breakdown.total_price} $</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("demandes.pricePerDayLabel")}
                    </span>
                    <span className="num flex items-center gap-2">
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
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-success">
                        <TrendingDown className="h-3 w-3" />
                        {t("demandes.priceDetailsDiscount")}
                      </span>
                      <span className="num text-success">
                        −{snapshot.breakdown.per_day_discount} $
                      </span>
                    </div>
                  )}
                  <div className="rule-dashed" />
                  <div className="flex items-baseline justify-between">
                    <span className="font-display font-bold">{t("demandes.priceTotal")}</span>
                    <span className="num font-display text-xl font-extrabold text-primary">
                      {snapshot.breakdown.final_price} $
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {t("demandes.priceDetailsSnapshotNote")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
