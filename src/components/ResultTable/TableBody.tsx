import type { CellModification } from "../../hooks/useEditHistory";
import type { CellSelection } from "../../hooks/useCellSelection";
import { applyRowModifications } from "../../utils/resultRowDisplay";
import TableRow from "./TableRow";

interface EditingCell {
  row: number;
  col: number;
}

interface TableBodyProps {
  paginatedRows: any[][];
  filteredRows: any[][];
  displayColumns: string[];
  editMode: boolean;
  editingCell: EditingCell | null;
  editingValue: string;
  modifications: Map<string, CellModification>;
  selection: CellSelection | null;
  selectedRows: Set<number>;
  currentPage: number;
  pageSize: number;
  isCellSelected: (displayRowIndex: number, cellIndex: number) => boolean;
  onCellMouseDown: (displayRowIndex: number, cellIndex: number, e: React.MouseEvent) => void;
  onCellClick: (displayRowIndex: number, cellIndex: number, e: React.MouseEvent) => void;
  onCellDoubleClick: (displayRowIndex: number, cellIndex: number) => void;
  onCellKeyDown: (e: React.KeyboardEvent, displayRowIndex: number, cellIndex: number) => void;
  onCellInputChange: (value: string) => void;
  onCellSave: (rowIndex: number, cellIndex: number) => void;
  onCellCancel: () => void;
  onRowNumberClick: (displayRowIndex: number, e: React.MouseEvent) => void;
  onRowContextMenu: (displayRowIndex: number, e: React.MouseEvent) => void;
}

export default function TableBody({
  paginatedRows,
  filteredRows,
  displayColumns,
  editMode,
  editingCell,
  editingValue,
  modifications,
  selection,
  selectedRows,
  currentPage,
  pageSize,
  isCellSelected,
  onCellMouseDown,
  onCellClick,
  onCellDoubleClick,
  onCellKeyDown,
  onCellInputChange,
  onCellSave,
  onCellCancel,
  onRowNumberClick,
  onRowContextMenu,
}: TableBodyProps) {
  return (
    <tbody>
      {paginatedRows.map((row, paginatedRowIndex) => {
        const displayRowIndex = (currentPage - 1) * pageSize + paginatedRowIndex;
        const displayRow = applyRowModifications(row, displayRowIndex, modifications);

        return (
          <TableRow
            key={displayRowIndex}
            row={displayRow}
            rowIndex={displayRowIndex}
            originalRowIndex={displayRowIndex}
            columns={displayColumns}
            editMode={editMode}
            editingCell={editingCell}
            editingValue={editingValue}
            modifications={modifications}
            selection={selection}
            isCellSelected={isCellSelected}
            isRowSelected={selectedRows.has(displayRowIndex)}
            onCellMouseDown={onCellMouseDown}
            onCellClick={onCellClick}
            onCellDoubleClick={onCellDoubleClick}
            onCellKeyDown={onCellKeyDown}
            onCellInputChange={onCellInputChange}
            onCellSave={onCellSave}
            onCellCancel={onCellCancel}
            onRowNumberClick={onRowNumberClick}
            onRowContextMenu={onRowContextMenu}
            rowNumber={
              filteredRows.length > pageSize
                ? displayRowIndex + 1
                : displayRowIndex + 1
            }
          />
        );
      })}
    </tbody>
  );
}
