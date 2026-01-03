import { describe, it, expect, vi } from "vitest";
import {
  buildFilteredAndSortedSql,
  buildFilteredSql,
  generateUpdateSql,
  generateInsertSql,
  generateUpdateSqlForRows,
} from "../sqlGenerator";
import type { QueryResult, Connection } from "../../lib/commands";
import type { CellModification } from "../../hooks/useEditHistory";

// Mock utils
vi.mock("../../lib/utils", () => ({
  extractTableInfo: vi.fn((sql: string | null | undefined) => {
    if (!sql) return null;
    // 简化的 mock 实现，匹配 FROM table 或 FROM db.table
    const cleaned = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const fromMatch = cleaned.match(/FROM\s+(\w+)(?:\.(\w+))?/i);
    if (fromMatch) {
      if (fromMatch[2]) {
        return { tableName: fromMatch[2], database: fromMatch[1] };
      }
      return { tableName: fromMatch[1] };
    }
    return null;
  }),
  escapeIdentifier: vi.fn((id: string, dbType: string) => {
    if (dbType === "mysql") return `\`${id}\``;
    if (dbType === "postgres") return `"${id}"`;
    if (dbType === "mssql") return `[${id}]`;
    return id;
  }),
  escapeSqlValue: vi.fn((val: any, dbType: string) => {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "boolean") {
      return dbType === "postgres" ? (val ? "TRUE" : "FALSE") : (val ? "1" : "0");
    }
    if (typeof val === "number") return String(val);
    const escaped = String(val).replace(/'/g, "''");
    return `'${escaped}'`;
  }),
  buildTableName: vi.fn((table: string, dbType: string, database?: string | null) => {
    const escapeIdentifier = (id: string, type: string) => {
      if (type === "mysql") return `\`${id}\``;
      if (type === "postgres") return `"${id}"`;
      if (type === "mssql") return `[${id}]`;
      return id;
    };
    const escapedTable = escapeIdentifier(table, dbType);
    if (database && dbType !== "sqlite" && dbType !== "mssql") {
      const escapedDb = escapeIdentifier(database, dbType);
      return `${escapedDb}.${escapedTable}`;
    }
    return escapedTable;
  }),
}));

