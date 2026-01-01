import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditHistory } from "../useEditHistory";
import type { QueryResult } from "../../lib/commands";

describe("useEditHistory", () => {
  const createMockQueryResult = (rows: any[][] = [[1, "test"]]): QueryResult => ({
    columns: ["id", "name"],
    rows,
  });

  beforeEach(() => {
    // No cleanup needed as each test creates a new hook instance
  });

  describe("initial state", () => {
    it("should initialize with empty history", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      expect(result.current.history).toEqual([]);
      expect(result.current.historyIndex).toBe(-1);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe("saveToHistory", () => {
    it("should save state to history", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "test", newValue: "modified" }],
      ]);

      act(() => {
        result.current.saveToHistory(editedData, modifications);
      });

      expect(result.current.history.length).toBe(1);
      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should create deep copy of data", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData, modifications);
      });

      // Modify original data
      editedData.rows[0][1] = "changed";

      // History should not be affected
      expect(result.current.history[0].editedData.rows[0][1]).toBe("modified");
    });

    it("should create deep copy of modifications map", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult();
      const modifications = new Map([
        ["0-1", { rowIndex: 0, column: "name", oldValue: "test", newValue: "modified" }],
      ]);

      act(() => {
        result.current.saveToHistory(editedData, modifications);
      });

      // Modify original map
      modifications.set("1-0", { rowIndex: 1, column: "id", oldValue: "2", newValue: "3" });

      // History should not be affected
      expect(result.current.history[0].modifications.size).toBe(1);
      expect(result.current.history[0].modifications.has("1-0")).toBe(false);
    });

    it("should increment history index", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData1 = createMockQueryResult([[1, "modified1"]]);
      const editedData2 = createMockQueryResult([[1, "modified2"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData1, modifications);
        result.current.saveToHistory(editedData2, modifications);
      });

      expect(result.current.history.length).toBe(2);
      expect(result.current.historyIndex).toBe(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should limit history to MAX_HISTORY_SIZE", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const modifications = new Map();

      // Save more than MAX_HISTORY_SIZE (50) entries
      act(() => {
        for (let i = 0; i < 55; i++) {
          const editedData = createMockQueryResult([[1, `modified${i}`]]);
          result.current.saveToHistory(editedData, modifications);
        }
      });

      expect(result.current.history.length).toBe(50);
      expect(result.current.historyIndex).toBe(49);
    });

    it("should remove old history when exceeding MAX_HISTORY_SIZE", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const modifications = new Map();

      act(() => {
        // Save first entry
        const editedData1 = createMockQueryResult([[1, "first"]]);
        result.current.saveToHistory(editedData1, modifications);

        // Save 50 more entries
        for (let i = 0; i < 50; i++) {
          const editedData = createMockQueryResult([[1, `modified${i}`]]);
          result.current.saveToHistory(editedData, modifications);
        }
      });

      // First entry should be removed
      expect(result.current.history[0].editedData.rows[0][1]).not.toBe("first");
      expect(result.current.history.length).toBe(50);
    });
  });

  describe("undo", () => {
    it("should return null when history is empty", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      let undoResult: ReturnType<typeof result.current.undo> | null = null;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult).toBeNull();
      expect(result.current.canUndo).toBe(false);
    });

    it("should undo to previous state", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData1 = createMockQueryResult([[1, "modified1"]]);
      const editedData2 = createMockQueryResult([[1, "modified2"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData1, modifications);
        result.current.saveToHistory(editedData2, modifications);
      });

      expect(result.current.historyIndex).toBe(1);

      let undoResult: ReturnType<typeof result.current.undo> | null = null;
      act(() => {
        undoResult = result.current.undo();
      });

      expect(undoResult).not.toBeNull();
      // undo() returns the current state (before moving index)
      expect(undoResult!.editedData.rows[0][1]).toBe("modified2");
      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
    });

    it("should not undo beyond first state", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData, modifications);
        result.current.undo();
      });

      // After undo, index moves to 0 (pointing to first state)
      // canUndo is true because historyIndex >= 0
      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canUndo).toBe(true);

      let undoResult: ReturnType<typeof result.current.undo> | null = null;
      act(() => {
        undoResult = result.current.undo();
      });

      // undo() returns history[0] and moves index to -1
      expect(undoResult).not.toBeNull();
      expect(result.current.historyIndex).toBe(-1);
      expect(result.current.canUndo).toBe(false);
    });

    it("should update historyIndexRef when undoing", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData, modifications);
        result.current.undo();
        // Save again - should append new entry
        result.current.saveToHistory(editedData, modifications);
      });

      // After undo to index 0, saving again appends a new entry
      expect(result.current.history.length).toBe(2);
    });
  });

  describe("redo", () => {
    it("should return null when at end of history", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData, modifications);
      });

      let redoResult: ReturnType<typeof result.current.redo> | null = null;
      act(() => {
        redoResult = result.current.redo();
      });

      expect(redoResult).toBeNull();
      expect(result.current.canRedo).toBe(false);
    });

    it("should redo to next state", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData1 = createMockQueryResult([[1, "modified1"]]);
      const editedData2 = createMockQueryResult([[1, "modified2"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData1, modifications);
        result.current.saveToHistory(editedData2, modifications);
      });

      expect(result.current.historyIndex).toBe(1);

      act(() => {
        result.current.undo();
      });

      // After undo from index 1, index moves to 0
      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canRedo).toBe(true);

      let redoResult: ReturnType<typeof result.current.redo> | null = null;
      act(() => {
        redoResult = result.current.redo();
      });

      expect(redoResult).not.toBeNull();
      expect(redoResult!.editedData.rows[0][1]).toBe("modified2");
      expect(result.current.historyIndex).toBe(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should not redo beyond last state", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData, modifications);
        result.current.undo();
        result.current.redo();
      });

      expect(result.current.historyIndex).toBe(0);
      expect(result.current.canRedo).toBe(false);

      let redoResult: ReturnType<typeof result.current.redo> | null = null;
      act(() => {
        redoResult = result.current.redo();
      });

      expect(redoResult).toBeNull();
    });
  });

  describe("reset", () => {
    it("should reset history", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData = createMockQueryResult([[1, "modified"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData, modifications);
        result.current.reset();
      });

      expect(result.current.history).toEqual([]);
      expect(result.current.historyIndex).toBe(-1);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("should allow saving after reset", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData1 = createMockQueryResult([[1, "modified1"]]);
      const editedData2 = createMockQueryResult([[1, "modified2"]]);
      const modifications = new Map();

      act(() => {
        result.current.saveToHistory(editedData1, modifications);
        result.current.reset();
        result.current.saveToHistory(editedData2, modifications);
      });

      expect(result.current.history.length).toBe(1);
      expect(result.current.history[0].editedData.rows[0][1]).toBe("modified2");
    });
  });

  describe("canUndo and canRedo", () => {
    it("should correctly indicate undo/redo availability", () => {
      const initialData = createMockQueryResult();
      const { result } = renderHook(() => useEditHistory(initialData));

      const editedData1 = createMockQueryResult([[1, "modified1"]]);
      const editedData2 = createMockQueryResult([[1, "modified2"]]);
      const modifications = new Map();

      // Initially no undo/redo
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      // After first save
      act(() => {
        result.current.saveToHistory(editedData1, modifications);
      });
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      // After second save
      act(() => {
        result.current.saveToHistory(editedData2, modifications);
      });
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      // After undo
      act(() => {
        result.current.undo();
      });
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      // After undo to beginning
      act(() => {
        result.current.undo();
      });
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });
  });
});

