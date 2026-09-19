// Pricing engine — shared by the dynamic options endpoint, demandes creation,
// and admin settings. Mirrors the specification:
//   - price of 100 posts total (default 1$) + price of 100 posts/day (default 1$)
//   - minimum 100 total / 100 per day
//   - steps: total +500 each time, per day +100 each time
//   - max = number of existing companies in the selected categories (or all)
//   - the first 300/day are free (shown strikethrough as a discount)

export interface PricingSettings {
  price_of_hundred_total: number;
  price_of_hundred_per_day: number;
  free_per_day_amount: number;
  min_total: number;
  min_per_day: number;
  step_total: number;
  step_per_day: number;
}

export const DEFAULT_PRICING: PricingSettings = {
  price_of_hundred_total: 1,
  price_of_hundred_per_day: 1,
  free_per_day_amount: 300,
  min_total: 100,
  min_per_day: 100,
  step_total: 500,
  step_per_day: 100,
};

// Options for "nmbr Total des posts souhaité": 100, 600, 1100, 1600...
// stops before exceeding the total available companies.
// If fewer than the minimum are available → no options (no demande possible).
export function buildTotalOptions(companiesCount: number, s: PricingSettings): number[] {
  if (companiesCount < s.min_total) return [];
  const options: number[] = [];
  let value = s.min_total;
  while (value <= companiesCount) {
    options.push(value);
    value += s.step_total;
  }
  return options;
}

// Options for "nmbr posts per day": 300, 400, 500, ...
// capped by nmbrTotal (cannot send more per day than the total).
// If the total is below the minimum → no options.
export function buildPerDayOptions(nmbrTotal: number, s: PricingSettings): number[] {
  if (nmbrTotal < s.min_per_day) return [];
  const options: number[] = [];
  let value = s.min_per_day;
  while (value <= nmbrTotal) {
    options.push(value);
    value += s.step_per_day;
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
  const total_price = Math.ceil(nmbrTotal / 100) * s.price_of_hundred_total;
  const per_day_price = Math.ceil(nmbrPerDay / 100) * s.price_of_hundred_per_day;
  const discountUnits = Math.ceil(s.free_per_day_amount / 100);
  const per_day_discount = Math.min(per_day_price, discountUnits * s.price_of_hundred_per_day);
  const per_day_price_after_discount = Math.max(0, per_day_price - per_day_discount);
  const final_price = total_price + per_day_price_after_discount;

  return {
    total_price,
    per_day_price,
    per_day_discount,
    per_day_price_after_discount,
    final_price,
    free_amount_display: `${s.free_per_day_amount}/jour gratuits`,
  };
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
  if (nmbrTotal < s.min_total) return `Le minimum pour le total est ${s.min_total}.`;
  if (nmbrPerDay < s.min_per_day) return `Le minimum par jour est ${s.min_per_day}.`;
  if (nmbrPerDay > nmbrTotal) return "Le nombre par jour ne peut pas dépasser le total.";
  if (nmbrTotal > companiesAvailable) {
    return `Seulement ${companiesAvailable} entreprises sont disponibles (moins que les ${nmbrTotal} demandées).`;
  }
  return null;
}
