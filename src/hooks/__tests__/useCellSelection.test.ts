import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCellSelection } from "../useCellSelection";

describe("useCellSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should initialize with null selection when editMode is false", () => {
      const { result } = renderHook(() => useCellSelection(false));
      expect(result.current.selection).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });

    it("should initialize with null selection when editMode is true", () => {
      const { result } = renderHook(() => useCellSelection(true));
      expect(result.current.selection).toBeNull();
      expect(result.current.isDragging).toBe(false);
    });
  });

  describe("cell selection", () => {
    it("should add cell to selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
      });

      expect(result.current.selection).not.toBeNull();
      expect(result.current.isCellSelected(0, 0)).toBe(true);
      expect(result.current.selection?.cells.has("0-0")).toBe(true);
    });

    it("should add multiple cells to selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
        result.current.addCellToSelection(0, 1);
        result.current.addCellToSelection(1, 0);
      });

      expect(result.current.isCellSelected(0, 0)).toBe(true);
      expect(result.current.isCellSelected(0, 1)).toBe(true);
      expect(result.current.isCellSelected(1, 0)).toBe(true);
      expect(result.current.isCellSelected(1, 1)).toBe(false);
      expect(result.current.selection?.cells.size).toBe(3);
    });

    it("should remove cell from selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
        result.current.addCellToSelection(0, 1);
        result.current.removeCellFromSelection(0, 0);
      });

      expect(result.current.isCellSelected(0, 0)).toBe(false);
      expect(result.current.isCellSelected(0, 1)).toBe(true);
      expect(result.current.selection?.cells.size).toBe(1);
    });

    it("should clear selection when removing last cell", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
        result.current.removeCellFromSelection(0, 0);
      });

      expect(result.current.selection).toBeNull();
    });

    it("should not remove cell when selection is null", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.removeCellFromSelection(0, 0);
      });

      expect(result.current.selection).toBeNull();
    });
  });

  describe("rectangular selection", () => {
    it("should set rectangular selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.setRectSelection({ row: 0, col: 0 }, { row: 2, col: 2 });
      });

      expect(result.current.selection).not.toBeNull();
      // Should select 3x3 = 9 cells
      expect(result.current.selection?.cells.size).toBe(9);
      expect(result.current.isCellSelected(0, 0)).toBe(true);
      expect(result.current.isCellSelected(1, 1)).toBe(true);
      expect(result.current.isCellSelected(2, 2)).toBe(true);
      expect(result.current.isCellSelected(3, 3)).toBe(false);
    });

    it("should handle reverse rectangular selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.setRectSelection({ row: 2, col: 2 }, { row: 0, col: 0 });
      });

      expect(result.current.selection?.cells.size).toBe(9);
      expect(result.current.isCellSelected(0, 0)).toBe(true);
      expect(result.current.isCellSelected(2, 2)).toBe(true);
    });

    it("should update range when setting rectangular selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.setRectSelection({ row: 0, col: 0 }, { row: 1, col: 1 });
      });

      expect(result.current.selection?.range).toEqual({
        start: { row: 0, col: 0 },
        end: { row: 1, col: 1 },
      });
    });
  });

  describe("range calculation", () => {
    it("should calculate correct range for multiple cells", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
        result.current.addCellToSelection(2, 2);
        result.current.addCellToSelection(1, 1);
      });

      const range = result.current.selection?.range;
      expect(range).not.toBeNull();
      expect(range?.start.row).toBe(0);
      expect(range?.start.col).toBe(0);
      expect(range?.end.row).toBe(2);
      expect(range?.end.col).toBe(2);
    });

    it("should update range when removing cells", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
        result.current.addCellToSelection(2, 2);
        result.current.addCellToSelection(1, 1);
        result.current.removeCellFromSelection(0, 0);
      });

      const range = result.current.selection?.range;
      expect(range?.start.row).toBe(1);
      expect(range?.start.col).toBe(1);
      expect(range?.end.row).toBe(2);
      expect(range?.end.col).toBe(2);
    });
  });

  describe("clear selection", () => {
    it("should clear selection", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
        result.current.addCellToSelection(1, 1);
        result.current.clearSelection();
      });

      expect(result.current.selection).toBeNull();
      expect(result.current.isDragging).toBe(false);
      expect(result.current.dragStartRef.current).toBeNull();
    });

    it("should clear dragging state", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.setIsDragging(true);
        result.current.clearSelection();
      });

      expect(result.current.isDragging).toBe(false);
    });
  });

  describe("dragging state", () => {
    it("should set dragging state", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.setIsDragging(true);
      });

      expect(result.current.isDragging).toBe(true);
    });

    it("should update dragStartRef", () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.dragStartRef.current = { row: 0, col: 0 };
      });

      expect(result.current.dragStartRef.current).toEqual({ row: 0, col: 0 });
    });
  });

  describe("click outside behavior", () => {
    it("should clear selection when clicking outside table cells", async () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
      });

      expect(result.current.selection).not.toBeNull();

      // Simulate click outside
      const event = new MouseEvent("mouseup", { bubbles: true });
      const div = document.createElement("div");
      document.body.appendChild(div);
      Object.defineProperty(event, "target", { value: div, enumerable: true });

      act(() => {
        document.dispatchEvent(event);
      });

      await waitFor(() => {
        expect(result.current.selection).toBeNull();
      });

      document.body.removeChild(div);
    });

    it("should not clear selection when clicking on table cell", async () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
      });

      // Simulate click on table cell
      const event = new MouseEvent("mouseup", { bubbles: true });
      const td = document.createElement("td");
      document.body.appendChild(td);
      Object.defineProperty(event, "target", { value: td, enumerable: true });

      act(() => {
        document.dispatchEvent(event);
      });

      await waitFor(() => {
        expect(result.current.selection).not.toBeNull();
      });

      document.body.removeChild(td);
    });

    it("should not clear selection when clicking on input", async () => {
      const { result } = renderHook(() => useCellSelection(true));

      act(() => {
        result.current.addCellToSelection(0, 0);
      });

      // Simulate click on input
      const event = new MouseEvent("mouseup", { bubbles: true });
      const input = document.createElement("input");
      document.body.appendChild(input);
      Object.defineProperty(event, "target", { value: input, enumerable: true });

      act(() => {
        document.dispatchEvent(event);
      });

      await waitFor(() => {
        expect(result.current.selection).not.toBeNull();
      });

      document.body.removeChild(input);
    });

    it("should not attach click listener when editMode is false", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");
      const { unmount } = renderHook(() => useCellSelection(false));

      // Should not add listener for mouseup
      expect(addEventListenerSpy).not.toHaveBeenCalledWith("mouseup", expect.any(Function));

      unmount();
      addEventListenerSpy.mockRestore();
    });
  });

  describe("cleanup", () => {
    it("should cleanup event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
      const { unmount } = renderHook(() => useCellSelection(true));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });
});

