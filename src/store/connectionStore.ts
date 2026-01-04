import { create } from "zustand";
import type { Connection, QueryResult } from "../lib/commands";

const WORKSPACE_HISTORY_KEY = "feathersql_workspace_history";
const EDIT_MODE_KEY = "feathersql_edit_mode";
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

// 标签页状态
export interface TabState {
  id: string;
  name: string;
  sql: string;
  queryResult: QueryResult | null;
  error: string | null;
  isQuerying: boolean;
  selectedTable: string | null;
  columnFilters: Record<string, string>;
  sqlToLoad: string | null;
}

interface ConnectionState {
  connections: Connection[];
  currentConnectionId: string | null;
  currentDatabase: string | null;
  // 标签页相关
  tabs: TabState[];
  currentTabId: string | null;
  // 编辑模式状态（持久化）
  editMode: boolean;

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
  setSelectedTable: (table: string | null) => void;
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

// 从 localStorage 加载编辑模式状态
const loadEditMode = (): boolean => {
  try {
    const saved = localStorage.getItem(EDIT_MODE_KEY);
    if (saved !== null) {
      return JSON.parse(saved) as boolean;
    }
  } catch (error) {
    console.error("Failed to load edit mode:", error);
  }
  return false; // 默认关闭
};

// 创建默认标签页
const createDefaultTab = (name: string = "新查询"): TabState => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name,
  sql: "",
  queryResult: null,
  error: null,
  isQuerying: false,
  selectedTable: null,
  columnFilters: {},
  sqlToLoad: null,
});

export const useConnectionStore = create<ConnectionState>((set, get) => {
  // 初始化时创建一个默认标签页
  const initialTab = createDefaultTab();
  
  return {
    connections: [],
    currentConnectionId: null,
    currentDatabase: null,
    tabs: [initialTab],
    currentTabId: initialTab.id,
    editMode: loadEditMode(), // 从 localStorage 加载编辑模式状态

  setConnections: (connections) => {
    set({ connections });
    // No auto-save on connections load
  },
  setCurrentConnection: (id) => {
    set({ currentConnectionId: id });
    // No auto-save on connection change
  },
  setCurrentDatabase: (database) => {
    set((state) => {
      // 更新所有标签页的 selectedTable 为 null（当数据库改变时）
      const updatedTabs = state.tabs.map(tab => ({
        ...tab,
        selectedTable: null,
      }));
      return { currentDatabase: database, tabs: updatedTabs };
    });
    // No auto-save on database change
  },
  // 标签页操作方法
  createTab: (name) => {
    const newTab = createDefaultTab(name);
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
            let tabName = updates.selectedTable;
            if (state.currentConnectionId) {
              const connection = state.connections.find(c => c.id === state.currentConnectionId);
              if (connection) {
                const parts: string[] = [];
                if (state.currentDatabase && state.currentDatabase !== "") {
                  parts.push(state.currentDatabase);
                } else if (connection.type === "sqlite") {
                  parts.push("SQLite");
                }
                parts.push(updates.selectedTable);
                tabName = parts.join(".");
              }
            }
            updatedTab.name = tabName;
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
  setSelectedTable: (table) => {
    const state = get();
    const currentTab = state.getCurrentTab();
    if (currentTab) {
      // 自动更新标签页名称
      let tabName = table || "新查询";
      if (table && state.currentConnectionId) {
        const connection = state.connections.find(c => c.id === state.currentConnectionId);
        if (connection) {
          const parts: string[] = [];
          if (state.currentDatabase && state.currentDatabase !== "") {
            parts.push(state.currentDatabase);
          } else if (connection.type === "sqlite") {
            parts.push("SQLite");
          }
          parts.push(table);
          tabName = parts.join(".");
        }
      }
      state.updateTab(currentTab.id, { selectedTable: table, name: tabName });
    }
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
      get().updateTab(currentTab.id, { error, queryResult: null });
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
  // 全局方法
  setEditMode: (editMode) => {
    set({ editMode });
    // 持久化编辑模式状态到 localStorage
    try {
      localStorage.setItem(EDIT_MODE_KEY, JSON.stringify(editMode));
    } catch (error) {
      console.error("Failed to save edit mode:", error);
    }
  },
  saveWorkspaceState: () => {
    const state = get();
    const currentTab = state.getCurrentTab();
    const workspaceState: WorkspaceState = {
      connectionId: state.currentConnectionId,
      database: state.currentDatabase,
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
    if (!state.currentConnectionId) {
      return null;
    }

    const connection = state.connections.find(c => c.id === state.currentConnectionId);
    if (!connection) {
      return null;
    }

    const currentTab = state.getCurrentTab();
    if (!currentTab) {
      return null;
    }

    // Generate name if not provided
    let historyName = name;
    if (!historyName) {
      const parts: string[] = [connection.name];
      if (state.currentDatabase && state.currentDatabase !== "") {
        parts.push(state.currentDatabase);
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
      connectionId: state.currentConnectionId,
      database: state.currentDatabase,
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

