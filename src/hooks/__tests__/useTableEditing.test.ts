import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableEditing } from "../useTableEditing";
import type { QueryResult } from "../../lib/commands";
import type { CellSelection } from "../useCellSelection";

// Mock dependencies
vi.mock("../useEditHistory", () => ({
  useEditHistory: vi.fn(() => ({
    history: [],
    historyIndex: -1,
    canUndo: false,
    canRedo: false,
    saveToHistory: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock("../../lib/commands", () => ({
  executeSql: vi.fn(),
}));

vi.mock("../../utils/sqlGenerator", () => ({
  generateUpdateSql: vi.fn(),
}));

vi.mock("../../lib/utils", () => ({
  extractTableInfo: vi.fn(),
}));

import { useEditHistory } from "../useEditHistory";
import { executeSql } from "../../lib/commands";
import { generateUpdateSql } from "../../utils/sqlGenerator";
import { extractTableInfo } from "../../lib/utils";

describe("useTableEditing", () => {
  const createMockQueryResult = (rows: any[][] = [[1, "test"]]): QueryResult => ({
    columns: ["id", "name"],
    rows,
  });

  const createMockOptions = (overrides: Partial<any> = {}) => {
    const defaultOptions = {
      result: createMockQueryResult(),
      editMode: true,
      currentConnectionId: "conn1",
      currentConnection: { type: "mysql" },
      currentDatabase: "testdb",
      sql: "SELECT * FROM users",
      updateTab: vi.fn(),
      currentTab: { id: "tab1" },
      clearSelection: vi.fn(),
    };
    return { ...defaultOptions, ...overrides };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    const mockEditHistory = {
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
      saveToHistory: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      reset: vi.fn(),
    };

    vi.mocked(useEditHistory).mockReturnValue(mockEditHistory as any);
    vi.mocked(executeSql).mockResolvedValue(createMockQueryResult());
    vi.mocked(generateUpdateSql).mockReturnValue(["UPDATE users SET name = 'test' WHERE id = 1;"]);
    vi.mocked(extractTableInfo).mockReturnValue({ tableName: "users" });

    // Mock clipboard API
    global.navigator.clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue("test"),
    } as any;
  });

  describe("initial state", () => {
    it("should initialize with correct default values", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      expect(result.current.editedData).toEqual(options.result);
      expect(result.current.modifications.size).toBe(0);
      expect(result.current.editingCell).toBeNull();
      expect(result.current.editingValue).toBe("");
      expect(result.current.showExitConfirm).toBe(false);
      expect(result.current.isSaving).toBe(false);
    });

    it("should reset when result changes", () => {
      const options = createMockOptions();
      const { result, rerender } = renderHook((props) => useTableEditing(props), {
        initialProps: options,
      });

      // Make some modifications using batch edit (more reliable)
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        result.current.handleBatchEdit("modified", selection);
      });

      expect(result.current.modifications.size).toBe(1);

      // Change result
      const newResult = createMockQueryResult([[2, "new"]]);
      rerender({ ...options, result: newResult });

      expect(result.current.editedData).toEqual(newResult);
      expect(result.current.modifications.size).toBe(0);
      expect(result.current.editingCell).toBeNull();
    });
  });

  describe("cell editing", () => {
    it("should start editing on double click", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
      });

      expect(result.current.editingCell).toEqual({ row: 0, col: 1 });
      expect(result.current.editingValue).toBe("test");
    });

    it("should not start editing when not in edit mode", () => {
      const options = createMockOptions({ editMode: false });
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
      });

      expect(result.current.editingCell).toBeNull();
    });

    it("should handle null values when starting edit", () => {
      const result = createMockQueryResult([[1, null]]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      act(() => {
        hookResult.current.handleCellDoubleClick(0, 1);
      });

      expect(hookResult.current.editingValue).toBe("");
    });

    it("should update editing value on input change", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
        result.current.handleCellInputChange("new value");
      });

      expect(result.current.editingValue).toBe("new value");
    });

    it("should save cell edit", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
      });

      expect(result.current.editingCell).toEqual({ row: 0, col: 1 });

      act(() => {
        result.current.handleCellInputChange("modified");
      });

      expect(result.current.editingValue).toBe("modified");

      act(() => {
        result.current.handleCellSave(0, 1);
      });

      expect(result.current.editingCell).toBeNull();
      expect(result.current.modifications.size).toBe(1);
      expect(result.current.editedData.rows[0][1]).toBe("modified");
    });

    it("should not save if value unchanged", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
        result.current.handleCellInputChange("test"); // Same value
        result.current.handleCellSave(0, 1);
      });

      expect(result.current.modifications.size).toBe(0);
    });

    it("should convert empty string to null", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
      });

      act(() => {
        result.current.handleCellInputChange("   "); // Whitespace only
      });

      act(() => {
        result.current.handleCellSave(0, 1);
      });

      // Empty/whitespace string should be converted to null
      expect(result.current.editedData.rows[0][1]).toBe(null);
    });

    it("should cancel cell edit", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
        result.current.handleCellInputChange("modified");
        result.current.handleCellCancel();
      });

      expect(result.current.editingCell).toBeNull();
      expect(result.current.editingValue).toBe("");
    });

    it("should not save if editing different cell", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
        result.current.handleCellInputChange("modified");
        result.current.handleCellSave(0, 0); // Different cell
      });

      expect(result.current.modifications.size).toBe(0);
    });
  });

  describe("batch editing", () => {
    it("should batch edit selected cells", () => {
      const result = createMockQueryResult([
        [1, "Alice"],
        [2, "Bob"],
      ]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      const selection: CellSelection = {
        cells: new Set(["0-1", "1-1"]),
        startRow: 0,
        endRow: 1,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        hookResult.current.handleBatchEdit("test", selection);
      });

      expect(hookResult.current.modifications.size).toBe(2);
      expect(hookResult.current.editedData.rows[0][1]).toBe("test");
      expect(hookResult.current.editedData.rows[1][1]).toBe("test");
    });

    it("should append to existing values in append mode", () => {
      const result = createMockQueryResult([[1, "Alice"]]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      // First edit
      act(() => {
        const selection: CellSelection = {
          cells: new Set(["0-1"]),
          startRow: 0,
          endRow: 0,
          startCol: 1,
          endCol: 1,
        };
        hookResult.current.handleBatchEdit("test", selection);
      });

      // Second edit (should append)
      act(() => {
        const selection: CellSelection = {
          cells: new Set(["0-1"]),
          startRow: 0,
          endRow: 0,
          startCol: 1,
          endCol: 1,
        };
        hookResult.current.handleBatchEdit("2", selection);
      });

      expect(hookResult.current.editedData.rows[0][1]).toBe("test2");
    });

    it("should not batch edit without selection", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleBatchEdit("test", null);
      });

      expect(result.current.modifications.size).toBe(0);
    });
  });

  describe("copy and paste", () => {
    it("should copy selected cells", async () => {
      const result = createMockQueryResult([
        [1, "Alice"],
        [2, "Bob"],
      ]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      const selection: CellSelection = {
        cells: new Set(["0-1", "1-1"]),
        startRow: 0,
        endRow: 1,
        startCol: 1,
        endCol: 1,
      };

      await act(async () => {
        await hookResult.current.handleCopy(selection);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it("should not copy without selection", async () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      await act(async () => {
        await result.current.handleCopy(null);
      });

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it("should paste single value to all selected cells", async () => {
      vi.mocked(navigator.clipboard.readText).mockResolvedValue("pasted");

      const result = createMockQueryResult([
        [1, "Alice"],
        [2, "Bob"],
      ]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      const selection: CellSelection = {
        cells: new Set(["0-1", "1-1"]),
        startRow: 0,
        endRow: 1,
        startCol: 1,
        endCol: 1,
      };

      await act(async () => {
        await hookResult.current.handlePaste(selection);
      });

      expect(hookResult.current.editedData.rows[0][1]).toBe("pasted");
      expect(hookResult.current.editedData.rows[1][1]).toBe("pasted");
    });

    it("should paste tab-separated values", async () => {
      vi.mocked(navigator.clipboard.readText).mockResolvedValue("1\tAlice\n2\tBob");

      const result = createMockQueryResult([
        [1, "test"],
        [2, "test"],
      ]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      const selection: CellSelection = {
        cells: new Set(["0-0", "0-1", "1-0", "1-1"]),
        startRow: 0,
        endRow: 1,
        startCol: 0,
        endCol: 1,
      };

      await act(async () => {
        await hookResult.current.handlePaste(selection);
      });

      expect(hookResult.current.editedData.rows[0][0]).toBe("1");
      expect(hookResult.current.editedData.rows[0][1]).toBe("Alice");
      expect(hookResult.current.editedData.rows[1][0]).toBe("2");
      expect(hookResult.current.editedData.rows[1][1]).toBe("Bob");
    });

    it("should not paste without selection", async () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      await act(async () => {
        await result.current.handlePaste(null);
      });

    });

    it("should handle paste errors", async () => {
      vi.mocked(navigator.clipboard.readText).mockRejectedValue(new Error("Clipboard error"));

      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      await act(async () => {
        await result.current.handlePaste(selection);
      });

    });
  });

  describe("undo and redo", () => {
    it("should undo operation", () => {
      const mockEditHistory = {
        history: [],
        historyIndex: -1,
        canUndo: true,
        canRedo: false,
        saveToHistory: vi.fn(),
        undo: vi.fn(() => ({
          editedData: createMockQueryResult([[1, "original"]]),
          modifications: new Map(),
        })),
        redo: vi.fn(),
        reset: vi.fn(),
      };

      vi.mocked(useEditHistory).mockReturnValue(mockEditHistory as any);

      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleUndo();
      });

      expect(mockEditHistory.undo).toHaveBeenCalled();
    });

    it("should show message when no undo available", () => {
      const mockEditHistory = {
        history: [],
        historyIndex: -1,
        canUndo: false,
        canRedo: false,
        saveToHistory: vi.fn(),
        undo: vi.fn(() => null),
        redo: vi.fn(),
        reset: vi.fn(),
      };

      vi.mocked(useEditHistory).mockReturnValue(mockEditHistory as any);

      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleUndo();
      });

    });

    it("should redo operation", () => {
      const mockEditHistory = {
        history: [],
        historyIndex: -1,
        canUndo: false,
        canRedo: true,
        saveToHistory: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(() => ({
          editedData: createMockQueryResult([[1, "redone"]]),
          modifications: new Map(),
        })),
        reset: vi.fn(),
      };

      vi.mocked(useEditHistory).mockReturnValue(mockEditHistory as any);

      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleRedo();
      });

      expect(mockEditHistory.redo).toHaveBeenCalled();
    });

    it("should reset all changes", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      // Make some modifications using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        result.current.handleBatchEdit("modified", selection);
      });

      expect(result.current.modifications.size).toBe(1);

      act(() => {
        result.current.handleResetAll();
      });

      expect(result.current.modifications.size).toBe(0);
      expect(result.current.editedData).toEqual(options.result);
      expect(options.clearSelection).toHaveBeenCalled();
    });
  });

  describe("save changes", () => {
    it("should save changes to database", async () => {
      const result = createMockQueryResult([[1, "test"]]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      // Make a modification using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        hookResult.current.handleBatchEdit("modified", selection);
      });

      expect(hookResult.current.modifications.size).toBe(1);

      await act(async () => {
        await hookResult.current.handleSaveChanges();
      });

      expect(generateUpdateSql).toHaveBeenCalled();
      expect(executeSql).toHaveBeenCalled();
      expect(options.updateTab).toHaveBeenCalled();
      expect(hookResult.current.modifications.size).toBe(0);
    });

    it("should not save when no modifications", async () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      await act(async () => {
        await result.current.handleSaveChanges();
      });

      expect(executeSql).not.toHaveBeenCalled();
    });

    it("should not save without connection", async () => {
      const options = createMockOptions({ currentConnectionId: null });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      // Make a modification
      act(() => {
        hookResult.current.handleCellDoubleClick(0, 1);
        hookResult.current.handleCellInputChange("modified");
        hookResult.current.handleCellSave(0, 1);
      });

      await act(async () => {
        await hookResult.current.handleSaveChanges();
      });

      expect(executeSql).not.toHaveBeenCalled();
    });

    it("should not save without SQL", async () => {
      const options = createMockOptions({ sql: null });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      // Make a modification using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        hookResult.current.handleBatchEdit("modified", selection);
      });

      await act(async () => {
        await hookResult.current.handleSaveChanges();
      });

      expect(executeSql).not.toHaveBeenCalled();
    });

    it("should handle save errors", async () => {
      vi.mocked(executeSql).mockRejectedValue(new Error("Database error"));

      const result = createMockQueryResult([[1, "test"]]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      // Make a modification using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        hookResult.current.handleBatchEdit("modified", selection);
      });

      await act(async () => {
        await hookResult.current.handleSaveChanges();
      });

    });

    it("should handle partial save failures", async () => {
      vi.mocked(generateUpdateSql).mockReturnValue([
        "UPDATE users SET name = 'test1' WHERE id = 1;",
        "UPDATE users SET name = 'test2' WHERE id = 2;",
      ]);
      vi.mocked(executeSql)
        .mockResolvedValueOnce(createMockQueryResult())
        .mockRejectedValueOnce(new Error("Error"));

      const result = createMockQueryResult([
        [1, "test1"],
        [2, "test2"],
      ]);
      const options = createMockOptions({ result });
      const { result: hookResult } = renderHook(() => useTableEditing(options));

      // Make modifications using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1", "1-1"]),
        startRow: 0,
        endRow: 1,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        hookResult.current.handleBatchEdit("modified", selection);
      });

      await act(async () => {
        await hookResult.current.handleSaveChanges();
      });

    });
  });

  describe("exit edit mode", () => {
    it("should show confirm dialog when there are modifications", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      // Make a modification using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        result.current.handleBatchEdit("modified", selection);
      });

      const setEditMode = vi.fn();
      act(() => {
        result.current.handleExitEditMode(setEditMode);
      });

      expect(result.current.showExitConfirm).toBe(true);
      expect(setEditMode).not.toHaveBeenCalled();
    });

    it("should exit directly when no modifications", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      const setEditMode = vi.fn();
      act(() => {
        result.current.handleExitEditMode(setEditMode);
      });

      expect(setEditMode).toHaveBeenCalledWith(false);
      expect(result.current.showExitConfirm).toBe(false);
    });

    it("should confirm exit", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      // Make a modification
      act(() => {
        result.current.handleCellDoubleClick(0, 1);
        result.current.handleCellInputChange("modified");
        result.current.handleCellSave(0, 1);
      });

      const setEditMode = vi.fn();
      act(() => {
        result.current.handleExitEditMode(setEditMode);
        result.current.handleConfirmExit(setEditMode);
      });

      expect(setEditMode).toHaveBeenCalledWith(false);
      expect(result.current.showExitConfirm).toBe(false);
      expect(result.current.modifications.size).toBe(0);
    });

    it("should cancel exit", () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useTableEditing(options));

      // Make a modification using batch edit
      const selection: CellSelection = {
        cells: new Set(["0-1"]),
        startRow: 0,
        endRow: 0,
        startCol: 1,
        endCol: 1,
      };

      act(() => {
        result.current.handleBatchEdit("modified", selection);
      });

      const setEditMode = vi.fn();
      act(() => {
        result.current.handleExitEditMode(setEditMode);
      });

      expect(result.current.showExitConfirm).toBe(true);

      act(() => {
        result.current.handleCancelExit();
      });

      expect(result.current.showExitConfirm).toBe(false);
      // setEditMode should not be called when canceling
      expect(setEditMode).not.toHaveBeenCalled();
    });
  });

  describe("originalResultRef", () => {
    it("should use originalResultRef for oldValue comparison", () => {
      const originalResult = createMockQueryResult([[1, "original"]]);
      const currentResult = createMockQueryResult([[1, "current"]]);
      const originalResultRef = { current: originalResult };

      const options = createMockOptions({
        result: currentResult,
        originalResultRef: originalResultRef as any,
      });
      const { result } = renderHook(() => useTableEditing(options));

      act(() => {
        result.current.handleCellDoubleClick(0, 1);
      });

      act(() => {
        result.current.handleCellInputChange("modified");
      });

      act(() => {
        result.current.handleCellSave(0, 1);
      });

      // Should use original value from originalResultRef
      expect(result.current.modifications.size).toBe(1);
      const modification = Array.from(result.current.modifications.values())[0];
      expect(modification.oldValue).toBe("original");
    });
  });
});

