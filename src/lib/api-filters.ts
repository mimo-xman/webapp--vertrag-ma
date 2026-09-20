// Shared helpers for list endpoints: inclusive date-range filters.
// The DataTable sends YYYY-MM-DD values (from the custom date picker);
// "from" maps to 00:00:00 UTC, "to" to 23:59:59.999 UTC so the whole
// day is covered.

/** Parses a YYYY-MM-DD value into a Date (UTC midnight + endOfDayMs).
 *  Returns null for missing/invalid values (filter simply not applied). */
export function parseDateParam(value: string | null | undefined, endOfDayMs = 0): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() + endOfDayMs);
}

export const END_OF_DAY_MS = 86_399_999;

/** Builds a Mongo date-range condition from a from/to couple.
 *  Returns null when neither bound is present (nothing to filter). */
export function dateRangeCondition(
  fromParam: string | null | undefined,
  toParam: string | null | undefined
): { $gte?: Date; $lte?: Date } | null {
  const from = parseDateParam(fromParam, 0);
  const to = parseDateParam(toParam, END_OF_DAY_MS);
  if (!from && !to) return null;
  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

/** Applies `${prefix}_from` / `${prefix}_to` params as a range on `field`.
 *  Example: applyDateRange(filter, params, "scheduled") → filter.scheduled_at. */
export function applyDateRange(
  filter: Record<string, unknown>,
  params: URLSearchParams,
  prefix: string,
  field: string
): void {
  const condition = dateRangeCondition(params.get(`${prefix}_from`), params.get(`${prefix}_to`));
  if (condition) filter[field] = condition;
}
