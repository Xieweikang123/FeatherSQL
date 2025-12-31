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

interface ConnectionState {
  connections: Connection[];
  currentConnectionId: string | null;
  currentDatabase: string | null;
  selectedTable: string | null;
  queryResult: QueryResult | null;
  error: string | null;
  logs: string[];
  sqlToLoad: string | null;
  savedSql: string | null;
  isQuerying: boolean;
  // 方案8：将 columnFilters 提升到 store，避免组件重新挂载导致的状态丢失
  columnFilters: Record<string, string>;
  // 编辑模式状态（持久化）
  editMode: boolean;

  setConnections: (connections: Connection[]) => void;
  setCurrentConnection: (id: string | null) => void;
  setCurrentDatabase: (database: string | null) => void;
  setSelectedTable: (table: string | null) => void;
  setQueryResult: (result: QueryResult | null) => void;
  setError: (error: string | null) => void;
  addLog: (message: string) => void;
  clearLogs: () => void;
  loadSql: (sql: string) => void;
  clearSqlToLoad: () => void;
  setSavedSql: (sql: string | null) => void;
  setIsQuerying: (isQuerying: boolean) => void;
  setColumnFilters: (filters: Record<string, string>) => void;
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

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  currentConnectionId: null,
  currentDatabase: null,
  selectedTable: null,
  queryResult: null,
  error: null,
  logs: [],
  sqlToLoad: null,
  savedSql: null,
  isQuerying: false,
  columnFilters: {}, // 方案8：将 columnFilters 提升到 store
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
    set({ currentDatabase: database, selectedTable: null });
    // No auto-save on database change
  },
  setSelectedTable: (table) => {
    set({ selectedTable: table });
    // No auto-save on table selection
  },
  setQueryResult: (result) => set({ queryResult: result, error: null }),
  setError: (error) => set({ error, queryResult: null }),
  addLog: (message) =>
    set((state) => ({
      logs: [...state.logs, `${new Date().toLocaleTimeString()}: ${message}`],
    })),
  clearLogs: () => set({ logs: [] }),
  loadSql: (sql) => {
    set({ sqlToLoad: sql, savedSql: sql });
    // Only save when SQL is loaded
    get().saveWorkspaceState();
  },
  clearSqlToLoad: () => set({ sqlToLoad: null }),
  setSavedSql: (sql) => {
    set({ savedSql: sql });
    // No auto-save on SQL editor content change (only save when explicitly loaded)
  },
  setIsQuerying: (isQuerying) => set({ isQuerying }),
  setColumnFilters: (filters) => set({ columnFilters: filters }),
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
    const workspaceState: WorkspaceState = {
      connectionId: state.currentConnectionId,
      database: state.currentDatabase,
      table: state.selectedTable,
      sql: state.savedSql,
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

    // Generate name if not provided
    let historyName = name;
    if (!historyName) {
      const parts: string[] = [connection.name];
      if (state.currentDatabase && state.currentDatabase !== "") {
        parts.push(state.currentDatabase);
      } else if (connection.type === "sqlite") {
        parts.push("SQLite");
      }
      if (state.selectedTable) {
        parts.push(state.selectedTable);
      }
      historyName = parts.join(" → ");
    }

    const history: WorkspaceHistory = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: historyName,
      connectionId: state.currentConnectionId,
      database: state.currentDatabase,
      table: state.selectedTable,
      sql: state.savedSql,
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
}));

