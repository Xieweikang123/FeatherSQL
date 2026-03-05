import type { QueryResult } from "../../lib/commands";
import type { CellModification } from "../../hooks/useEditHistory";
import type { CellSelection } from "../../hooks/useCellSelection";
import TableRow from "./TableRow";

interface EditingCell {
  row: number;
  col: number;
}

interface TableBodyProps {
  paginatedRows: any[][];
  filteredRows: any[][];
  result: QueryResult;
  editedData: QueryResult;
  displayColumns: string[];
  editMode: boolean;
  editingCell: EditingCell | null;
  editingValue: string;
  modifications: Map<string, CellModification>;
  selection: CellSelection | null;
  selectedRows: Set<number>;
  currentPage: number;
  pageSize: number;
  isCellSelected: (originalRowIndex: number, cellIndex: number) => boolean;
  onCellMouseDown: (filteredRowIndex: number, cellIndex: number, e: React.MouseEvent) => void;
  onCellClick: (filteredRowIndex: number, cellIndex: number, e: React.MouseEvent) => void;
  onCellDoubleClick: (filteredRowIndex: number, cellIndex: number) => void;
  onCellKeyDown: (e: React.KeyboardEvent, filteredRowIndex: number, cellIndex: number) => void;
  onCellInputChange: (value: string) => void;
  onCellSave: (rowIndex: number, cellIndex: number) => void;
  onCellCancel: () => void;
  onRowNumberClick: (filteredRowIndex: number, e: React.MouseEvent) => void;
  onRowContextMenu: (filteredRowIndex: number, e: React.MouseEvent) => void;
  getOriginalRowIndex: (filteredRowIndex: number) => number;
}

export default function TableBody({
  paginatedRows,
  filteredRows: _filteredRows,
  result: _result,
  editedData,
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
  getOriginalRowIndex,
}: TableBodyProps) {
  return (
    <tbody>
      {paginatedRows.map((row, paginatedRowIndex) => {
        // 计算在 filteredRows 中的索引（用于事件处理器和显示）
        const originalFilteredIndex = (currentPage - 1) * pageSize + paginatedRowIndex;
        // originalRowIndex：当前结果中的行索引，用于 editedData、save、modifications
        const originalRowIndex = originalFilteredIndex;
        // 使用 getOriginalRowIndex 获取原始结果中的行索引，确保与 selectedRows、isCellSelected 的索引体系一致
        const fullResultRowIndex = getOriginalRowIndex(originalFilteredIndex);
        const displayRow = originalRowIndex < editedData.rows.length ? editedData.rows[originalRowIndex] : row;
        
        return (
          <TableRow
            key={originalFilteredIndex}
            row={displayRow}
            rowIndex={originalFilteredIndex}
            originalRowIndex={originalRowIndex}
            columns={displayColumns}
            editMode={editMode}
            editingCell={editingCell}
            editingValue={editingValue}
            modifications={modifications}
            selection={selection}
            isCellSelected={(_, col) => isCellSelected(fullResultRowIndex, col)}
            isRowSelected={selectedRows.has(fullResultRowIndex)}
            onCellMouseDown={onCellMouseDown}
            onCellClick={onCellClick}
            onCellDoubleClick={onCellDoubleClick}
            onCellKeyDown={onCellKeyDown}
            onCellInputChange={onCellInputChange}
            onCellSave={onCellSave}
            onCellCancel={onCellCancel}
            onRowNumberClick={onRowNumberClick}
            onRowContextMenu={onRowContextMenu}
            rowNumber={originalFilteredIndex + 1}
          />
        );
      })}
    </tbody>
  );
}

