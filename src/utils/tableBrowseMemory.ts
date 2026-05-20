import type { SortConfigItem } from "../store/connectionStore";
import { DEFAULT_TABLE_PAGE_SIZE } from "./sqlGenerator";

export interface TableBrowseMemory {
  sortConfig: SortConfigItem[];
  columnFilters: Record<string, string>;
  columnFilterModes?: Record<string, "fuzzy" | "exact">;
  pageSize?: number;
}

const STORAGE_KEY = "feathersql_table_browse_memory";

function makeKey(
  connectionId: string,
  database: string | null | undefined,
  table: string
): string {
  return `${connectionId}\0${database ?? ""}\0${table}`;
}

function readAll(): Record<string, TableBrowseMemory> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, TableBrowseMemory>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, TableBrowseMemory>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save table browse memory:", error);
  }
}

export function loadTableBrowseMemory(
  connectionId: string,
  database: string | null | undefined,
  table: string
): TableBrowseMemory | null {
  const entry = readAll()[makeKey(connectionId, database, table)];
  if (!entry) {
    return null;
  }
  return {
    sortConfig: Array.isArray(entry.sortConfig) ? entry.sortConfig : [],
    columnFilters:
      entry.columnFilters && typeof entry.columnFilters === "object"
        ? entry.columnFilters
        : {},
    columnFilterModes: entry.columnFilterModes,
    pageSize: entry.pageSize,
  };
}

export function saveTableBrowseMemory(
  connectionId: string,
  database: string | null | undefined,
  table: string,
  memory: Partial<TableBrowseMemory>
): void {
  const key = makeKey(connectionId, database, table);
  const all = readAll();
  const existing = all[key] ?? {
    sortConfig: [],
    columnFilters: {},
  };

  all[key] = {
    sortConfig: memory.sortConfig ?? existing.sortConfig,
    columnFilters: memory.columnFilters ?? existing.columnFilters,
    columnFilterModes: memory.columnFilterModes ?? existing.columnFilterModes,
    pageSize: memory.pageSize ?? existing.pageSize,
  };

  writeAll(all);
}

export function hasBrowsePreferences(memory: TableBrowseMemory | null): boolean {
  if (!memory) {
    return false;
  }

  const hasSort = memory.sortConfig.length > 0;
  const hasFilters = Object.values(memory.columnFilters).some(
    (value) => value.trim() !== ""
  );
  const hasCustomPageSize =
    memory.pageSize != null && memory.pageSize !== DEFAULT_TABLE_PAGE_SIZE;

  return hasSort || hasFilters || hasCustomPageSize;
}
