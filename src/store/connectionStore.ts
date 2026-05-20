import { create } from "zustand";
import type { Connection, QueryResult } from "../lib/commands";

const WORKSPACE_HISTORY_KEY = "feathersql_workspace_history";
const MAX_HISTORY_COUNT = 20; // 最多保存20个历史记录

export interface WorkspaceHistory {
  id: string;
  name: string;
  connectionId: string | null;
  database: string | null;
  table: string | null;
  sql: string | null;
  savedAt: string; // ISO 8601 format
}

interface WorkspaceState {
  connectionId: string | null;
  database: string | null;
  table: string | null;
  sql: string | null;
}

// 排序配置
export interface SortConfigItem {
  column: string;
  direction: 'asc' | 'desc';
}

// 标签页状态
export interface TabState {
  id: string;
  name: string;
  connectionId: string | null;
  database: string | null;
  sql: string;
  queryResult: QueryResult | null;
  error: string | null;
  isQuerying: boolean;
  selectedTable: string | null;
  columnFilters: Record<string, string>;
  columnFilterModes?: Record<string, 'fuzzy' | 'exact'>; // 列过滤模式：模糊/精确
  sortConfig: SortConfigItem[]; // 列排序配置，持久化到 tab 以在加载时恢复
  sqlToLoad: string | null;
  actualExecutedSql: string | null; // 实际执行的 SQL（包含筛选条件）
  originalSqlForFilter: string | null; // 用户原始执行的 SQL，用于筛选时作为 base（筛选不修改此值）
  isFilterResult?: boolean; // 当前 tab.sql 是否来自筛选（用于 useColumnFilters 判断是否更新 originalSqlRef）
  editMode?: boolean; // 结果表编辑模式（按标签页）
  showTableBrowser?: boolean; // 主区域显示表列表（选库浏览）；新查询标签页为 false
}

export interface ConnectionState {
  connections: Connection[];
  // 标签页相关
  tabs: TabState[];
  currentTabId: string | null;

  setConnections: (connections: Connection[]) => void;
  setCurrentConnection: (id: string | null) => void;
  setCurrentDatabase: (database: string | null) => void;
  // 标签页操作
  createTab: (name?: string) => string;
  closeTab: (tabId: string) => void;
  setCurrentTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<TabState>) => void;
  getCurrentTab: () => TabState | null;
  // 向后兼容的方法（操作当前标签页）
  setSelectedTable: (
    table: string | null,
    options?: { preparingQuery?: boolean }
  ) => void;
  setQueryResult: (result: QueryResult | null) => void;
  setError: (error: string | null) => void;
  loadSql: (sql: string) => void;
  clearSqlToLoad: () => void;
  setSavedSql: (sql: string | null) => void;
  setIsQuerying: (isQuerying: boolean) => void;
  setColumnFilters: (filters: Record<string, string>) => void;
  // 全局方法
  setEditMode: (editMode: boolean) => void;
  saveWorkspaceState: () => void;
  restoreWorkspaceState: () => WorkspaceState | null;
  saveWorkspaceHistory: (name?: string) => string | null;
  getWorkspaceHistory: () => WorkspaceHistory[];
  restoreWorkspaceHistory: (id: string) => WorkspaceHistory | null;
  deleteWorkspaceHistory: (id: string) => void;
  clearWorkspaceHistory: () => void;
}

function buildTabName(
  table: string,
  connectionId: string | null,
  database: string | null,
  connections: Connection[]
): string {
  if (!connectionId) {
    return table;
  }
  const connection = connections.find((c) => c.id === connectionId);
  if (!connection) {
    return table;
  }
  const parts: string[] = [];
  if (database && database !== "") {
    parts.push(database);
  } else if (connection.type === "sqlite") {
    parts.push("SQLite");
  }
  parts.push(table);
  return parts.join(".");
}

// 创建默认标签页
const createDefaultTab = (
  name: string = "新查询",
  inheritFrom?: TabState | null
): TabState => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name,
  connectionId: inheritFrom?.connectionId ?? null,
  database: inheritFrom?.database ?? null,
  sql: "",
  queryResult: null,
  error: null,
  isQuerying: false,
  selectedTable: null,
  columnFilters: {},
  sortConfig: [],
  sqlToLoad: null,
  actualExecutedSql: null,
  originalSqlForFilter: null,
  editMode: false,
  showTableBrowser: false,
});

