import { executeSql, type QueryResult } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";

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

function resolveDbParam(
  connectionType: string,
  database: string | null | undefined
): string | undefined {
  if (connectionType === "sqlite") {
    return "";
  }
  return database || undefined;
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
