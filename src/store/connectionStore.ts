import { create } from "zustand";
import type { Connection, QueryResult } from "../lib/commands";

interface ConnectionState {
  connections: Connection[];
  currentConnectionId: string | null;
  queryResult: QueryResult | null;
  error: string | null;
  logs: string[];
  
  setConnections: (connections: Connection[]) => void;
  setCurrentConnection: (id: string | null) => void;
  setQueryResult: (result: QueryResult | null) => void;
  setError: (error: string | null) => void;
  addLog: (message: string) => void;
  clearLogs: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  currentConnectionId: null,
  queryResult: null,
  error: null,
  logs: [],

  setConnections: (connections) => set({ connections }),
  setCurrentConnection: (id) => set({ currentConnectionId: id }),
  setQueryResult: (result) => set({ queryResult: result, error: null }),
  setError: (error) => set({ error, queryResult: null }),
  addLog: (message) =>
    set((state) => ({
      logs: [...state.logs, `${new Date().toLocaleTimeString()}: ${message}`],
    })),
  clearLogs: () => set({ logs: [] }),
}));

