import { describe, it, expect } from "vitest";
import {
  escapeIdentifier,
  buildTableName,
  extractTableInfo,
  extractTableName,
  escapeSqlValue,
} from "../utils";

describe("escapeIdentifier", () => {
  it("should escape MySQL identifiers with backticks", () => {
    expect(escapeIdentifier("users", "mysql")).toBe("`users`");
    expect(escapeIdentifier("my_table", "mysql")).toBe("`my_table`");
    expect(escapeIdentifier("table`name", "mysql")).toBe("`table``name`");
  });

  it("should escape PostgreSQL identifiers with double quotes", () => {
    expect(escapeIdentifier("users", "postgres")).toBe('"users"');
    expect(escapeIdentifier("my_table", "postgres")).toBe('"my_table"');
    expect(escapeIdentifier('table"name', "postgres")).toBe('"table""name"');
  });

  it("should escape MSSQL identifiers with square brackets", () => {
    expect(escapeIdentifier("users", "mssql")).toBe("[users]");
    expect(escapeIdentifier("my_table", "mssql")).toBe("[my_table]");
    expect(escapeIdentifier("table]name", "mssql")).toBe("[table]]name]");
  });

  it("should not escape SQLite identifiers", () => {
    expect(escapeIdentifier("users", "sqlite")).toBe("users");
    expect(escapeIdentifier("my_table", "sqlite")).toBe("my_table");
    expect(escapeIdentifier("table name", "sqlite")).toBe("table name");
  });

  it("should not escape unknown database types", () => {
    expect(escapeIdentifier("users", "unknown")).toBe("users");
  });
});

describe("buildTableName", () => {
  it("should build table name with database prefix for MySQL", () => {
    expect(buildTableName("users", "mysql", "mydb")).toBe("`mydb`.`users`");
  });

  it("should build table name with database prefix for PostgreSQL", () => {
    expect(buildTableName("users", "postgres", "mydb")).toBe('"mydb"."users"');
  });

  it("should build table name with database prefix for MSSQL", () => {
    expect(buildTableName("users", "mssql", "mydb")).toBe("[mydb].[users]");
  });

  it("should not add database prefix for SQLite", () => {
    expect(buildTableName("users", "sqlite", "mydb")).toBe("users");
  });

  it("should return only table name when database is not provided", () => {
    expect(buildTableName("users", "mysql")).toBe("`users`");
    expect(buildTableName("users", "postgres")).toBe('"users"');
    expect(buildTableName("users", "sqlite")).toBe("users");
  });

  it("should handle null database", () => {
    expect(buildTableName("users", "mysql", null)).toBe("`users`");
  });
});

describe("extractTableInfo", () => {
  it("should extract table name from simple SELECT statement", () => {
    const result = extractTableInfo("SELECT * FROM users");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should extract table name with database prefix", () => {
    const result = extractTableInfo("SELECT * FROM mydb.users");
    expect(result).toEqual({ tableName: "users", database: "mydb" });
  });

  it("should extract table name with MySQL backticks", () => {
    const result = extractTableInfo("SELECT * FROM `users`");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should extract table name with database and MySQL backticks", () => {
    const result = extractTableInfo("SELECT * FROM `mydb`.`users`");
    expect(result).toEqual({ tableName: "users", database: "mydb" });
  });

  it("should extract table name with PostgreSQL double quotes", () => {
    const result = extractTableInfo('SELECT * FROM "users"');
    expect(result).toEqual({ tableName: "users" });
  });

  it("should extract table name with database and PostgreSQL double quotes", () => {
    const result = extractTableInfo('SELECT * FROM "mydb"."users"');
    expect(result).toEqual({ tableName: "users", database: "mydb" });
  });

  it("should extract table name with MSSQL square brackets", () => {
    const result = extractTableInfo("SELECT * FROM [users]");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should extract table name with database and MSSQL square brackets", () => {
    const result = extractTableInfo("SELECT * FROM [mydb].[users]");
    expect(result).toEqual({ tableName: "users", database: "mydb" });
  });

  it("should handle SQL with comments", () => {
    const result = extractTableInfo("-- This is a comment\nSELECT * FROM users");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should handle SQL with multi-line comments", () => {
    const result = extractTableInfo("/* comment */ SELECT * FROM users");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should handle SQL with WHERE clause", () => {
    const result = extractTableInfo("SELECT * FROM users WHERE id = 1");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should handle SQL with JOIN", () => {
    const result = extractTableInfo("SELECT * FROM users u JOIN orders o ON u.id = o.user_id");
    expect(result).toEqual({ tableName: "users" });
  });

  it("should return null for invalid SQL", () => {
    expect(extractTableInfo("INVALID SQL")).toBeNull();
    expect(extractTableInfo("")).toBeNull();
    expect(extractTableInfo(null)).toBeNull();
    expect(extractTableInfo(undefined)).toBeNull();
  });

  it("should handle case-insensitive FROM keyword", () => {
    const result = extractTableInfo("select * from users");
    expect(result).toEqual({ tableName: "users" });
  });
});

describe("extractTableName", () => {
  it("should extract table name from SELECT statement", () => {
    expect(extractTableName("SELECT * FROM users")).toBe("users");
  });

  it("should return null for invalid SQL", () => {
    expect(extractTableName("INVALID SQL")).toBeNull();
    expect(extractTableName(null)).toBeNull();
    expect(extractTableName(undefined)).toBeNull();
  });

  it("should extract table name even with database prefix", () => {
    expect(extractTableName("SELECT * FROM mydb.users")).toBe("users");
  });
});

describe("escapeSqlValue", () => {
  it("should escape null values", () => {
    expect(escapeSqlValue(null, "mysql")).toBe("NULL");
    expect(escapeSqlValue(null, "postgres")).toBe("NULL");
    expect(escapeSqlValue(null, "sqlite")).toBe("NULL");
  });

  it("should escape undefined values", () => {
    expect(escapeSqlValue(undefined, "mysql")).toBe("NULL");
  });

  it("should escape boolean values", () => {
    expect(escapeSqlValue(true, "mysql")).toBe("1");
    expect(escapeSqlValue(false, "mysql")).toBe("0");
    expect(escapeSqlValue(true, "postgres")).toBe("TRUE");
    expect(escapeSqlValue(false, "postgres")).toBe("FALSE");
  });

  it("should escape number values", () => {
    expect(escapeSqlValue(123, "mysql")).toBe("123");
    expect(escapeSqlValue(0, "mysql")).toBe("0");
    expect(escapeSqlValue(-42, "mysql")).toBe("-42");
    expect(escapeSqlValue(3.14, "mysql")).toBe("3.14");
  });

  it("should escape string values", () => {
    expect(escapeSqlValue("hello", "mysql")).toBe("'hello'");
    expect(escapeSqlValue("world", "postgres")).toBe("'world'");
  });

  it("should escape strings with single quotes", () => {
    expect(escapeSqlValue("it's", "mysql")).toBe("'it''s'");
    expect(escapeSqlValue("don't", "postgres")).toBe("'don''t'");
  });

  it("should escape object values as JSON", () => {
    const obj = { name: "test", value: 123 };
    const result = escapeSqlValue(obj, "mysql");
    expect(result).toBe("'{\"name\":\"test\",\"value\":123}'");
  });

  it("should escape arrays as JSON", () => {
    const arr = [1, 2, 3];
    const result = escapeSqlValue(arr, "mysql");
    expect(result).toBe("'[1,2,3]'");
  });

  it("should handle empty strings", () => {
    expect(escapeSqlValue("", "mysql")).toBe("''");
  });
});

