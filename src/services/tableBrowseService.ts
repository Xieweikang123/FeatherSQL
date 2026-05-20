import type { Connection } from "../lib/commands";
import {
  isTableBrowserTab,
  useConnectionStore,
} from "../store/connectionStore";
import {
  buildFilteredAndSortedSql,
  buildTableSelectSql,
  DEFAULT_TABLE_PAGE_SIZE,
} from "../utils/sqlGenerator";
import {
  hasBrowsePreferences,
  loadTableBrowseMemory,
} from "../utils/tableBrowseMemory";
import { runPaginatedTabQuery, runTabQuery } from "./tabQueryService";

export interface OpenTableBrowseOptions {
  tabId: string;
  connectionId: string;
  connection: Connection;
  database: string;
  tableName: string;
  saveWorkspace?: boolean;
}

export interface OpenTableFromSidebarOptions {
  connectionId: string;
  connection: Connection;
  database: string;
  tableName: string;
  /** Ctrl/⌘ + 点击时强制新标签页 */
  forceNewTab?: boolean;
  saveWorkspace?: boolean;
}

function normalizeDatabase(connection: Connection, database: string): string {
  return connection.type === "sqlite" ? "" : database;
}

function findExistingTableTab(
  tableName: string,
  connectionId: string,
  dbParam: string
): string | null {
  const store = useConnectionStore.getState();
  const existing = store.tabs.find(
    (t) =>
      !isTableBrowserTab(t.id) &&
      t.selectedTable === tableName &&
      t.connectionId === connectionId &&
      (t.database ?? "") === dbParam
  );
  return existing?.id ?? null;
}

function resolveTabIdForTableOpen(
  tableName: string,
  connectionId: string,
  connection: Connection,
  database: string,
  forceNewTab: boolean
): string {
  const store = useConnectionStore.getState();
  const dbParam = normalizeDatabase(connection, database);

  if (!forceNewTab) {
    const existingId = findExistingTableTab(tableName, connectionId, dbParam);
    if (existingId) {
      return existingId;
    }
  }

  const current = store.getCurrentTab();
  const canReuseEmptyTab =
    !forceNewTab &&
    current &&
    !isTableBrowserTab(current.id) &&
    !current.selectedTable &&
    !current.queryResult &&
    !(current.sql?.trim());

  if (canReuseEmptyTab) {
    return current.id;
  }

  return store.createTab();
}

function resolveTabIdForSqlRestore(
  connectionId: string,
  connection: Connection,
  database: string
): string {
  const store = useConnectionStore.getState();
  const dbParam = normalizeDatabase(connection, database);
  const emptyTab = store.tabs.find(
    (t) =>
      !isTableBrowserTab(t.id) &&
      !t.selectedTable &&
      !(t.sql?.trim()) &&
      !t.queryResult
  );
  if (emptyTab) {
    return emptyTab.id;
  }

  const tabId = store.createTab();
  store.updateTab(tabId, {
    connectionId,
    database: dbParam,
    showTableBrowser: false,
    selectedTable: null,
  });
  return tabId;
}

/**
 * 从历史/工作区恢复 SQL 查询：不在固定「表」标签上打开。
 */
export async function openSqlFromWorkspaceRestore(options: {
  connectionId: string;
  connection: Connection;
  database: string;
  sql: string;
  saveWorkspace?: boolean;
}): Promise<void> {
  const {
    connectionId,
    connection,
    database,
    sql,
    saveWorkspace = true,
  } = options;

  const trimmed = sql.trim();
  if (!trimmed) {
    return;
  }

  const store = useConnectionStore.getState();
  const dbParam = normalizeDatabase(connection, database);
  const tabId = resolveTabIdForSqlRestore(connectionId, connection, database);

  store.setCurrentTab(tabId);
  store.updateTab(tabId, {
    connectionId,
    database: dbParam,
    showTableBrowser: false,
    selectedTable: null,
    sql: trimmed,
    sqlToLoad: trimmed,
    queryResult: null,
    error: null,
    isQuerying: false,
  });

  await runTabQuery({
    tabId,
    sql: trimmed,
    connectionId,
    database: dbParam,
    mode: "full",
    saveWorkspace,
  });
}

/**
 * 从侧边栏/表列表打开数据表：支持多标签页，已有同表标签时切换过去，否则新建标签页。
 */
export async function openTableFromSidebar(
  options: OpenTableFromSidebarOptions
): Promise<void> {
  const {
    connectionId,
    connection,
    database,
    tableName,
    forceNewTab = false,
    saveWorkspace = true,
  } = options;

  const store = useConnectionStore.getState();
  const dbParam = normalizeDatabase(connection, database);
  const tabId = resolveTabIdForTableOpen(
    tableName,
    connectionId,
    connection,
    database,
    forceNewTab
  );

  store.setCurrentTab(tabId);
  store.updateTab(tabId, {
    connectionId,
    database: dbParam,
    showTableBrowser: false,
  });

  await openTableBrowse({
    tabId,
    connectionId,
    connection,
    database,
    tableName,
    saveWorkspace,
  });
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
  const dbParam = normalizeDatabase(connection, database);
  const memory = loadTableBrowseMemory(connectionId, dbParam, tableName);
  const baseSql = buildTableSelectSql(tableName, connection.type, database);
  const hasPrefs = hasBrowsePreferences(memory);

  store.setCurrentTab(tabId);

  store.updateTab(tabId, {
    selectedTable: tableName,
    showTableBrowser: false,
    sortConfig: memory?.sortConfig ?? [],
    columnFilters: memory?.columnFilters ?? {},
    columnFilterModes: memory?.columnFilterModes ?? {},
    originalSqlForFilter: baseSql,
    isFilterResult: hasPrefs,
    sql: baseSql,
    sqlToLoad: baseSql,
    queryResult: null,
    error: null,
    isQuerying: true,
    actualExecutedSql: null,
    totalRowCount: null,
    editMode: false,
  });

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
