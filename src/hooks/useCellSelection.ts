import { useState, useRef, useEffect, useCallback } from "react";

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
      // 检查点击的目标是否是表格单元格或其子元素
      const isTableCell = target.closest("td") !== null;
      const isInput = target.closest("input") !== null;
      
      // 只有在点击的不是单元格或输入框时才清除选择
      if (!isTableCell && !isInput) {
        setSelection(null);
      }
    };

    // 使用 mouseup 事件，确保在单元格的 onMouseDown 处理完成后再清除选择
    document.addEventListener("mouseup", handleClickOutside);
    return () => {
      document.removeEventListener("mouseup", handleClickOutside);
    };
  }, [editMode]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  return {
    selection,
    setSelection,
    isDragging,
    setIsDragging,
    dragStartRef,
    clearSelection,
  };
}

