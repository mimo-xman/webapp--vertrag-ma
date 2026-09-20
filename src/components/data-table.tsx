"use client";

// Generic data table with search, column sort, pagination and per-page selector.
// Fetches from an API endpoint supporting ?search=&sort=&order=&page=&limit=&status=
// plus ${prefix}_from/${prefix}_to date-range params for each declared date filter.
// Displays rows via a render function per column definition.
//
// Admin extras (opt-in props):
//   - columnToggle: a "Colonnes" dropdown letting the admin show/hide columns
//     (columns flagged defaultHidden start unchecked, e.g. creation/modification
//     dates; actions columns are always visible).
//   - storageKey: persists the user's choices per page (page size, status
//     filter, visible columns) in localStorage - for both User and Admin pages.
//   - dateFilters: inclusive date-range filters rendered with the SAME custom
//     popup date picker as /register (max date = today).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-utils";
import { useI18n } from "@/components/language-provider";
import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
  /** Column-visibility: unchecked by default (admin tables only). */
  defaultHidden?: boolean;
  /** Never hideable (actions column). */
  alwaysVisible?: boolean;
}

export interface DataTableDateFilter {
  /** Query param prefix - sends `${prefix}_from` and `${prefix}_to`. */
  prefix: string;
  /** Display label above the two pickers. */
  label: string;
}

interface StoredPrefs {
  limit?: number;
  status?: string;
  hidden?: string[];
}

function loadPrefs(storageKey?: string): StoredPrefs {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(`vt-table:${storageKey}`) || "{}") as StoredPrefs;
  } catch {
    return {};
  }
}

function savePrefs(storageKey: string | undefined, prefs: StoredPrefs): void {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`vt-table:${storageKey}`, JSON.stringify(prefs));
  } catch {
    /* quota / private mode - silently ignored */
  }
}

// Filters may target future dates (e.g. postulations scheduled ahead),
// so their picker range is deliberately wider than the register birth date.
const FILTER_MAX_DATE = new Date(2099, 11, 31);

interface DataTableProps<T extends { _id: string }> {
  endpoint: string;
  columns: DataTableColumn<T>[];
  extraParams?: Record<string, string | undefined>;
  statusFilter?: {
    key: string;
    options: { value: string; label: string }[];
    label: string;
  };
  /** Date-range filters (custom popup picker, max = today). */
  dateFilters?: DataTableDateFilter[];
  /** Admin only: show/hide columns dropdown. */
  columnToggle?: boolean;
  /** Per-page persistence key (page size, status filter, visible columns). */
  storageKey?: string;
  emptyMessage?: string;
  refreshKey?: number;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { _id: string }>({
  endpoint,
  columns,
  extraParams,
  statusFilter,
  dateFilters = [],
  columnToggle = false,
  storageKey,
  emptyMessage,
  refreshKey = 0,
  onRowClick,
}: DataTableProps<T>) {
  const { t } = useI18n();

  // ── Persisted preferences (per page) ─────────────────────────────────
  const initialPrefs = useMemo(() => loadPrefs(storageKey), [storageKey]);

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<string>("");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<string>(initialPrefs.status || "all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(initialPrefs.limit && [5, 10, 20, 50, 100].includes(initialPrefs.limit) ? initialPrefs.limit : 10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // ── Column visibility (admin) ────────────────────────────────────────
  const toggleableColumns = useMemo(
    () => columns.filter((c) => columnToggle && !c.alwaysVisible),
    [columns, columnToggle]
  );
  const [hidden, setHidden] = useState<string[]>(() => {
    const stored = initialPrefs.hidden;
    if (stored && Array.isArray(stored)) {
      // Only keys that still exist in this version of the table.
      const valid = new Set(toggleableColumns.map((c) => c.key));
      return stored.filter((k) => valid.has(k));
    }
    return toggleableColumns.filter((c) => c.defaultHidden).map((c) => c.key);
  });

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.includes(c.key) || c.alwaysVisible),
    [columns, hidden]
  );

  const persist = useCallback(
    (patch: Partial<StoredPrefs>) => {
      if (!storageKey) return;
      const current = loadPrefs(storageKey);
      savePrefs(storageKey, { ...current, ...patch });
    },
    [storageKey]
  );

