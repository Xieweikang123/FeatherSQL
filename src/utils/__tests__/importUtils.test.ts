import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCsvContent,
  parseJsonContent,
  parseExcelContent,
  readFileContent,
  generateInsertSql,
  type ImportData,
} from "../importUtils";
import * as XLSX from "xlsx";

// Mock XLSX
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    read: vi.fn(),
    utils: {
      ...actual.utils,
      sheet_to_json: vi.fn(),
    },
  };
});

// Mock utils
vi.mock("../lib/utils", () => ({
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

describe("importUtils", () => {
  describe("parseCsvContent", () => {
    it("should parse simple CSV content", () => {
      const content = "id,name,email\n1,Alice,alice@example.com\n2,Bob,bob@example.com";
      const result = parseCsvContent(content);

      expect(result.columns).toEqual(["id", "name", "email"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(["1", "Alice", "alice@example.com"]);
      expect(result.rows[1]).toEqual(["2", "Bob", "bob@example.com"]);
    });

    it("should throw error for empty CSV", () => {
      expect(() => parseCsvContent("")).toThrow("CSV 文件为空");
      expect(() => parseCsvContent("   \n  \n  ")).toThrow("CSV 文件为空");
    });

    it("should handle CSV with quoted values containing commas", () => {
      const content = 'id,name,email\n1,"Smith, John",john@example.com';
      const result = parseCsvContent(content);

      expect(result.columns).toEqual(["id", "name", "email"]);
      expect(result.rows[0]).toEqual(["1", "Smith, John", "john@example.com"]);
    });

    it("should handle CSV with escaped quotes", () => {
      const content = 'id,name,email\n1,"John ""Johnny"" Smith",john@example.com';
      const result = parseCsvContent(content);

      expect(result.columns).toEqual(["id", "name", "email"]);
      expect(result.rows[0][1]).toBe('John "Johnny" Smith');
    });

    it("should handle CSV with missing values", () => {
      const content = "id,name,email\n1,Alice,\n2,,bob@example.com";
      const result = parseCsvContent(content);

      expect(result.rows[0]).toEqual(["1", "Alice", ""]);
      expect(result.rows[1]).toEqual(["2", "", "bob@example.com"]);
    });

    it("should pad rows with null if shorter than columns", () => {
      const content = "id,name,email\n1,Alice\n2,Bob,bob@example.com,extra";
      const result = parseCsvContent(content);

      expect(result.rows[0]).toHaveLength(3);
      expect(result.rows[0][2]).toBe(null); // Padded with null
      expect(result.rows[1]).toHaveLength(3); // Extra column should be trimmed
    });

    it("should handle Windows line endings", () => {
      const content = "id,name\r\n1,Alice\r\n2,Bob";
      const result = parseCsvContent(content);

      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows).toHaveLength(2);
    });

    it("should handle Unix line endings", () => {
      const content = "id,name\n1,Alice\n2,Bob";
      const result = parseCsvContent(content);

      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows).toHaveLength(2);
    });

    it("should trim whitespace from values", () => {
      const content = "id,name\n 1 , Alice \n 2 , Bob ";
      const result = parseCsvContent(content);

      expect(result.rows[0]).toEqual(["1", "Alice"]);
      expect(result.rows[1]).toEqual(["2", "Bob"]);
    });
  });

  describe("parseJsonContent", () => {
    it("should parse simple JSON array", () => {
      const content = '[{"id":1,"name":"Alice","email":"alice@example.com"}]';
      const result = parseJsonContent(content);

      expect(result.columns).toEqual(["id", "name", "email"]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual([1, "Alice", "alice@example.com"]);
    });

    it("should parse JSON array with multiple objects", () => {
      const content = '[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]';
      const result = parseJsonContent(content);

      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual([1, "Alice"]);
      expect(result.rows[1]).toEqual([2, "Bob"]);
    });

    it("should throw error for invalid JSON", () => {
      expect(() => parseJsonContent("invalid json")).toThrow("JSON 解析失败");
      expect(() => parseJsonContent("{not an array}")).toThrow("JSON 解析失败");
    });

    it("should throw error for non-array JSON", () => {
      expect(() => parseJsonContent('{"id":1}')).toThrow("JSON 文件必须包含一个数组");
    });

    it("should throw error for empty array", () => {
      expect(() => parseJsonContent("[]")).toThrow("JSON 数组为空");
    });

    it("should throw error for non-object elements", () => {
      expect(() => parseJsonContent('[1,2,3]')).toThrow("JSON 数组中的元素必须是对象");
      expect(() => parseJsonContent('["string"]')).toThrow("JSON 数组中的元素必须是对象");
      expect(() => parseJsonContent('[null]')).toThrow("JSON 数组中的元素必须是对象");
    });

    it("should throw error for empty object", () => {
      expect(() => parseJsonContent('[{}]')).toThrow("JSON 对象中没有字段");
    });

    it("should handle null and undefined values", () => {
      const content = '[{"id":1,"name":null,"email":undefined}]';
      // Note: JSON.parse doesn't support undefined, so this will fail
      // But we test null handling
      const content2 = '[{"id":1,"name":null,"email":"test"}]';
      const result = parseJsonContent(content2);

      expect(result.rows[0]).toEqual([1, null, "test"]);
    });

    it("should convert nested objects to JSON strings", () => {
      const content = '[{"id":1,"data":{"key":"value"}}]';
      const result = parseJsonContent(content);

      expect(result.columns).toEqual(["id", "data"]);
      expect(result.rows[0][0]).toBe(1);
      expect(typeof result.rows[0][1]).toBe("string");
      expect(JSON.parse(result.rows[0][1])).toEqual({ key: "value" });
    });

    it("should convert arrays to JSON strings", () => {
      const content = '[{"id":1,"tags":["tag1","tag2"]}]';
      const result = parseJsonContent(content);

      expect(result.columns).toEqual(["id", "tags"]);
      expect(typeof result.rows[0][1]).toBe("string");
      expect(JSON.parse(result.rows[0][1])).toEqual(["tag1", "tag2"]);
    });

    it("should handle objects with different keys", () => {
      const content = '[{"id":1,"name":"Alice"},{"id":2,"email":"bob@example.com"}]';
      const result = parseJsonContent(content);

      // Should use keys from first object
      expect(result.columns).toEqual(["id", "name"]);
      expect(result.rows[0]).toEqual([1, "Alice"]);
      expect(result.rows[1]).toEqual([2, null]); // email not in columns, converted to null
    });
  });

  describe("parseExcelContent", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should parse Excel content", () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      const mockData = [
        ["id", "name", "email"],
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
      ];

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const buffer = new ArrayBuffer(8);
      const result = parseExcelContent(buffer);

      expect(result.columns).toEqual(["id", "name", "email"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual([1, "Alice", "alice@example.com"]);
      expect(result.rows[1]).toEqual([2, "Bob", "bob@example.com"]);
    });

    it("should throw error for empty workbook", () => {
      const mockWorkbook = {
        SheetNames: [],
        Sheets: {},
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);

      const buffer = new ArrayBuffer(8);
      expect(() => parseExcelContent(buffer)).toThrow("Excel 文件没有工作表");
    });

    it("should throw error for empty sheet", () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([] as any);

      const buffer = new ArrayBuffer(8);
      expect(() => parseExcelContent(buffer)).toThrow("Excel 工作表为空");
    });

    it("should throw error for invalid header", () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      const mockData = [["", "", ""]];

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const buffer = new ArrayBuffer(8);
      expect(() => parseExcelContent(buffer)).toThrow("Excel 文件没有有效的表头");
    });

    it("should pad rows with null if shorter than columns", () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      const mockData = [
        ["id", "name", "email"],
        [1, "Alice"],
        [2, "Bob", "bob@example.com", "extra"],
      ];

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const buffer = new ArrayBuffer(8);
      const result = parseExcelContent(buffer);

      expect(result.rows[0]).toHaveLength(3);
      expect(result.rows[0][2]).toBe(null);
      expect(result.rows[1]).toHaveLength(3); // Extra column should be trimmed
    });

    it("should handle null values in cells", () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      const mockData = [
        ["id", "name", "email"],
        [1, null, "alice@example.com"],
      ];

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const buffer = new ArrayBuffer(8);
      const result = parseExcelContent(buffer);

      expect(result.rows[0][1]).toBe(null);
    });

    it("should wrap errors in custom message", () => {
      vi.mocked(XLSX.read).mockImplementation(() => {
        throw new Error("Invalid file");
      });

      const buffer = new ArrayBuffer(8);
      expect(() => parseExcelContent(buffer)).toThrow("Excel 解析失败");
    });
  });

  describe("readFileContent", () => {
    it("should read CSV file", async () => {
      const file = new File(["id,name\n1,Alice"], "test.csv", { type: "text/csv" });
      // Mock file.text() method
      file.text = vi.fn().mockResolvedValue("id,name\n1,Alice");
      const result = await readFileContent(file);

      expect(result.format).toBe("csv");
      expect(result.data.columns).toEqual(["id", "name"]);
      expect(result.data.rows).toHaveLength(1);
    });

    it("should read JSON file", async () => {
      const file = new File(['[{"id":1,"name":"Alice"}]'], "test.json", { type: "application/json" });
      file.text = vi.fn().mockResolvedValue('[{"id":1,"name":"Alice"}]');
      const result = await readFileContent(file);

      expect(result.format).toBe("json");
      expect(result.data.columns).toEqual(["id", "name"]);
      expect(result.data.rows).toHaveLength(1);
    });

    it("should read Excel file", async () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      const mockData = [
        ["id", "name"],
        [1, "Alice"],
      ];

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const buffer = new ArrayBuffer(8);
      const file = new File([buffer], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const result = await readFileContent(file);

      expect(result.format).toBe("excel");
      expect(result.data.columns).toEqual(["id", "name"]);
    });

    it("should read .xls file", async () => {
      const mockWorkbook = {
        SheetNames: ["Sheet1"],
        Sheets: {
          Sheet1: {},
        },
      };

      const mockData = [
        ["id", "name"],
        [1, "Alice"],
      ];

      vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockData as any);

      const buffer = new ArrayBuffer(8);
      const file = new File([buffer], "test.xls", {
        type: "application/vnd.ms-excel",
      });

      const result = await readFileContent(file);

      expect(result.format).toBe("excel");
    });

    it("should throw error for unsupported file format", async () => {
      const file = new File(["content"], "test.txt", { type: "text/plain" });

      await expect(readFileContent(file)).rejects.toThrow("不支持的文件格式");
    });

    it("should handle case-insensitive file extensions", async () => {
      const file = new File(["id,name\n1,Alice"], "test.CSV", { type: "text/csv" });
      file.text = vi.fn().mockResolvedValue("id,name\n1,Alice");
      const result = await readFileContent(file);

      expect(result.format).toBe("csv");
    });
  });

  describe("generateInsertSql", () => {
    const createMockData = (): ImportData => ({
      columns: ["id", "name", "email"],
      rows: [
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
        [3, "Charlie", "charlie@example.com"],
      ],
    });

    it("should generate INSERT SQL for single row", () => {
      const data: ImportData = {
        columns: ["id", "name", "email"],
        rows: [[1, "Alice", "alice@example.com"]],
      };

      const sqls = generateInsertSql("users", data, "mysql", null, 100);

      expect(sqls).toHaveLength(1);
      expect(sqls[0]).toContain("INSERT INTO");
      expect(sqls[0]).toContain("`users`");
      expect(sqls[0]).toContain("`id`");
      expect(sqls[0]).toContain("`name`");
      expect(sqls[0]).toContain("`email`");
      expect(sqls[0]).toContain("VALUES");
      expect(sqls[0]).toContain("1");
      expect(sqls[0]).toContain("Alice");
    });

    it("should generate INSERT SQL for multiple rows in single batch", () => {
      const data = createMockData();
      const sqls = generateInsertSql("users", data, "mysql", null, 100);

      expect(sqls).toHaveLength(1);
      expect(sqls[0]).toContain("VALUES");
      // Should have 3 value clauses
      const valueMatches = sqls[0].match(/\(/g);
      expect(valueMatches?.length).toBeGreaterThanOrEqual(3);
    });

    it("should batch rows when batchSize is smaller", () => {
      const data = createMockData();
      const sqls = generateInsertSql("users", data, "mysql", null, 2);

      expect(sqls).toHaveLength(2); // 3 rows / 2 batchSize = 2 batches
      expect(sqls[0]).toContain("VALUES");
      expect(sqls[1]).toContain("VALUES");
    });

    it("should handle different database types", () => {
      const data: ImportData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
      };

      const mysqlSqls = generateInsertSql("users", data, "mysql", null);
      expect(mysqlSqls[0]).toContain("`users`");
      expect(mysqlSqls[0]).toContain("`id`");

      const postgresSqls = generateInsertSql("users", data, "postgres", null);
      expect(postgresSqls[0]).toContain('"users"');
      expect(postgresSqls[0]).toContain('"id"');

      const mssqlSqls = generateInsertSql("users", data, "mssql", null);
      expect(mssqlSqls[0]).toContain("[users]");
      expect(mssqlSqls[0]).toContain("[id]");
    });

    it("should include database name when provided", () => {
      const data: ImportData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
      };

      const sqls = generateInsertSql("users", data, "mysql", "mydb");
      expect(sqls[0]).toContain("`mydb`");
      expect(sqls[0]).toContain("`users`");
    });

    it("should not include database name for SQLite", () => {
      const data: ImportData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
      };

      const sqls = generateInsertSql("users", data, "sqlite", "mydb");
      expect(sqls[0]).not.toContain("mydb");
    });

    it("should not include database name for MSSQL", () => {
      const data: ImportData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
      };

      const sqls = generateInsertSql("users", data, "mssql", "mydb");
      expect(sqls[0]).not.toContain("mydb");
    });

    it("should handle NULL values", () => {
      const data: ImportData = {
        columns: ["id", "name", "email"],
        rows: [[1, null, "alice@example.com"]],
      };

      const sqls = generateInsertSql("users", data, "mysql", null);
      expect(sqls[0]).toContain("NULL");
    });

    it("should handle empty rows", () => {
      const data: ImportData = {
        columns: ["id", "name"],
        rows: [],
      };

      const sqls = generateInsertSql("users", data, "mysql", null);
      expect(sqls).toHaveLength(0);
    });

    it("should escape special characters in values", () => {
      const data: ImportData = {
        columns: ["id", "name"],
        rows: [[1, "O'Brien"]],
      };

      const sqls = generateInsertSql("users", data, "mysql", null);
      // The mock escapeSqlValue should escape single quotes ('' for SQL)
      expect(sqls[0]).toContain("O''Brien");
    });

    it("should use default batchSize of 100", () => {
      const data: ImportData = {
        columns: ["id"],
        rows: Array.from({ length: 150 }, (_, i) => [i + 1]),
      };

      const sqls = generateInsertSql("users", data, "mysql", null);
      expect(sqls).toHaveLength(2); // 150 rows / 100 batchSize = 2 batches
    });
  });
});

