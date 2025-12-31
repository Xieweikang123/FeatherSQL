import { useState, useRef, useEffect } from "react";

export interface SelectionRange {
  start: { row: number; col: number };
  end: { row: number; col: number };
}

/**
 * Hook to manage cell selection in edit mode
 */
export function useCellSelection(editMode: boolean) {
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);

  // Clear selection when clicking outside
  useEffect(() => {
    if (!editMode) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("td") && !target.closest("input")) {
        setSelection(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editMode]);

  const clearSelection = () => {
    setSelection(null);
    setIsDragging(false);
    dragStartRef.current = null;
  };

  return {
    selection,
    setSelection,
    isDragging,
    setIsDragging,
    dragStartRef,
    clearSelection,
  };
}

