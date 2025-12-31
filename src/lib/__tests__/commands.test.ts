import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  createConnection,
  getConnections,
  updateConnection,
  disconnectConnection,
  deleteConnection,
  testConnection,
  executeSql,
  listDatabases,
  listTables,
  getSqlHistory,
  deleteSqlHistory,
} from "../commands";
import type { Connection, ConnectionConfig, QueryResult, SqlHistory } from "../commands";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createConnection", () => {
    it("should create a connection", async () => {
      const mockId = "conn-123";
      vi.mocked(invoke).mockResolvedValueOnce(mockId);

      const config: ConnectionConfig = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };

      const result = await createConnection("Test Connection", "mysql", config);

      expect(result).toBe(mockId);
      expect(invoke).toHaveBeenCalledWith("create_connection", {
        name: "Test Connection",
        dbType: "mysql",
        config,
      });
    });
  });

  describe("getConnections", () => {
    it("should get all connections", async () => {
      const mockConnections: Connection[] = [
        {
          id: "conn-1",
          name: "Test DB 1",
          type: "sqlite",
          config: { filepath: "/test1.db" },
        },
        {
          id: "conn-2",
          name: "Test DB 2",
          type: "mysql",
          config: { host: "localhost" },
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockConnections);

      const result = await getConnections();

      expect(result).toEqual(mockConnections);
      expect(invoke).toHaveBeenCalledWith("get_connections");
    });
  });

  describe("updateConnection", () => {
    it("should update connection name", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await updateConnection("conn-1", "New Name");

      expect(invoke).toHaveBeenCalledWith("update_connection", {
        id: "conn-1",
        name: "New Name",
        config: undefined,
      });
    });

    it("should update connection config", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const config: ConnectionConfig = { host: "newhost" };
      await updateConnection("conn-1", undefined, config);

      expect(invoke).toHaveBeenCalledWith("update_connection", {
        id: "conn-1",
        name: undefined,
        config,
      });
    });

    it("should update both name and config", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      const config: ConnectionConfig = { host: "newhost" };
      await updateConnection("conn-1", "New Name", config);

      expect(invoke).toHaveBeenCalledWith("update_connection", {
        id: "conn-1",
        name: "New Name",
        config,
      });
    });
  });

  describe("disconnectConnection", () => {
    it("should disconnect a connection", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await disconnectConnection("conn-1");

      expect(invoke).toHaveBeenCalledWith("disconnect_connection", {
        id: "conn-1",
      });
    });
  });

  describe("deleteConnection", () => {
    it("should delete a connection", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await deleteConnection("conn-1");

      expect(invoke).toHaveBeenCalledWith("delete_connection", {
        id: "conn-1",
      });
    });
  });

  describe("testConnection", () => {
    it("should test a connection", async () => {
      const mockResult = "Connection successful";
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const config: ConnectionConfig = {
        host: "localhost",
        port: 3306,
        user: "root",
        password: "password",
        database: "testdb",
      };

      const result = await testConnection("mysql", config);

      expect(result).toBe(mockResult);
      expect(invoke).toHaveBeenCalledWith("test_connection", {
        dbType: "mysql",
        config,
      });
    });
  });

  describe("executeSql", () => {
    it("should execute SQL query", async () => {
      const mockResult: QueryResult = {
        columns: ["id", "name"],
        rows: [[1, "test"]],
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await executeSql("conn-1", "SELECT * FROM users");

      expect(result).toEqual(mockResult);
      expect(invoke).toHaveBeenCalledWith("execute_sql", {
        connectionId: "conn-1",
        sql: "SELECT * FROM users",
        database: undefined,
      });
    });

    it("should execute SQL query with database", async () => {
      const mockResult: QueryResult = {
        columns: ["id", "name"],
        rows: [[1, "test"]],
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await executeSql("conn-1", "SELECT * FROM users", "mydb");

      expect(result).toEqual(mockResult);
      expect(invoke).toHaveBeenCalledWith("execute_sql", {
        connectionId: "conn-1",
        sql: "SELECT * FROM users",
        database: "mydb",
      });
    });
  });

  describe("listDatabases", () => {
    it("should list databases", async () => {
      const mockDatabases = ["db1", "db2", "db3"];
      vi.mocked(invoke).mockResolvedValueOnce(mockDatabases);

      const result = await listDatabases("conn-1");

      expect(result).toEqual(mockDatabases);
      expect(invoke).toHaveBeenCalledWith("list_databases", {
        connectionId: "conn-1",
      });
    });
  });

  describe("listTables", () => {
    it("should list tables without database", async () => {
      const mockTables = ["users", "orders", "products"];
      vi.mocked(invoke).mockResolvedValueOnce(mockTables);

      const result = await listTables("conn-1");

      expect(result).toEqual(mockTables);
      expect(invoke).toHaveBeenCalledWith("list_tables", {
        connectionId: "conn-1",
        database: undefined,
      });
    });

    it("should list tables with database", async () => {
      const mockTables = ["users", "orders", "products"];
      vi.mocked(invoke).mockResolvedValueOnce(mockTables);

      const result = await listTables("conn-1", "mydb");

      expect(result).toEqual(mockTables);
      expect(invoke).toHaveBeenCalledWith("list_tables", {
        connectionId: "conn-1",
        database: "mydb",
      });
    });
  });

  describe("getSqlHistory", () => {
    it("should get SQL history without filters", async () => {
      const mockHistory: SqlHistory[] = [
        {
          id: "hist-1",
          connection_id: "conn-1",
          connection_name: "Test DB",
          sql: "SELECT * FROM users",
          executed_at: "2024-01-01T00:00:00Z",
          success: true,
          rows_affected: 10,
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockHistory);

      const result = await getSqlHistory();

      expect(result).toEqual(mockHistory);
      expect(invoke).toHaveBeenCalledWith("get_sql_history", {
        connectionId: undefined,
        limit: undefined,
      });
    });

    it("should get SQL history with connection filter", async () => {
      const mockHistory: SqlHistory[] = [];
      vi.mocked(invoke).mockResolvedValueOnce(mockHistory);

      const result = await getSqlHistory("conn-1");

      expect(result).toEqual(mockHistory);
      expect(invoke).toHaveBeenCalledWith("get_sql_history", {
        connectionId: "conn-1",
        limit: undefined,
      });
    });

    it("should get SQL history with limit", async () => {
      const mockHistory: SqlHistory[] = [];
      vi.mocked(invoke).mockResolvedValueOnce(mockHistory);

      const result = await getSqlHistory(undefined, 10);

      expect(result).toEqual(mockHistory);
      expect(invoke).toHaveBeenCalledWith("get_sql_history", {
        connectionId: undefined,
        limit: 10,
      });
    });

    it("should get SQL history with both filters", async () => {
      const mockHistory: SqlHistory[] = [];
      vi.mocked(invoke).mockResolvedValueOnce(mockHistory);

      const result = await getSqlHistory("conn-1", 10);

      expect(result).toEqual(mockHistory);
      expect(invoke).toHaveBeenCalledWith("get_sql_history", {
        connectionId: "conn-1",
        limit: 10,
      });
    });
  });

  describe("deleteSqlHistory", () => {
    it("should delete all SQL history", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await deleteSqlHistory();

      expect(invoke).toHaveBeenCalledWith("delete_sql_history", {
        id: undefined,
      });
    });

    it("should delete specific SQL history entry", async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await deleteSqlHistory("hist-1");

      expect(invoke).toHaveBeenCalledWith("delete_sql_history", {
        id: "hist-1",
      });
    });
  });
});