describe("sqlGenerator", () => {
  describe("buildFilteredAndSortedSql", () => {
    it("should return base SQL when empty", () => {
      expect(buildFilteredAndSortedSql("", {}, [], "mysql")).toBe("");
      expect(buildFilteredAndSortedSql("SELECT * FROM users", {}, [], "mysql")).toBe("SELECT * FROM users");
    });

    it("should add WHERE clause when no WHERE exists", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(result).toContain("WHERE");
      expect(result).toContain("name");
      expect(result).toContain("test");
    });

    it("should append to existing WHERE clause", () => {
      const sql = "SELECT * FROM users WHERE id = 1";
      const filters = { name: "test" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(result).toContain("WHERE");
      expect(result).toContain("AND");
      expect(result).toContain("name");
    });

    it("should add ORDER BY when no ORDER BY exists", () => {
      const sql = "SELECT * FROM users";
      const sortConfig = [{ column: "name", direction: "asc" as const }];
      const result = buildFilteredAndSortedSql(sql, {}, sortConfig, "mysql");
      expect(result).toContain("ORDER BY");
      expect(result).toContain("name");
      expect(result).toContain("ASC");
    });

    it("should replace existing ORDER BY", () => {
      const sql = "SELECT * FROM users ORDER BY id DESC";
      const sortConfig = [{ column: "name", direction: "asc" as const }];
      const result = buildFilteredAndSortedSql(sql, {}, sortConfig, "mysql");
      expect(result).toContain("ORDER BY");
      expect(result).toContain("name");
      expect(result).not.toContain("id DESC");
    });

    it("should handle multiple filters", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test", email: "example" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(result).toContain("name");
      expect(result).toContain("email");
      expect(result).toContain("AND");
    });

    it("should handle multiple sort columns", () => {
      const sql = "SELECT * FROM users";
      const sortConfig = [
        { column: "name", direction: "asc" as const },
        { column: "id", direction: "desc" as const },
      ];
      const result = buildFilteredAndSortedSql(sql, {}, sortConfig, "mysql");
      expect(result).toContain("ORDER BY");
      expect(result).toContain("name");
      expect(result).toContain("id");
    });

    it("should handle filters and sort together", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test" };
      const sortConfig = [{ column: "id", direction: "desc" as const }];
      const result = buildFilteredAndSortedSql(sql, filters, sortConfig, "mysql");
      expect(result).toContain("WHERE");
      expect(result).toContain("ORDER BY");
    });

    it("should remove SQL comments", () => {
      const sql = "SELECT * FROM users -- comment\nWHERE id = 1";
      const filters = { name: "test" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(result).not.toContain("-- comment");
    });

    it("should handle different database types for WHERE clause", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test" };

      const mysqlResult = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(mysqlResult).toContain("LOWER");

      const postgresResult = buildFilteredAndSortedSql(sql, filters, [], "postgres");
      expect(postgresResult).toContain("LOWER");
      expect(postgresResult).toContain("::text");

      const mssqlResult = buildFilteredAndSortedSql(sql, filters, [], "mssql");
      expect(mssqlResult).toContain("COLLATE");
    });

    it("should handle WHERE before ORDER BY", () => {
      const sql = "SELECT * FROM users ORDER BY id";
      const filters = { name: "test" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      const whereIndex = result.indexOf("WHERE");
      const orderByIndex = result.indexOf("ORDER BY");
      expect(whereIndex).toBeLessThan(orderByIndex);
    });

    it("should handle LIMIT clause", () => {
      const sql = "SELECT * FROM users LIMIT 10";
      const filters = { name: "test" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(result).toContain("WHERE");
      expect(result).toContain("LIMIT");
    });

    it("should ignore empty filter values", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test", email: "  ", age: "" };
      const result = buildFilteredAndSortedSql(sql, filters, [], "mysql");
      expect(result).toContain("name");
      expect(result).not.toContain("email");
      expect(result).not.toContain("age");
    });
  });

  describe("buildFilteredSql", () => {
    it("should return base SQL when empty", () => {
      expect(buildFilteredSql("", {}, "mysql")).toBe("");
      expect(buildFilteredSql("SELECT * FROM users", {}, "mysql")).toBe("SELECT * FROM users");
    });

    it("should add WHERE clause when no WHERE exists", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test" };
      const result = buildFilteredSql(sql, filters, "mysql");
      expect(result).toContain("WHERE");
      expect(result).toContain("name");
    });

    it("should append to existing WHERE clause", () => {
      const sql = "SELECT * FROM users WHERE id = 1";
      const filters = { name: "test" };
      const result = buildFilteredSql(sql, filters, "mysql");
      expect(result).toContain("WHERE");
      expect(result).toContain("AND");
    });

    it("should handle multiple filters", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test", email: "example" };
      const result = buildFilteredSql(sql, filters, "mysql");
      expect(result).toContain("name");
      expect(result).toContain("email");
      expect(result).toContain("AND");
    });

    it("should remove SQL comments", () => {
      const sql = "SELECT * FROM users /* comment */ WHERE id = 1";
      const filters = { name: "test" };
      const result = buildFilteredSql(sql, filters, "mysql");
      expect(result).not.toContain("/* comment */");
    });

    it("should handle different database types", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test" };

      const mysqlResult = buildFilteredSql(sql, filters, "mysql");
      expect(mysqlResult).toContain("LOWER");

      const postgresResult = buildFilteredSql(sql, filters, "postgres");
      expect(postgresResult).toContain("::text");

      const mssqlResult = buildFilteredSql(sql, filters, "mssql");
      expect(mssqlResult).toContain("COLLATE");
    });

    it("should ignore empty filter values", () => {
      const sql = "SELECT * FROM users";
      const filters = { name: "test", email: "" };
      const result = buildFilteredSql(sql, filters, "mysql");
      expect(result).toContain("name");
      expect(result).not.toContain("email");
    });
  });

  describe("generateUpdateSql", () => {
    const createMockConnection = (type: string): Connection => ({
      id: "conn1",
      name: "Test Connection",
      type,
      config: {},
    });

    const createMockResult = (): QueryResult => ({
      columns: ["id", "name", "email"],
      rows: [
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
      ],
    });

    it("should return empty array when no modifications", () => {
      const modifications = new Map<string, CellModification>();
      const sql = "SELECT * FROM users";
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      expect(generateUpdateSql(modifications, sql, result, connection, null)).toEqual([]);
    });

    it("should return empty array when sql is empty", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
      ]);
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      expect(generateUpdateSql(modifications, "", result, connection, null)).toEqual([]);
    });

    it("should generate UPDATE SQL for single modification", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
      ]);
      const sql = "SELECT * FROM users";
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqls = generateUpdateSql(modifications, sql, result, connection, null);
      expect(sqls.length).toBe(1);
      expect(sqls[0]).toContain("UPDATE");
      expect(sqls[0]).toContain("SET");
      expect(sqls[0]).toContain("WHERE");
      expect(sqls[0]).toContain("name");
    });

    it("should generate UPDATE SQL for multiple modifications in same row", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
        ["0-2", { rowIndex: 0, column: "email", oldValue: "alice@example.com", newValue: "alice2@example.com" }],
      ]);
      const sql = "SELECT * FROM users";
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqls = generateUpdateSql(modifications, sql, result, connection, null);
      expect(sqls.length).toBe(1);
      expect(sqls[0]).toContain("name");
      expect(sqls[0]).toContain("email");
    });

    it("should generate separate UPDATE SQL for different rows", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
        ["1-1", { rowIndex: 1, column: "name", oldValue: "Bob", newValue: "Bob2" }],
      ]);
      const sql = "SELECT * FROM users";
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqls = generateUpdateSql(modifications, sql, result, connection, null);
      expect(sqls.length).toBe(2);
    });

    it("should handle NULL values in WHERE clause", () => {
      const result: QueryResult = {
        columns: ["id", "name", "email"],
        rows: [[1, "Alice", null]],
      };
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
      ]);
      const sql = "SELECT * FROM users";
      const connection = createMockConnection("mysql");

      const sqls = generateUpdateSql(modifications, sql, result, connection, null);
      expect(sqls[0]).toContain("IS NULL");
    });

    it("should throw error when table info cannot be extracted", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
      ]);
      const sql = "INVALID SQL";
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      expect(() => {
        generateUpdateSql(modifications, sql, result, connection, null);
      }).toThrow("无法从 SQL 中提取表名");
    });

    it("should handle different database types", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
      ]);
      const sql = "SELECT * FROM users";
      const result = createMockResult();

      const mysqlSqls = generateUpdateSql(modifications, sql, result, createMockConnection("mysql"), null);
      expect(mysqlSqls[0]).toContain("`name`");

      const postgresSqls = generateUpdateSql(modifications, sql, result, createMockConnection("postgres"), null);
      expect(postgresSqls[0]).toContain('"name"');

      const mssqlSqls = generateUpdateSql(modifications, sql, result, createMockConnection("mssql"), null);
      expect(mssqlSqls[0]).toContain("[name]");
    });

    it("should use database from SQL if provided", () => {
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "Alice", newValue: "Alice2" }],
      ]);
      const sql = "SELECT * FROM db.users";
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqls = generateUpdateSql(modifications, sql, result, connection, "other_db");
      // Should use "db" from SQL, not "other_db"
      expect(sqls[0]).toContain("db");
    });
  });

  describe("generateInsertSql", () => {
    const createMockConnection = (type: string): Connection => ({
      id: "conn1",
      name: "Test Connection",
      type,
      config: {},
    });

    const createMockData = (): QueryResult => ({
      columns: ["id", "name", "email"],
      rows: [
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
      ],
    });

    it("should return null when no rows selected", () => {
      const selectedRows = new Set<number>();
      const sql = "SELECT * FROM users";
      const editedData = createMockData();
      const connection = createMockConnection("mysql");

      expect(generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], connection, null)).toBeNull();
    });

    it("should return null when sql is empty", () => {
      const selectedRows = new Set([0]);
      const editedData = createMockData();
      const connection = createMockConnection("mysql");

      expect(generateInsertSql(selectedRows, "", editedData, ["id", "name", "email"], connection, null)).toBeNull();
    });

    it("should return null when table info cannot be extracted", () => {
      const selectedRows = new Set([0]);
      const sql = "INVALID SQL";
      const editedData = createMockData();
      const connection = createMockConnection("mysql");

      expect(generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], connection, null)).toBeNull();
    });

    it("should generate INSERT SQL for single row", () => {
      const selectedRows = new Set([0]);
      const sql = "SELECT * FROM users";
      const editedData = createMockData();
      const connection = createMockConnection("mysql");

      const result = generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], connection, null);
      expect(result).not.toBeNull();
      expect(result).toContain("INSERT INTO");
      expect(result).toContain("VALUES");
      expect(result).toContain("1");
      expect(result).toContain("Alice");
    });

    it("should generate INSERT SQL for multiple rows", () => {
      const selectedRows = new Set([0, 1]);
      const sql = "SELECT * FROM users";
      const editedData = createMockData();
      const connection = createMockConnection("mysql");

      const result = generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], connection, null);
      expect(result).not.toBeNull();
      expect(result).toContain("VALUES");
      // Should have two value clauses
      const valueMatches = result.match(/\(/g);
      expect(valueMatches?.length).toBeGreaterThan(2);
    });

    it("should handle NULL values", () => {
      const editedData: QueryResult = {
        columns: ["id", "name", "email"],
        rows: [[1, null, "test@example.com"]],
      };
      const selectedRows = new Set([0]);
      const sql = "SELECT * FROM users";
      const connection = createMockConnection("mysql");

      const result = generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], connection, null);
      expect(result).toContain("NULL");
    });

    it("should skip rows beyond data length", () => {
      const selectedRows = new Set([0, 10]); // 10 is out of range
      const sql = "SELECT * FROM users";
      const editedData = createMockData();
      const connection = createMockConnection("mysql");

      const result = generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], connection, null);
      expect(result).not.toBeNull();
      // Should only include row 0
      expect(result).toContain("1");
      expect(result).not.toContain("10");
    });

    it("should handle different database types", () => {
      const selectedRows = new Set([0]);
      const sql = "SELECT * FROM users";
      const editedData = createMockData();

      const mysqlResult = generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], createMockConnection("mysql"), null);
      expect(mysqlResult).toContain("`id`");

      const postgresResult = generateInsertSql(selectedRows, sql, editedData, ["id", "name", "email"], createMockConnection("postgres"), null);
      expect(postgresResult).toContain('"id"');
    });
  });

  describe("generateUpdateSqlForRows", () => {
    const createMockConnection = (type: string): Connection => ({
      id: "conn1",
      name: "Test Connection",
      type,
      config: {},
    });

    const createMockResult = (): QueryResult => ({
      columns: ["id", "name", "email"],
      rows: [
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
      ],
    });

    const createMockEditedData = (): QueryResult => ({
      columns: ["id", "name", "email"],
      rows: [
        [1, "Alice2", "alice2@example.com"],
        [2, "Bob2", "bob2@example.com"],
      ],
    });

    it("should return null when no rows selected", () => {
      const selectedRows = new Set<number>();
      const sql = "SELECT * FROM users";
      const editedData = createMockEditedData();
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      expect(
        generateUpdateSqlForRows(selectedRows, sql, editedData, result, ["id", "name", "email"], connection, null)
      ).toBeNull();
    });

    it("should return null when sql is empty", () => {
      const selectedRows = new Set([0]);
      const editedData = createMockEditedData();
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      expect(
        generateUpdateSqlForRows(selectedRows, "", editedData, result, ["id", "name", "email"], connection, null)
      ).toBeNull();
    });

    it("should return null when table info cannot be extracted", () => {
      const selectedRows = new Set([0]);
      const sql = "INVALID SQL";
      const editedData = createMockEditedData();
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      expect(
        generateUpdateSqlForRows(selectedRows, sql, editedData, result, ["id", "name", "email"], connection, null)
      ).toBeNull();
    });

    it("should generate UPDATE SQL for single row", () => {
      const selectedRows = new Set([0]);
      const sql = "SELECT * FROM users";
      const editedData = createMockEditedData();
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqlResult = generateUpdateSqlForRows(
        selectedRows,
        sql,
        editedData,
        result,
        ["id", "name", "email"],
        connection,
        null
      );
      expect(sqlResult).not.toBeNull();
      expect(sqlResult).toContain("UPDATE");
      expect(sqlResult).toContain("SET");
      expect(sqlResult).toContain("WHERE");
    });

    it("should generate UPDATE SQL for multiple rows", () => {
      const selectedRows = new Set([0, 1]);
      const sql = "SELECT * FROM users";
      const editedData = createMockEditedData();
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqlResult = generateUpdateSqlForRows(
        selectedRows,
        sql,
        editedData,
        result,
        ["id", "name", "email"],
        connection,
        null
      );
      expect(sqlResult).not.toBeNull();
      // Should have two UPDATE statements separated by newlines
      const updateMatches = sqlResult.match(/UPDATE/g);
      expect(updateMatches?.length).toBe(2);
    });

    it("should handle NULL values in WHERE clause", () => {
      const result: QueryResult = {
        columns: ["id", "name", "email"],
        rows: [[1, "Alice", null]],
      };
      const editedData: QueryResult = {
        columns: ["id", "name", "email"],
        rows: [[1, "Alice2", "test@example.com"]],
      };
      const selectedRows = new Set([0]);
      const sql = "SELECT * FROM users";
      const connection = createMockConnection("mysql");

      const sqlResult = generateUpdateSqlForRows(
        selectedRows,
        sql,
        editedData,
        result,
        ["id", "name", "email"],
        connection,
        null
      );
      expect(sqlResult).toContain("IS NULL");
    });

    it("should skip rows beyond data length", () => {
      const selectedRows = new Set([0, 10]); // 10 is out of range
      const sql = "SELECT * FROM users";
      const editedData = createMockEditedData();
      const result = createMockResult();
      const connection = createMockConnection("mysql");

      const sqlResult = generateUpdateSqlForRows(
        selectedRows,
        sql,
        editedData,
        result,
        ["id", "name", "email"],
        connection,
        null
      );
      // Should only include row 0
      const updateMatches = sqlResult?.match(/UPDATE/g);
      expect(updateMatches?.length).toBe(1);
    });

    it("should handle different database types", () => {
      const selectedRows = new Set([0]);
      const sql = "SELECT * FROM users";
      const editedData = createMockEditedData();
      const result = createMockResult();

      const mysqlResult = generateUpdateSqlForRows(
        selectedRows,
        sql,
        editedData,
        result,
        ["id", "name", "email"],
        createMockConnection("mysql"),
        null
      );
      expect(mysqlResult).toContain("`id`");

      const postgresResult = generateUpdateSqlForRows(
        selectedRows,
        sql,
        editedData,
        result,
        ["id", "name", "email"],
        createMockConnection("postgres"),
        null
      );
      expect(postgresResult).toContain('"id"');
    });
  });
});

