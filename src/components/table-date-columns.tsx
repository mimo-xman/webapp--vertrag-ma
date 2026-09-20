import type { DataTableColumn } from "@/components/data-table";

// Shared creation/modification date columns for the admin tables.
//
// Every admin DataTable exposes both dates through the "Colonnes" dropdown:
//   - createdAt : visible by default only where it was already a column
//   - updatedAt : always unchecked by default (on-demand)
// Sorting maps 1:1 to the mongoose timestamps fields of the same names.

export interface DatedRow {
  createdAt: string;
  updatedAt: string;
}

/** "13/02/2026" - day precision, table-friendly. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** "13 févr. 2026, 14:05" - day + time (audit-style columns). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Creation + modification date columns for an admin table.
 * @param t        i18n translate function of the page
 * @param options  createdVisible: keep "Créé le" checked by default
 *                 (pages that historically showed it inline); updatedAt is
 *                 always unchecked by default.
 */
export function dateColumns<T extends DatedRow>(
  t: (key: string) => string,
  options: { createdVisible?: boolean } = {}
): DataTableColumn<T>[] {
  return [
    {
      key: "createdAt",
      header: t("common.createdAt"),
      sortable: true,
      defaultHidden: !options.createdVisible,
      render: (row) => <span className="aktenzeichen">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "updatedAt",
      header: t("common.updatedAt"),
      sortable: true,
      defaultHidden: true,
      render: (row) => <span className="aktenzeichen">{formatDate(row.updatedAt)}</span>,
    },
  ];
}