export const useConnectionStore = create<ConnectionState>((set, get) => {
  // 初始化时创建一个默认标签页
  const initialTab = createDefaultTab();
  
  return {
    connections: [],
    tabs: [initialTab],
    currentTabId: initialTab.id,

  setConnections: (connections) => {
    set({ connections });
    // No auto-save on connections load
  },
  setCurrentConnection: (id) => {
    const currentTab = get().getCurrentTab();
    if (!currentTab) {
      return;
    }
    get().updateTab(currentTab.id, {
      connectionId: id,
      database: null,
      selectedTable: null,
      showTableBrowser: false,
    });
  },
  setCurrentDatabase: (database) => {
    const currentTab = get().getCurrentTab();
    if (!currentTab) {
      return;
    }
    get().updateTab(currentTab.id, {
      database,
      selectedTable: null,
      queryResult: null,
      error: null,
      editMode: false,
      showTableBrowser: database !== null,
    });
  },
  // 标签页操作方法
  createTab: (name) => {
    const currentTab = get().getCurrentTab();
    const newTab = createDefaultTab(name, currentTab);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      currentTabId: newTab.id,
    }));
    return newTab.id;
  },
  closeTab: (tabId) => {
    set((state) => {
      const tabs = state.tabs.filter(tab => tab.id !== tabId);
      if (tabs.length === 0) {
        // 如果关闭了所有标签页，创建一个新的
        const newTab = createDefaultTab();
        return { tabs: [newTab], currentTabId: newTab.id };
      }
      // 如果关闭的是当前标签页，切换到其他标签页
      let newCurrentTabId = state.currentTabId;
      if (state.currentTabId === tabId) {
        const currentIndex = state.tabs.findIndex(tab => tab.id === tabId);
        if (currentIndex > 0) {
          newCurrentTabId = tabs[currentIndex - 1].id;
        } else {
          newCurrentTabId = tabs[0].id;
        }
      }
      return { tabs, currentTabId: newCurrentTabId };
    });
  },
  setCurrentTab: (tabId) => {
    set({ currentTabId: tabId });
  },
  updateTab: (tabId, updates) => {
    set((state) => {
      const updatedTabs = state.tabs.map(tab => {
        if (tab.id === tabId) {
          const updatedTab = { ...tab, ...updates };
          // 如果更新了 selectedTable，自动更新标签页名称
          if (updates.selectedTable !== undefined && updates.selectedTable) {
            updatedTab.name = buildTabName(
              updates.selectedTable,
              updatedTab.connectionId,
              updatedTab.database,
              state.connections
            );
          }
          return updatedTab;
        }
        return tab;
      });
      return { tabs: updatedTabs };
    });
  },
  getCurrentTab: () => {
    const state = get();
    if (!state.currentTabId) return null;
    return state.tabs.find(tab => tab.id === state.currentTabId) || null;
  },
  // 向后兼容的方法（操作当前标签页）
  setSelectedTable: (table, options) => {
    const state = get();
    const currentTab = state.getCurrentTab();
    if (!currentTab) {
      return;
    }

    const tabName =
      table && currentTab.connectionId
        ? buildTabName(
            table,
            currentTab.connectionId,
            currentTab.database,
            state.connections
          )
        : table || "新查询";

    if (!table) {
      state.updateTab(currentTab.id, {
        selectedTable: null,
        name: tabName,
        queryResult: null,
        error: null,
        isQuerying: false,
        columnFilters: {},
        sortConfig: [],
        actualExecutedSql: null,
        originalSqlForFilter: null,
        isFilterResult: false,
        sql: "",
        sqlToLoad: null,
        editMode: false,
        showTableBrowser: false,
      });
      return;
    }

    const updates: Partial<TabState> = {
      selectedTable: table,
      name: tabName,
    };

    if (options?.preparingQuery) {
      updates.queryResult = null;
      updates.error = null;
      updates.isQuerying = true;
      updates.columnFilters = {};
      updates.sortConfig = [];
      updates.actualExecutedSql = null;
      updates.originalSqlForFilter = null;
      updates.isFilterResult = false;
      updates.editMode = false;
    }

    state.updateTab(currentTab.id, updates);
  },
  setQueryResult: (result) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { queryResult: result, error: null });
    }
  },
  setError: (error) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { error });
    }
  },
  loadSql: (sql) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { sqlToLoad: sql, sql });
      // Only save when SQL is loaded
      get().saveWorkspaceState();
    }
  },
  clearSqlToLoad: () => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { sqlToLoad: null });
    }
  },
  setSavedSql: (sql) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { sql: sql || "" });
    }
  },
  setIsQuerying: (isQuerying) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { isQuerying });
    }
  },
  setColumnFilters: (filters) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { columnFilters: filters });
    }
  },
  setEditMode: (editMode) => {
    const currentTab = get().getCurrentTab();
    if (currentTab) {
      get().updateTab(currentTab.id, { editMode });
    }
  },
  saveWorkspaceState: () => {
    const state = get();
    const currentTab = state.getCurrentTab();
    const workspaceState: WorkspaceState = {
      connectionId: currentTab?.connectionId ?? null,
      database: currentTab?.database ?? null,
      table: currentTab?.selectedTable || null,
      sql: currentTab?.sql || null,
    };
    try {
      // Generate descriptive name for auto-save
      let historyName = "自动保存";
      if (workspaceState.connectionId) {
        const connection = state.connections.find(c => c.id === workspaceState.connectionId);
        if (connection) {
          const parts: string[] = [connection.name];
          if (workspaceState.database && workspaceState.database !== "") {
            parts.push(workspaceState.database);
          } else if (connection.type === "sqlite") {
            parts.push("SQLite");
          }
          if (workspaceState.table) {
            parts.push(workspaceState.table);
          }
          historyName = parts.join(" → ");
        }
      }
      
      // Save as the latest history (for auto-restore)
      const history: WorkspaceHistory = {
        id: `auto-${Date.now()}`,
        name: historyName,
        connectionId: workspaceState.connectionId,
        database: workspaceState.database,
        table: workspaceState.table,
        sql: workspaceState.sql,
        savedAt: new Date().toISOString(),
      };
      const allHistory = get().getWorkspaceHistory();
      // Keep all auto-save entries (don't remove old ones)
      const manualHistory = allHistory.filter(h => !h.id.startsWith("auto-"));
      const autoHistory = allHistory.filter(h => h.id.startsWith("auto-"));
      
      // Check for duplicates: same connection, database, table, and SQL
      // Normalize SQL for comparison (trim whitespace, handle null/undefined)
      const normalizeSql = (sql: string | null) => {
        if (!sql) return "";
        return sql.trim().replace(/\s+/g, " ");
      };
      
      const normalizedNewSql = normalizeSql(history.sql);
      
      const duplicateIndex = autoHistory.findIndex(h => {
        const normalizedOldSql = normalizeSql(h.sql);
        return h.connectionId === history.connectionId &&
          h.database === history.database &&
          h.table === history.table &&
          normalizedOldSql === normalizedNewSql;
      });
      
      let updatedAutoHistory: WorkspaceHistory[];
      if (duplicateIndex !== -1) {
        // Update existing record's timestamp instead of creating duplicate
        updatedAutoHistory = [...autoHistory];
        updatedAutoHistory[duplicateIndex] = {
          ...updatedAutoHistory[duplicateIndex],
          savedAt: history.savedAt, // Update timestamp
        };
        // Move updated record to the beginning
        const updated = updatedAutoHistory.splice(duplicateIndex, 1)[0];
        updatedAutoHistory.unshift(updated);
      } else {
        // Add new auto-save at the beginning
        updatedAutoHistory = [history, ...autoHistory];
      }
      
      // Add new auto-save at the beginning, keep existing auto-saves, then manual saves
      const updatedHistory = [...updatedAutoHistory, ...manualHistory].slice(0, MAX_HISTORY_COUNT);
      localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Failed to save workspace state:", error);
    }
  },
  restoreWorkspaceState: () => {
    // Get the latest history (auto-save)
    const history = get().getWorkspaceHistory();
    const latest = history.find(h => h.id.startsWith("auto-"));
    if (latest) {
      return {
        connectionId: latest.connectionId,
        database: latest.database,
        table: latest.table,
        sql: latest.sql,
      };
    }
    return null;
  },
  saveWorkspaceHistory: (name?: string) => {
    const state = get();
    const currentTab = state.getCurrentTab();
    if (!currentTab?.connectionId) {
      return null;
    }

    const connection = state.connections.find(
      (c) => c.id === currentTab.connectionId
    );
    if (!connection) {
      return null;
    }

    // Generate name if not provided
    let historyName = name;
    if (!historyName) {
      const parts: string[] = [connection.name];
      if (currentTab.database && currentTab.database !== "") {
        parts.push(currentTab.database);
      } else if (connection.type === "sqlite") {
        parts.push("SQLite");
      }
      if (currentTab.selectedTable) {
        parts.push(currentTab.selectedTable);
      }
      historyName = parts.join(" → ");
    }

    const history: WorkspaceHistory = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: historyName,
      connectionId: currentTab.connectionId,
      database: currentTab.database,
      table: currentTab.selectedTable,
      sql: currentTab.sql,
      savedAt: new Date().toISOString(),
    };

    try {
      const allHistory = get().getWorkspaceHistory();
      // Keep auto-save entries when manually saving (don't remove them)
      const manualHistory = allHistory.filter(h => !h.id.startsWith("auto-"));
      const autoHistory = allHistory.filter(h => h.id.startsWith("auto-"));
      // Add new manual save at the beginning, then auto-saves, then other manual saves
      const updatedHistory = [history, ...autoHistory, ...manualHistory].slice(0, MAX_HISTORY_COUNT);
      localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(updatedHistory));
      return history.id;
    } catch (error) {
      console.error("Failed to save workspace history:", error);
      return null;
    }
  },
  getWorkspaceHistory: () => {
    try {
      const saved = localStorage.getItem(WORKSPACE_HISTORY_KEY);
      if (saved) {
        const history = JSON.parse(saved) as WorkspaceHistory[];
        
        // Normalize SQL for comparison
        const normalizeSql = (sql: string | null) => {
          if (!sql) return "";
          return sql.trim().replace(/\s+/g, " ");
        };
        
        // Deduplicate auto-save entries: keep only the latest one for each unique combination
        const autoHistory = history.filter(h => h.id.startsWith("auto-"));
        const manualHistory = history.filter(h => !h.id.startsWith("auto-"));
        
        // Deduplicate auto-save entries
        const seen = new Map<string, WorkspaceHistory>();
        for (const entry of autoHistory) {
          const key = `${entry.connectionId || ""}|${entry.database || ""}|${entry.table || ""}|${normalizeSql(entry.sql)}`;
          if (!seen.has(key)) {
            seen.set(key, entry);
          } else {
            // Keep the one with the latest timestamp
            const existing = seen.get(key)!;
            if (new Date(entry.savedAt) > new Date(existing.savedAt)) {
              seen.set(key, entry);
            }
          }
        }
        
        const deduplicatedAutoHistory = Array.from(seen.values());
        
        // Combine and sort by savedAt, newest first
        const allHistory = [...deduplicatedAutoHistory, ...manualHistory];
        const sorted = allHistory.sort((a, b) => 
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        );
        
        // Save deduplicated history back to localStorage
        if (sorted.length !== history.length) {
          localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(sorted));
        }
        
        return sorted;
      }
    } catch (error) {
      console.error("Failed to get workspace history:", error);
    }
    return [];
  },
  restoreWorkspaceHistory: (id: string) => {
    const history = get().getWorkspaceHistory();
    return history.find(h => h.id === id) || null;
  },
  deleteWorkspaceHistory: (id: string) => {
    try {
      const allHistory = get().getWorkspaceHistory();
      const updatedHistory = allHistory.filter(h => h.id !== id);
      localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error("Failed to delete workspace history:", error);
    }
  },
  clearWorkspaceHistory: () => {
    try {
      localStorage.removeItem(WORKSPACE_HISTORY_KEY);
    } catch (error) {
      console.error("Failed to clear workspace history:", error);
    }
  },
  };
});

