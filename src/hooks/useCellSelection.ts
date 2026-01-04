import { useState, useRef, useEffect, useCallback } from "react";

export interface SelectionRange {
  start: { row: number; col: number };
  end: { row: number; col: number };
}

// 支持不连续选择的接口
export interface CellSelection {
  cells: Set<string>; // 格式: "row-col"
  // 为了兼容现有代码，保留矩形范围（用于拖拽选择）
  range: SelectionRange | null;
}

/**
 * Hook to manage cell selection in edit mode
 */
export function useCellSelection(editMode: boolean) {
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  // 使用 ref 存储 isDragging 状态，确保 handleClickOutside 能访问到最新值
  const isDraggingRef = useRef(false);
  // 使用 ref 存储 selection 状态，确保能访问到最新值（用于键盘输入等场景）
  const selectionRef = useRef<CellSelection | null>(null);
  
  // 同步 ref 和 state
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Clear selection when clicking outside
  useEffect(() => {
    if (!editMode) return;

    const handleClickOutside = (event: MouseEvent) => {
      // 如果正在拖拽，不处理（让拖拽逻辑处理）
      // 使用 ref 确保能访问到最新的 isDragging 状态
      if (isDraggingRef.current) {
        return;
      }
      
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
    // 延迟执行，确保拖拽的 handleMouseUp 先执行
    const timeoutId = setTimeout(() => {
      document.addEventListener("mouseup", handleClickOutside, false);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mouseup", handleClickOutside);
    };
  }, [editMode]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // 辅助函数：检查单元格是否被选中
  const isCellSelected = useCallback((row: number, col: number): boolean => {
    if (!selection) return false;
    return selection.cells.has(`${row}-${col}`);
  }, [selection]);

  // 辅助函数：添加单元格到选择
  const addCellToSelection = useCallback((row: number, col: number) => {
    setSelection((prev) => {
      if (!prev) {
        const cells = new Set<string>();
        cells.add(`${row}-${col}`);
        return {
          cells,
          range: { start: { row, col }, end: { row, col } }
        };
      }
      const newCells = new Set(prev.cells);
      newCells.add(`${row}-${col}`);
      // 更新矩形范围
      const cellsArray = Array.from(newCells).map(key => {
        const [r, c] = key.split('-').map(Number);
        return { row: r, col: c };
      });
      const minRow = Math.min(...cellsArray.map(c => c.row));
      const maxRow = Math.max(...cellsArray.map(c => c.row));
      const minCol = Math.min(...cellsArray.map(c => c.col));
      const maxCol = Math.max(...cellsArray.map(c => c.col));
      return {
        cells: newCells,
        range: { start: { row: minRow, col: minCol }, end: { row: maxRow, col: maxCol } }
      };
    });
  }, []);

  // 辅助函数：从选择中移除单元格
  const removeCellFromSelection = useCallback((row: number, col: number) => {
    setSelection((prev) => {
      if (!prev) return null;
      const newCells = new Set(prev.cells);
      newCells.delete(`${row}-${col}`);
      if (newCells.size === 0) return null;
      // 更新矩形范围
      const cellsArray = Array.from(newCells).map(key => {
        const [r, c] = key.split('-').map(Number);
        return { row: r, col: c };
      });
      const minRow = Math.min(...cellsArray.map(c => c.row));
      const maxRow = Math.max(...cellsArray.map(c => c.row));
      const minCol = Math.min(...cellsArray.map(c => c.col));
      const maxCol = Math.max(...cellsArray.map(c => c.col));
      return {
        cells: newCells,
        range: { start: { row: minRow, col: minCol }, end: { row: maxRow, col: maxCol } }
      };
    });
  }, []);

  // 辅助函数：设置矩形选择范围（用于拖拽）
  const setRectSelection = useCallback((start: { row: number; col: number }, end: { row: number; col: number }) => {
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    const cells = new Set<string>();
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        cells.add(`${row}-${col}`);
      }
    }
    
    setSelection({
      cells,
      range: { start, end }
    });
  }, []);

  return {
    selection,
    selectionRef, // 导出 ref，用于获取最新选择状态
    setSelection,
    isDragging,
    setIsDragging,
    dragStartRef,
    clearSelection,
    isCellSelected,
    addCellToSelection,
    removeCellFromSelection,
    setRectSelection,
  };
}

