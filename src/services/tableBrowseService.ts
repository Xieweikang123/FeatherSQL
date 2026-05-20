import type { Connection } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import {
  buildFilteredAndSortedSql,
  buildTableSelectSql,
  DEFAULT_TABLE_PAGE_SIZE,
} from "../utils/sqlGenerator";
import {
  hasBrowsePreferences,
  loadTableBrowseMemory,
} from "../utils/tableBrowseMemory";
import { runPaginatedTabQuery } from "./tabQueryService";

export interface OpenTableBrowseOptions {
  tabId: string;
  connectionId: string;
  connection: Connection;
  database: string;
  tableName: string;
  saveWorkspace?: boolean;
}

export async function openTableBrowse(
  options: OpenTableBrowseOptions
): Promise<void> {
  const {
    tabId,
    connectionId,
    connection,
    database,
    tableName,
    saveWorkspace = true,
  } = options;

  const store = useConnectionStore.getState();
  const dbParam = connection.type === "sqlite" ? "" : database;
  const memory = loadTableBrowseMemory(connectionId, dbParam, tableName);
  const baseSql = buildTableSelectSql(tableName, connection.type, database);
  const hasPrefs = hasBrowsePreferences(memory);

  store.setSelectedTable(tableName, { preparingQuery: true });

  store.updateTab(tabId, {
    sortConfig: memory?.sortConfig ?? [],
    columnFilters: memory?.columnFilters ?? {},
    columnFilterModes: memory?.columnFilterModes ?? {},
    originalSqlForFilter: baseSql,
    isFilterResult: hasPrefs,
  });

  store.loadSql(baseSql);

  const querySql =
    hasPrefs && memory
      ? buildFilteredAndSortedSql(
          baseSql,
          memory.columnFilters,
          memory.sortConfig,
          connection.type,
          memory.columnFilterModes
        )
      : baseSql;

  await runPaginatedTabQuery({
    tabId,
    baseSql: querySql,
    plainBaseSql: baseSql,
    connectionId,
    database: dbParam,
    mode: hasPrefs ? "filter" : "full",
    page: 1,
    pageSize: memory?.pageSize ?? DEFAULT_TABLE_PAGE_SIZE,
    saveWorkspace,
  });
}
