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
  saveWorkspaceState: () => void;
  restoreWorkspaceState: () => WorkspaceState | null;
  saveWorkspaceHistory: (name?: string) => string | null;
  getWorkspaceHistory: () => WorkspaceHistory[];
  restoreWorkspaceHistory: (id: string) => WorkspaceHistory | null;
  deleteWorkspaceHistory: (id: string) => void;
  clearWorkspaceHistory: () => void;
}

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

  setConnections: (connections) => {
    set({ connections });
    // Auto-save after connections are loaded
    setTimeout(() => get().saveWorkspaceState(), 100);
  },
  setCurrentConnection: (id) => {
    set({ currentConnectionId: id });
    get().saveWorkspaceState();
  },
  setCurrentDatabase: (database) => {
    set({ currentDatabase: database, selectedTable: null });
    get().saveWorkspaceState();
  },
  setSelectedTable: (table) => {
    set({ selectedTable: table });
    get().saveWorkspaceState();
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
    get().saveWorkspaceState();
  },
  clearSqlToLoad: () => set({ sqlToLoad: null }),
  setSavedSql: (sql) => {
    set({ savedSql: sql });
    get().saveWorkspaceState();
  },
  setIsQuerying: (isQuerying) => set({ isQuerying }),
  saveWorkspaceState: () => {
    const state = get();
    const workspaceState: WorkspaceState = {
      connectionId: state.currentConnectionId,
      database: state.currentDatabase,
      table: state.selectedTable,
      sql: state.savedSql,
    };
    try {
      // Save as the latest history (for auto-restore)
      const history: WorkspaceHistory = {
        id: `auto-${Date.now()}`,
        name: "自动保存",
        connectionId: workspaceState.connectionId,
        database: workspaceState.database,
        table: workspaceState.table,
        sql: workspaceState.sql,
        savedAt: new Date().toISOString(),
      };
      const allHistory = get().getWorkspaceHistory();
      // Remove old auto-save entries, keep only the latest
      const manualHistory = allHistory.filter(h => !h.id.startsWith("auto-"));
      const updatedHistory = [history, ...manualHistory].slice(0, MAX_HISTORY_COUNT);
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
      // Remove auto-save entries when manually saving
      const manualHistory = allHistory.filter(h => !h.id.startsWith("auto-"));
      const updatedHistory = [history, ...manualHistory].slice(0, MAX_HISTORY_COUNT);
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
        // Sort by savedAt, newest first
        return history.sort((a, b) => 
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        );
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

