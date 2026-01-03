import React, { useRef, useEffect, memo } from "react";
import type { CellModification } from "../../hooks/useEditHistory";
import type { CellSelection } from "../../hooks/useCellSelection";

interface TableRowProps {
  row: any[];
  rowIndex: number;
  originalRowIndex: number;
  columns: string[];
  editMode: boolean;
  editingCell: { row: number; col: number } | null;
  editingValue: string;
  modifications: Map<string, CellModification>;
  selection: CellSelection | null;
  isCellSelected: (row: number, col: number) => boolean;
  isRowSelected: boolean;
  onCellMouseDown: (rowIndex: number, cellIndex: number, e: React.MouseEvent) => void;
  onCellDoubleClick: (rowIndex: number, cellIndex: number) => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowIndex: number, cellIndex: number) => void;
  onCellInputChange: (value: string) => void;
  onCellSave: (rowIndex: number, cellIndex: number) => void;
  onCellCancel: () => void;
  onRowNumberClick: (rowIndex: number, e: React.MouseEvent) => void;
  onRowContextMenu: (rowIndex: number, e: React.MouseEvent) => void;
  rowNumber: number;
}

function TableRow({
  row,
  rowIndex,
  originalRowIndex,
  columns: _columns,
  editMode,
  editingCell,
  editingValue,
  modifications,
  selection: _selection,
  isCellSelected,
  isRowSelected,
  onCellMouseDown,
  onCellDoubleClick,
  onCellKeyDown,
  onCellInputChange,
  onCellSave,
  onCellCancel,
  onRowNumberClick,
  onRowContextMenu,
  rowNumber,
}: TableRowProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when editing
  useEffect(() => {
    if (editingCell?.row === originalRowIndex && editingCell?.col !== undefined && inputRef.current) {
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }
  }, [editingCell, originalRowIndex]);

  return (
    <tr
      key={rowIndex}
      className={`transition-colors duration-150 group ${isRowSelected ? "neu-raised" : "neu-flat"}`}
      style={{ 
        borderBottom: "1px solid var(--neu-dark)",
        backgroundColor: isRowSelected ? "var(--neu-accent-dark)" : undefined,
      }}
    >
      <td
        className={`px-4 py-2.5 text-center select-none ${isRowSelected ? "font-semibold" : ""}`}
        style={{
          width: "60px",
          minWidth: "60px",
          color: isRowSelected ? "var(--neu-accent)" : "var(--neu-text-light)",
          borderRight: "1px solid var(--neu-dark)",
          cursor: editMode ? "pointer" : "default",
        }}
        onClick={(e) => {
          if (editMode) {
            onRowNumberClick(rowIndex, e);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onRowContextMenu(rowIndex, e);
        }}
      >
        <span className="font-mono text-xs">{rowNumber}</span>
      </td>
      {row.map((cell, cellIndex) => {
        const isEditing =
          editingCell?.row === originalRowIndex && editingCell?.col === cellIndex;
        const modKey = `${originalRowIndex}-${cellIndex}`;
        const isModified = modifications.has(modKey);
        const isSelected = isCellSelected(originalRowIndex, cellIndex);

        return (
          <td
            key={cellIndex}
            data-row-index={rowIndex}
            data-cell-index={cellIndex}
            className={`
              px-4 py-2.5 relative
              ${isEditing ? "neu-pressed" : ""}
              ${isSelected && !isEditing ? "neu-raised" : ""}
              ${editMode ? "cursor-cell hover:neu-hover" : "max-w-xs truncate"}
            `}
            style={{
              ...({
                color: isEditing
                  ? "var(--neu-accent-dark)"
                  : isSelected
                  ? "var(--neu-accent-dark)"
                  : isModified
                  ? "var(--neu-warning)"
                  : "var(--neu-text)",
                borderLeft:
                  isModified && !isEditing && !isSelected
                    ? "2px solid var(--neu-warning)"
                    : "none",
              } as React.CSSProperties),
              userSelect: editMode ? 'none' : 'text',
              WebkitUserSelect: editMode ? 'none' : 'text',
              MozUserSelect: editMode ? 'none' : 'text',
              msUserSelect: editMode ? 'none' : 'text',
            }}
            title={!isEditing ? String(cell ?? "") : undefined}
            onMouseDown={(e) => onCellMouseDown(rowIndex, cellIndex, e)}
            onDoubleClick={() => onCellDoubleClick(rowIndex, cellIndex)}
            onKeyDown={(e) => onCellKeyDown(e, rowIndex, cellIndex)}
            tabIndex={editMode ? 0 : -1}
          >
            {isEditing ? (
              <input
                key={`edit-${originalRowIndex}-${cellIndex}`}
                ref={inputRef}
                type="text"
                value={editingValue}
                onChange={(e) => {
                  e.stopPropagation();
                  onCellInputChange(e.target.value);
                }}
                onBlur={() => onCellSave(originalRowIndex, cellIndex)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCellSave(originalRowIndex, cellIndex);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCellCancel();
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="w-full neu-pressed px-2 py-1 rounded text-xs font-mono focus:outline-none transition-all"
                style={{ color: "var(--neu-text)" }}
                autoFocus
              />
            ) : (
              <>
                {cell === null || cell === undefined ? (
                  <span
                    className="italic font-mono text-xs"
                    style={{ color: "var(--neu-text-light)" }}
                  >
                    NULL
                  </span>
                ) : typeof cell === "object" ? (
                  <span
                    className="font-mono text-xs"
                    style={{ color: "var(--neu-text-light)" }}
                  >
                    {JSON.stringify(cell)}
                  </span>
                ) : (
                  <span className="font-mono text-xs">{String(cell)}</span>
                )}
                {isModified && (
                  <span
                    className="absolute top-1 right-1 text-xs"
                    style={{ color: "var(--neu-warning)" }}
                    title="已修改"
                  >
                    ●
                  </span>
                )}
              </>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// 使用 memo 优化，避免不必要的重渲染
export default memo(TableRow, (prevProps, nextProps) => {
  // 自定义比较函数，只在关键属性变化时重新渲染
  // 注意：对于引用类型（row, modifications, selection），需要更仔细的比较
  
  // 比较基本属性
  if (
    prevProps.rowIndex !== nextProps.rowIndex ||
    prevProps.originalRowIndex !== nextProps.originalRowIndex ||
    prevProps.columns !== nextProps.columns ||
    prevProps.editMode !== nextProps.editMode ||
    prevProps.editingValue !== nextProps.editingValue ||
    prevProps.isRowSelected !== nextProps.isRowSelected ||
    prevProps.rowNumber !== nextProps.rowNumber
  ) {
    return false;
  }
  
  // 比较 editingCell
  const prevEditing = prevProps.editingCell;
  const nextEditing = nextProps.editingCell;
  if (prevEditing?.row !== nextEditing?.row || prevEditing?.col !== nextEditing?.col) {
    return false;
  }
  
  // 比较 row 数组（浅比较每个元素）
  if (prevProps.row.length !== nextProps.row.length) {
    return false;
  }
  for (let i = 0; i < prevProps.row.length; i++) {
    if (prevProps.row[i] !== nextProps.row[i]) {
      return false;
    }
  }
  
  // 比较 modifications Map（检查当前行相关的修改）
  const prevMods = prevProps.modifications;
  const nextMods = nextProps.modifications;
  if (prevMods.size !== nextMods.size) {
    return false;
  }
  // 只检查当前行的修改
  const rowIndex = prevProps.originalRowIndex;
  for (let col = 0; col < prevProps.columns.length; col++) {
    const key = `${rowIndex}-${col}`;
    const prevMod = prevMods.get(key);
    const nextMod = nextMods.get(key);
    if (prevMod !== nextMod) {
      return false;
    }
  }
  
  // 比较 selection（检查当前行是否被选中）
  const prevSelection = prevProps.selection;
  const nextSelection = nextProps.selection;
  if (prevSelection === nextSelection) {
    return true; // 相同引用，无需进一步比较
  }
  if (!prevSelection && !nextSelection) {
    return true; // 都为null
  }
  if (!prevSelection || !nextSelection) {
    return false; // 一个为null，另一个不是
  }
  // 检查当前行的单元格是否在选择中
  for (let col = 0; col < prevProps.columns.length; col++) {
    const key = `${rowIndex}-${col}`;
    if (prevSelection.cells.has(key) !== nextSelection.cells.has(key)) {
      return false;
    }
  }
  
  return true;
});

