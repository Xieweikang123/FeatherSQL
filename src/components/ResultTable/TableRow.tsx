import React, { useRef, useEffect } from "react";
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
  onCellMouseDown: (rowIndex: number, cellIndex: number, e: React.MouseEvent) => void;
  onCellDoubleClick: (rowIndex: number, cellIndex: number) => void;
  onCellKeyDown: (e: React.KeyboardEvent, rowIndex: number, cellIndex: number) => void;
  onCellInputChange: (value: string) => void;
  onCellSave: (rowIndex: number, cellIndex: number) => void;
  onCellCancel: () => void;
}

export default function TableRow({
  row,
  rowIndex,
  originalRowIndex,
  columns,
  editMode,
  editingCell,
  editingValue,
  modifications,
  selection,
  isCellSelected,
  onCellMouseDown,
  onCellDoubleClick,
  onCellKeyDown,
  onCellInputChange,
  onCellSave,
  onCellCancel,
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
      className="transition-colors duration-150 group neu-flat"
      style={{ borderBottom: "1px solid var(--neu-dark)" }}
    >
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
              select-none
            `}
            style={{
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

