// Pricing engine v2 — shared by the dynamic options endpoint, demandes
// creation, admin settings, and the public home page.
//
// Model: each pricing axis (TOTAL postulations, POSTULATIONS PER DAY) is
// configured independently with:
//   - step        : the increment of the dropdown options (e.g. 500 → 100, 600, 1100…)
//   - step_price  : the price of ONE step in $ (e.g. 5 $ per 500 posts)
//   - min         : minimum selectable quantity
//   - max         : maximum selectable quantity (admin ceiling, on top of
//                   the real availability — the number of eligible companies)
//   - free_amount : the first N units are free (discount shown strikethrough)
//
// Price formula per axis — exact pro-rata of the step, so every selectable
// dropdown option keeps the legacy v1 unit rate after migration:
//   billable  = max(0, quantity - free_amount)
//   price     = round2(billable / step * step_price)
//   discount  = full_price - price   (full price = quantity / step * step_price)
// Examples with step 500 @ 5 $:  100 → 1 $ · 600 → 6 $ · 1600 → 16 $.

export interface PricingAxis {
  /** Increment of the dropdown options (e.g. 500). */
  step: number;
  /** Price of ONE step, in $. */
  step_price: number;
  /** Minimum selectable quantity. */
  min: number;
  /** Maximum selectable quantity (admin ceiling; availability still applies). */
  max: number;
  /** The first N units are free. */
  free_amount: number;
}

export interface PricingSettings {
  total: PricingAxis;
  per_day: PricingAxis;
}

export const DEFAULT_PRICING: PricingSettings = {
  total: { step: 500, step_price: 5, min: 100, max: 100000, free_amount: 0 },
  per_day: { step: 100, step_price: 1, min: 100, max: 100000, free_amount: 300 },
};

/** Normalize any partial/untrusted pricing object into a valid PricingSettings. */
export function normalizePricing(raw: unknown): PricingSettings {
  const r = (raw || {}) as {
    total?: Partial<PricingAxis>;
    per_day?: Partial<PricingAxis>;
  };
  const axis = (a: Partial<PricingAxis> | undefined, d: PricingAxis): PricingAxis => ({
    step: numOr(a?.step, d.step, 1),
    step_price: numOr(a?.step_price, d.step_price, 0),
    min: numOr(a?.min, d.min, 0),
    max: numOr(a?.max, d.max, 1),
    free_amount: numOr(a?.free_amount, d.free_amount, 0),
  });
  return {
    total: axis(r.total, DEFAULT_PRICING.total),
    per_day: axis(r.per_day, DEFAULT_PRICING.per_day),
  };
}

function numOr(v: unknown, d: number, min: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : d;
}

// Options for "nmbr Total des posts souhaité": min, min+step, min+2*step…
// capped by the number of available companies AND the admin ceiling.
// If fewer than the minimum are available → no options (no demande possible).
export function buildTotalOptions(companiesCount: number, s: PricingSettings): number[] {
  const cap = Math.min(companiesCount, s.total.max);
  if (cap < s.total.min) return [];
  const options: number[] = [];
  let value = s.total.min;
  while (value <= cap) {
    options.push(value);
    value += s.total.step;
  }
  return options;
}

// Options for "nmbr posts per day": min, min+step…
// capped by nmbrTotal (cannot send more per day than the total) AND the
// admin ceiling. If the total is below the minimum → no options.
export function buildPerDayOptions(nmbrTotal: number, s: PricingSettings): number[] {
  const cap = Math.min(nmbrTotal, s.per_day.max);
  if (cap < s.per_day.min) return [];
  const options: number[] = [];
  let value = s.per_day.min;
  while (value <= cap) {
    options.push(value);
    value += s.per_day.step;
  }
  return options;
}

export interface PriceBreakdown {
  total_price: number;
  per_day_price: number;
  per_day_discount: number;
  per_day_price_after_discount: number;
  final_price: number;
  free_amount_display: string;
}

export function computePrice(
  nmbrTotal: number,
  nmbrPerDay: number,
  s: PricingSettings
): PriceBreakdown {
  // Total axis — free units deducted, pro-rata of the step price.
  const total_price = axisPrice(nmbrTotal, s.total);

  // Per-day axis — full price (before the free deduction) is shown
  // strikethrough in the UI, the billable price after it.
  const per_day_full =
    nmbrPerDay > 0 ? round2((nmbrPerDay / s.per_day.step) * s.per_day.step_price) : 0;
  const per_day_price = axisPrice(nmbrPerDay, s.per_day);
  const per_day_discount = Math.max(0, round2(per_day_full - per_day_price));
  const per_day_price_after_discount = per_day_price;

  const final_price = round2(total_price + per_day_price);

  return {
    total_price: round2(total_price),
    per_day_price: round2(per_day_full),
    per_day_discount,
    per_day_price_after_discount: round2(per_day_price_after_discount),
    final_price,
    free_amount_display:
      s.per_day.free_amount > 0
        ? `${s.per_day.free_amount}/jour gratuits`
        : s.total.free_amount > 0
          ? `${s.total.free_amount} premiers gratuits`
          : "",
  };
}

/** Billable price of one axis: free units deducted, then exact pro-rata
 *  of the step price (monetary rounding to 2 decimals). */
function axisPrice(quantity: number, axis: PricingAxis): number {
  if (quantity <= 0) return 0;
  const billable = Math.max(0, quantity - axis.free_amount);
  if (billable <= 0) return 0;
  return round2((billable / axis.step) * axis.step_price);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function validateDemandeInput(
  nmbrTotal: number,
  nmbrPerDay: number,
  companiesAvailable: number,
  s: PricingSettings
): string | null {
  if (!Number.isInteger(nmbrTotal) || !Number.isInteger(nmbrPerDay)) {
    return "Les nombres doivent être des entiers.";
  }
  if (nmbrTotal < s.total.min) return `Le minimum pour le total est ${s.total.min}.`;
  if (nmbrTotal > s.total.max) return `Le maximum pour le total est ${s.total.max}.`;
  if (nmbrPerDay < s.per_day.min) return `Le minimum par jour est ${s.per_day.min}.`;
  if (nmbrPerDay > s.per_day.max) return `Le maximum par jour est ${s.per_day.max}.`;
  if (nmbrPerDay > nmbrTotal) return "Le nombre par jour ne peut pas dépasser le total.";
  if (nmbrTotal > companiesAvailable) {
    return `Seulement ${companiesAvailable} entreprises sont disponibles (moins que les ${nmbrTotal} demandées).`;
  }
  return null;
}
