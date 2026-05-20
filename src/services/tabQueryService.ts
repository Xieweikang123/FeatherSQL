import { executeSql, type QueryResult } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import {
  applyPagination,
  buildCountSql,
  DEFAULT_TABLE_PAGE_SIZE,
} from "../utils/sqlGenerator";

export type TabQueryMode =
  | "full"
  | "filter"
  | "refresh";

export interface RunTabQueryOptions {
  tabId?: string;
  sql: string;
  connectionId?: string | null;
  database?: string | null;
  mode?: TabQueryMode;
  saveWorkspace?: boolean;
}

export interface RunPaginatedTabQueryOptions {
  tabId?: string;
  baseSql: string;
  plainBaseSql?: string;
  connectionId?: string | null;
  database?: string | null;
  mode?: TabQueryMode;
  saveWorkspace?: boolean;
  page?: number;
  pageSize?: number;
}

function resolveDbParam(
  connectionType: string,
  database: string | null | undefined
): string | undefined {
  if (connectionType === "sqlite") {
    return "";
  }
  return database || undefined;
}

function parseCountResult(result: QueryResult): number {
  if (!result.rows.length) {
    return 0;
  }
  const value = result.rows[0][0];
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

/**
 * Unified SQL execution for a tab. All executeSql entry points should use this.
 */
export async function runTabQuery(
  options: RunTabQueryOptions
): Promise<QueryResult | null> {
  const {
    sql: rawSql,
    mode = "full",
    saveWorkspace = mode === "full",
  } = options;

  const sql = rawSql.trim();
  const store = useConnectionStore.getState();
  const tabId = options.tabId ?? store.currentTabId;
  if (!tabId) {
    return null;
  }

  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) {
    return null;
  }

  const connectionId = options.connectionId ?? tab.connectionId;
  if (!connectionId) {
    store.updateTab(tabId, { error: "请先选择一个连接" });
    return null;
  }

  const connection = store.connections.find((c) => c.id === connectionId);
  if (!connection) {
    store.updateTab(tabId, { error: "连接不存在" });
    return null;
  }

  if (!sql) {
    store.updateTab(tabId, { error: "SQL 查询不能为空" });
    return null;
  }

  const database =
    options.database !== undefined ? options.database : tab.database;
  const dbParam = resolveDbParam(connection.type, database);

  if (mode === "full" || mode === "refresh") {
    store.updateTab(tabId, { error: null, isQuerying: true });
  } else {
    store.updateTab(tabId, { error: null });
  }

  const fullMetadata = {
    columnFilters: {} as Record<string, string>,
    actualExecutedSql: sql,
    originalSqlForFilter: sql,
    isFilterResult: false as boolean,
    totalRowCount: null as number | null,
  };

  try {
    const result = await executeSql(connectionId, sql, dbParam);

    if (mode === "full") {
      store.updateTab(tabId, {
        queryResult: result,
        error: null,
        isQuerying: false,
        sql,
        ...fullMetadata,
      });
    } else if (mode === "filter") {
      store.updateTab(tabId, {
        queryResult: result,
        error: null,
        isQuerying: false,
        sql,
        sqlToLoad: sql,
        actualExecutedSql: sql,
        isFilterResult: true,
        totalRowCount: null,
      });
    } else {
      store.updateTab(tabId, {
        queryResult: result,
        error: null,
        isQuerying: false,
      });
    }

    if (saveWorkspace) {
      store.saveWorkspaceState();
    }
    return result;
  } catch (error) {
    const errorMsg = String(error);
    if (mode === "full") {
      store.updateTab(tabId, {
        error: errorMsg,
        isQuerying: false,
        sql,
      });
    } else if (mode === "filter") {
      store.updateTab(tabId, {
        error: errorMsg,
        isQuerying: false,
      });
    } else {
      store.updateTab(tabId, {
        error: errorMsg,
        isQuerying: false,
      });
    }

    if (saveWorkspace && mode === "full") {
      store.saveWorkspaceState();
    }
    return null;
  }
}

/**
 * 表浏览分页查询：COUNT 获取总行数，LIMIT/OFFSET 获取当前页数据。
 */
export async function runPaginatedTabQuery(
  options: RunPaginatedTabQueryOptions
): Promise<QueryResult | null> {
  const {
    baseSql: rawBaseSql,
    plainBaseSql,
    mode = "full",
    saveWorkspace = mode === "full",
    page = 1,
    pageSize = DEFAULT_TABLE_PAGE_SIZE,
  } = options;

  const baseSql = rawBaseSql.trim();
  const store = useConnectionStore.getState();
  const tabId = options.tabId ?? store.currentTabId;
  if (!tabId) {
    return null;
  }

  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) {
    return null;
  }

  const connectionId = options.connectionId ?? tab.connectionId;
  if (!connectionId) {
    store.updateTab(tabId, { error: "请先选择一个连接" });
    return null;
  }

  const connection = store.connections.find((c) => c.id === connectionId);
  if (!connection) {
    store.updateTab(tabId, { error: "连接不存在" });
    return null;
  }

  if (!baseSql) {
    store.updateTab(tabId, { error: "SQL 查询不能为空" });
    return null;
  }

  const database =
    options.database !== undefined ? options.database : tab.database;
  const dbParam = resolveDbParam(connection.type, database);
  const offset = Math.max(0, (page - 1) * pageSize);

  const paginatedSql = applyPagination(baseSql, connection.type, {
    limit: pageSize,
    offset,
  });

  let countSql: string;
  try {
    countSql = buildCountSql(baseSql, connection.type);
  } catch {
    store.updateTab(tabId, { error: "无法构建 COUNT 查询" });
    return null;
  }

  if (mode === "full") {
    store.updateTab(tabId, { error: null, isQuerying: true });
  } else {
    // filter / refresh（翻页）：不设置 isQuerying，避免 ResultTable 卸载导致页码重置
    store.updateTab(tabId, { error: null });
  }

  const fullMetadata = {
    actualExecutedSql: paginatedSql,
    originalSqlForFilter: plainBaseSql ?? tab.originalSqlForFilter ?? baseSql,
    isFilterResult: false as boolean,
  };

  try {
    const [countResult, dataResult] = await Promise.all([
      executeSql(connectionId, countSql, dbParam),
      executeSql(connectionId, paginatedSql, dbParam),
    ]);

    const totalRowCount = parseCountResult(countResult);

    if (mode === "full") {
      store.updateTab(tabId, {
        queryResult: dataResult,
        error: null,
        isQuerying: false,
        sql: plainBaseSql ?? baseSql,
        totalRowCount,
        ...fullMetadata,
      });
    } else if (mode === "filter") {
      store.updateTab(tabId, {
        queryResult: dataResult,
        error: null,
        isQuerying: false,
        sql: plainBaseSql ?? tab.sql ?? baseSql,
        actualExecutedSql: paginatedSql,
        originalSqlForFilter: plainBaseSql ?? tab.originalSqlForFilter ?? baseSql,
        isFilterResult: true,
        totalRowCount,
      });
    } else {
      store.updateTab(tabId, {
        queryResult: dataResult,
        error: null,
        isQuerying: false,
        actualExecutedSql: paginatedSql,
        totalRowCount,
      });
    }

    if (saveWorkspace) {
      store.saveWorkspaceState();
    }
    return dataResult;
  } catch (error) {
    const errorMsg = String(error);
    store.updateTab(tabId, {
      error: errorMsg,
      isQuerying: false,
    });

    if (saveWorkspace && mode === "full") {
      store.saveWorkspaceState();
    }
    return null;
  }
}
