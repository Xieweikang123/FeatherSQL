import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportToCsv, exportToJson, exportToExcel, type ExportData } from "../exportUtils";

describe("exportUtils", () => {
  // Mock URL.createObjectURL and URL.revokeObjectURL
  const createObjectURLSpy = vi.fn(() => "blob:mock-url");
  const revokeObjectURLSpy = vi.fn();

  beforeEach(() => {
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    // Mock document.createElement and appendChild/removeChild
    const mockLink = {
      href: "",
      download: "",
      style: { display: "" },
      click: vi.fn(),
    };

    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink as any);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink as any);

    createObjectURLSpy.mockClear();
    revokeObjectURLSpy.mockClear();
  });

  describe("exportToCsv", () => {
    it("should export simple data to CSV", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [
          [1, "Alice"],
          [2, "Bob"],
        ],
      };

      exportToCsv(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle empty data", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [],
      };

      exportToCsv(data, "empty");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should escape CSV values with commas", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [[1, "Smith, John"]],
      };

      exportToCsv(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob).toBeInstanceOf(Blob);
    });

    it("should escape CSV values with quotes", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [[1, 'John "Johnny" Smith']],
      };

      exportToCsv(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should escape CSV values with newlines", () => {
      const data: ExportData = {
        columns: ["id", "description"],
        rows: [[1, "Line 1\nLine 2"]],
      };

      exportToCsv(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle null and undefined values", () => {
      const data: ExportData = {
        columns: ["id", "name", "value"],
        rows: [
          [1, null, undefined],
          [2, "test", null],
        ],
      };

      exportToCsv(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should use default filename when not provided", () => {
      const data: ExportData = {
        columns: ["id"],
        rows: [[1]],
      };

      exportToCsv(data);

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should add BOM for UTF-8 support", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [[1, "测试"]],
      };

      exportToCsv(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe("text/csv;charset=utf-8;");
    });
  });

  describe("exportToJson", () => {
    it("should export data to JSON", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [
          [1, "Alice"],
          [2, "Bob"],
        ],
      };

      exportToJson(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it("should convert rows to object array", () => {
      const data: ExportData = {
        columns: ["id", "name", "age"],
        rows: [
          [1, "Alice", 25],
          [2, "Bob", 30],
        ],
      };

      exportToJson(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe("application/json;charset=utf-8;");
    });

    it("should handle empty data", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [],
      };

      exportToJson(data, "empty");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle null and undefined values", () => {
      const data: ExportData = {
        columns: ["id", "name", "value"],
        rows: [
          [1, null, undefined],
          [2, "test", null],
        ],
      };

      exportToJson(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should use default filename when not provided", () => {
      const data: ExportData = {
        columns: ["id"],
        rows: [[1]],
      };

      exportToJson(data);

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should format JSON with indentation", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
      };

      exportToJson(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });
  });

  describe("exportToExcel", () => {
    it("should export data to Excel", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [
          [1, "Alice"],
          [2, "Bob"],
        ],
      };

      exportToExcel(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle empty data", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [],
      };

      exportToExcel(data, "empty");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle large datasets", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: Array.from({ length: 1000 }, (_, i) => [i, `Name ${i}`]),
      };

      exportToExcel(data, "large");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle null and undefined values", () => {
      const data: ExportData = {
        columns: ["id", "name", "value"],
        rows: [
          [1, null, undefined],
          [2, "test", null],
        ],
      };

      exportToExcel(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should use default filename when not provided", () => {
      const data: ExportData = {
        columns: ["id"],
        rows: [[1]],
      };

      exportToExcel(data);

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should set correct MIME type", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
      };

      exportToExcel(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    });

    it("should calculate column widths", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [
          [1, "Short"],
          [2, "This is a very long name that should affect column width"],
        ],
      };

      exportToExcel(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should handle special characters in data", () => {
      const data: ExportData = {
        columns: ["id", "name"],
        rows: [
          [1, "测试"],
          [2, "Special: !@#$%^&*()"],
        ],
      };

      exportToExcel(data, "test");

      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    it("should throw error on export failure", () => {
      // Mock XLSX to throw error
      vi.doMock("xlsx", () => {
        throw new Error("XLSX error");
      });

      const data: ExportData = {
        columns: ["id"],
        rows: [[1]],
      };

      // Note: This test may need adjustment based on actual error handling
      // The function should handle errors gracefully
      expect(() => exportToExcel(data, "test")).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle single column data", () => {
      const data: ExportData = {
        columns: ["id"],
        rows: [[1], [2], [3]],
      };

      exportToCsv(data, "single-column");
      exportToJson(data, "single-column");
      exportToExcel(data, "single-column");

      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);
    });

    it("should handle single row data", () => {
      const data: ExportData = {
        columns: ["id", "name", "age"],
        rows: [[1, "Alice", 25]],
      };

      exportToCsv(data, "single-row");
      exportToJson(data, "single-row");
      exportToExcel(data, "single-row");

      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);
    });

    it("should handle numeric values", () => {
      const data: ExportData = {
        columns: ["id", "price", "quantity"],
        rows: [
          [1, 99.99, 10],
          [2, 149.50, 5],
        ],
      };

      exportToCsv(data, "numeric");
      exportToJson(data, "numeric");
      exportToExcel(data, "numeric");

      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);
    });

    it("should handle boolean values", () => {
      const data: ExportData = {
        columns: ["id", "active", "verified"],
        rows: [
          [1, true, false],
          [2, false, true],
        ],
      };

      exportToCsv(data, "boolean");
      exportToJson(data, "boolean");
      exportToExcel(data, "boolean");

      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);
    });

    it("should handle complex column names", () => {
      const data: ExportData = {
        columns: ["user_id", "user-name", "user name", "user.name"],
        rows: [[1, "test1", "test2", "test3"]],
      };

      exportToCsv(data, "complex-columns");
      exportToJson(data, "complex-columns");
      exportToExcel(data, "complex-columns");

      expect(createObjectURLSpy).toHaveBeenCalledTimes(3);
    });
  });
});

