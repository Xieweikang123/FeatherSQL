import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditHistory } from "../useEditHistory";
import type { QueryResult } from "../../lib/commands";

describe("useEditHistory", () => {
  const createMockQueryResult = (rows: any[][] = [[1, "test"]]): QueryResult => ({
    columns: ["id", "name"],
    rows,
  });

  const emptyMods = new Map();

  describe("initial state", () => {
    it("should initialize with empty history", () => {
      const { result } = renderHook(() => useEditHistory());

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  describe("saveToHistory", () => {
    it("should enable undo after saving", () => {
      const { result } = renderHook(() => useEditHistory());
      const editedData = createMockQueryResult([[1, "modified"]]);

      act(() => {
        result.current.saveToHistory(editedData, emptyMods);
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should create deep copy of data", () => {
      const { result } = renderHook(() => useEditHistory());
      const editedData = createMockQueryResult([[1, "modified"]]);

      act(() => {
        result.current.saveToHistory(editedData, emptyMods);
      });

      editedData.rows[0][1] = "changed";

      act(() => {
        const restored = result.current.undo({
          editedData: createMockQueryResult([[1, "current"]]),
          modifications: emptyMods,
        });
        expect(restored?.editedData.rows[0][1]).toBe("modified");
      });
    });

    it("should clear redo stack on new save", () => {
      const { result } = renderHook(() => useEditHistory());
      const state1 = createMockQueryResult([[1, "a"]]);
      const state2 = createMockQueryResult([[1, "b"]]);
      const current = createMockQueryResult([[1, "current"]]);

      act(() => {
        result.current.saveToHistory(state1, emptyMods);
      });
      act(() => {
        result.current.undo({ editedData: current, modifications: emptyMods });
      });
      expect(result.current.canRedo).toBe(true);
      act(() => {
        result.current.saveToHistory(state2, emptyMods);
      });

      expect(result.current.canRedo).toBe(false);
    });
  });

  describe("undo and redo", () => {
    it("should undo to saved state", () => {
      const { result } = renderHook(() => useEditHistory());
      const beforeEdit = createMockQueryResult([[1, "before"]]);
      const afterEdit = createMockQueryResult([[1, "after"]]);

      act(() => {
        result.current.saveToHistory(beforeEdit, emptyMods);
      });

      let restored: ReturnType<typeof result.current.undo> = null;
      act(() => {
        restored = result.current.undo({
          editedData: afterEdit,
          modifications: emptyMods,
        });
      });

      expect(restored?.editedData.rows[0][1]).toBe("before");
      expect(result.current.canRedo).toBe(true);
    });

    it("should redo after undo", () => {
      const { result } = renderHook(() => useEditHistory());
      const beforeEdit = createMockQueryResult([[1, "before"]]);
      const afterEdit = createMockQueryResult([[1, "after"]]);

      act(() => {
        result.current.saveToHistory(beforeEdit, emptyMods);
        result.current.undo({ editedData: afterEdit, modifications: emptyMods });
      });

      let redone: ReturnType<typeof result.current.redo> = null;
      act(() => {
        redone = result.current.redo({
          editedData: beforeEdit,
          modifications: emptyMods,
        });
      });

      expect(redone?.editedData.rows[0][1]).toBe("after");
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should return null when undo stack is empty", () => {
      const { result } = renderHook(() => useEditHistory());

      let restored: ReturnType<typeof result.current.undo> = null;
      act(() => {
        restored = result.current.undo({
          editedData: createMockQueryResult(),
          modifications: emptyMods,
        });
      });

      expect(restored).toBeNull();
    });
  });

  describe("reset", () => {
    it("should reset both stacks", () => {
      const { result } = renderHook(() => useEditHistory());

      act(() => {
        result.current.saveToHistory(createMockQueryResult([[1, "x"]]), emptyMods);
        result.current.reset();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });
});
