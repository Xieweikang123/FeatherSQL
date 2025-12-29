import { create } from "zustand";
import type { Connection, QueryResult } from "../lib/commands";

interface ConnectionState {
  connections: Connection[];
  currentConnectionId: string | null;
  currentDatabase: string | null;
  queryResult: QueryResult | null;
  error: string | null;
  logs: string[];
  sqlToLoad: string | null;

  setConnections: (connections: Connection[]) => void;
  setCurrentConnection: (id: string | null) => void;
  setCurrentDatabase: (database: string | null) => void;
  setQueryResult: (result: QueryResult | null) => void;
  setError: (error: string | null) => void;
  addLog: (message: string) => void;
  clearLogs: () => void;
  loadSql: (sql: string) => void;
  clearSqlToLoad: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  currentConnectionId: null,
  currentDatabase: null,
  queryResult: null,
  error: null,
  logs: [],
  sqlToLoad: null,

  setConnections: (connections) => set({ connections }),
  setCurrentConnection: (id) => set({ currentConnectionId: id }),
  setCurrentDatabase: (database) => set({ currentDatabase: database }),
  setQueryResult: (result) => set({ queryResult: result, error: null }),
  setError: (error) => set({ error, queryResult: null }),
  addLog: (message) =>
    set((state) => ({
      logs: [...state.logs, `${new Date().toLocaleTimeString()}: ${message}`],
    })),
  clearLogs: () => set({ logs: [] }),
  loadSql: (sql) => set({ sqlToLoad: sql }),
  clearSqlToLoad: () => set({ sqlToLoad: null }),
}));