  // ── Date-range filters (custom popup picker) ─────────────────────────
  const [dateValues, setDateValues] = useState<Record<string, { from: string; to: string }>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sort) {
      params.set("sort", sort);
      params.set("order", order);
    }
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (statusFilter && status !== "all") params.set(statusFilter.key, status);
    for (const df of dateFilters) {
      const v = dateValues[df.prefix];
      if (v?.from) params.set(`${df.prefix}_from`, v.from);
      if (v?.to) params.set(`${df.prefix}_to`, v.to);
    }
    for (const [key, value] of Object.entries(extraParams || {})) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
    return params.toString();
  }, [debouncedSearch, sort, order, page, limit, status, statusFilter, extraParams, dateFilters, dateValues]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        data: T[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`${endpoint}?${queryString}`);
      setRows(data.data);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorFallback"));
    } finally {
      setLoading(false);
    }
  }, [endpoint, queryString, refreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSort = (key: string) => {
    if (sort === key) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  };

  const setDatePart = (prefix: string, part: "from" | "to", value: string) => {
    setDateValues((prev) => ({
      ...prev,
      [prefix]: { from: prev[prefix]?.from || "", to: prev[prefix]?.to || "", [part]: value },
    }));
    setPage(1);
  };

  const clearDateFilter = (prefix: string) => {
    setDateValues((prev) => {
      const next = { ...prev };
      delete next[prefix];
      return next;
    });
    setPage(1);
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="bg-card pl-8"
          />
        </div>
        {statusFilter && (
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
              persist({ status: v });
            }}
          >
            <SelectTrigger className="w-full bg-card sm:w-44">
              <SelectValue placeholder={statusFilter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {statusFilter.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date-range filters : the same custom popup picker as /register */}
        {dateFilters.map((df) => {
          const value = dateValues[df.prefix] || { from: "", to: "" };
          const active = Boolean(value.from || value.to);
          return (
            <div
              key={df.prefix}
              className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1"
            >
              <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
                {df.label}
              </span>
              <DatePicker
                compact
                value={value.from}
                onChange={(v) => setDatePart(df.prefix, "from", v)}
                placeholder={t("common.dateFrom")}
                maxDate={FILTER_MAX_DATE}
                className="h-7 w-[9.5rem] px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <DatePicker
                compact
                value={value.to}
                onChange={(v) => setDatePart(df.prefix, "to", v)}
                placeholder={t("common.dateTo")}
                maxDate={FILTER_MAX_DATE}
                className="h-7 w-[9.5rem] px-2 text-xs"
              />
              {active && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => clearDateFilter(df.prefix)}
                  title={t("common.clearFilter")}
                >
                  ✕
                </Button>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-2">
          {/* Column visibility (admin tables) */}
          {columnToggle && toggleableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-card">
                  <Columns3 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("common.columns")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {toggleableColumns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={!hidden.includes(col.key)}
                    onCheckedChange={(checked) => {
                      setHidden((prev) =>
                        checked
                          ? prev.filter((k) => k !== col.key)
                          : [...prev, col.key]
                      );
                      persist({
                        hidden: checked
                          ? hidden.filter((k) => k !== col.key)
                          : [...hidden, col.key],
                      });
                    }}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    {col.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Select
            value={String(limit)}
            onValueChange={(v) => {
              const n = Number(v);
              setLimit(n);
              setPage(1);
              persist({ limit: n });
            }}
          >
            <SelectTrigger className="w-full bg-card sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / {t("common.page").toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="form-sheet overflow-hidden">
        <div className="overflow-x-auto scroll-slim">
          <Table>
            <TableHeader>
              <TableRow className="bg-paper hover:bg-paper">
                {visibleColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn("text-muted-foreground", col.sortable && "cursor-pointer select-none", col.className)}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable &&
                        (sort === col.key ? (
                          order === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        ))}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="py-10 text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="py-10 text-center text-muted-foreground">
                    {emptyMessage || t("common.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={row._id}
                    className={cn(onRowClick && "cursor-pointer")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key} className={col.className}>
                        {col.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-2 items-center justify-between border-t border-border bg-paper px-4 py-2.5 sm:flex-row">
          <p className="text-xs text-muted-foreground font-mono">
            {from}–{to} {t("common.of")} {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs font-mono text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
