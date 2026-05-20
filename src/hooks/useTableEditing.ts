import { useState, useCallback, useEffect, useRef } from "react";
import type { QueryResult } from "../lib/commands";
import type { CellModification } from "./useEditHistory";
import type { CellSelection } from "./useCellSelection";
import { useEditHistory } from "./useEditHistory";
import { executeSql, describeTable } from "../lib/commands";
import { runTabQuery } from "../services/tabQueryService";
import { generateUpdateSql, generateInsertSqlForRowIndices } from "../utils/sqlGenerator";
import { extractTableInfo } from "../lib/utils";

interface EditingCell {
  row: number;
  col: number;
}

export interface SaveFailureDetail {
  index: number;
  statement: string;
  message: string;
}

const SAVE_ERROR_SQL_PREVIEW_LEN = 280;

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function truncateSqlPreview(statement: string, maxLen = SAVE_ERROR_SQL_PREVIEW_LEN): string {
  const oneLine = statement.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) {
    return oneLine;
  }
  return `${oneLine.slice(0, maxLen)}…`;
}

export function buildSaveErrorMessage(
  failures: SaveFailureDetail[],
  totalCount: number
): string {
  if (failures.length === 0) {
    return "保存失败";
  }

  const lines: string[] = [
    `部分保存失败：${failures.length}/${totalCount} 条语句执行失败`,
    "",
  ];

  failures.forEach((failure) => {
    lines.push(`【第 ${failure.index} 条】`);
    lines.push(`SQL: ${truncateSqlPreview(failure.statement)}`);
    lines.push(`错误: ${failure.message}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

interface UseTableEditingOptions {
  result: QueryResult;
  editMode: boolean;
  currentConnectionId: string | null;
  currentConnection: { type: string } | null;
  currentDatabase: string | null;
  sql: string | null;
  updateTab: (tabId: string, updates: any) => void;
  currentTab: { id: string } | null;
  clearSelection: () => void;
  originalResultRef?: React.MutableRefObject<QueryResult | null>;
}

export function useTableEditing({
  result,
  editMode,
  currentConnectionId,
  currentConnection,
  currentDatabase,
  sql,
  updateTab,
  currentTab,
  clearSelection,
  originalResultRef,
}: UseTableEditingOptions) {
  // 编辑相关状态
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editedData, setEditedData] = useState<QueryResult>(result);
  const [modifications, setModifications] = useState<Map<string, CellModification>>(new Map());
  const [editingValue, setEditingValue] = useState<string>("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // 使用 ref 来存储最新的修改记录，处理快速连续输入时状态还没更新的情况
  const modificationsRef = useRef<Map<string, CellModification>>(new Map());
  const editedDataRef = useRef<QueryResult>(result);
  const initialRowCountRef = useRef(result.rows.length);
  
  // 同步 ref 和 state
  useEffect(() => {
    modificationsRef.current = modifications;
  }, [modifications]);
  
  useEffect(() => {
    editedDataRef.current = editedData;
  }, [editedData]);

  useEffect(() => {
    initialRowCountRef.current = result.rows.length;
  }, [result]);
  
  // 使用编辑历史 hook
  const editHistory = useEditHistory();
  
  // 使用 ref 来存储稳定的函数引用，避免无限循环
  const clearSelectionRef = useRef(clearSelection);
  const resetHistoryRef = useRef(editHistory.reset);
  
  // 更新 ref
  useEffect(() => {
    clearSelectionRef.current = clearSelection;
    resetHistoryRef.current = editHistory.reset;
  }, [clearSelection, editHistory.reset]);
  
  // 当 result 变化时，重置编辑状态
  useEffect(() => {
    setEditedData(result);
    setModifications(new Map());
    editedDataRef.current = result;
    modificationsRef.current = new Map();
    setEditingCell(null);
    clearSelectionRef.current();
    resetHistoryRef.current();
    setShowExitConfirm(false);
  }, [result]);
  
  // 保存当前状态到历史栈
  const saveToHistory = useCallback(() => {
    editHistory.saveToHistory(editedData, modifications);
  }, [editHistory, editedData, modifications]);
  
  // 撤销
  const handleUndo = useCallback(() => {
    const previousState = editHistory.undo({ editedData, modifications });
    if (previousState) {
      setEditedData(previousState.editedData);
      setModifications(previousState.modifications);
    }
  }, [editHistory, editedData, modifications]);

  // 重做
  const handleRedo = useCallback(() => {
    const nextState = editHistory.redo({ editedData, modifications });
    if (nextState) {
      setEditedData(nextState.editedData);
      setModifications(nextState.modifications);
    }
  }, [editHistory, editedData, modifications]);
  
  // 撤销所有改动
  const handleResetAll = useCallback(() => {
    setEditedData(result);
    setModifications(new Map());
    editHistory.reset();
    clearSelection();
    setEditingCell(null);
    setEditingValue("");
  }, [result, editHistory, clearSelection]);

  const isNewRow = useCallback((rowIndex: number): boolean => {
    return rowIndex >= initialRowCountRef.current;
  }, []);

  const getNewRowIndices = useCallback((): number[] => {
    const initialCount = initialRowCountRef.current;
    const indices: number[] = [];
    for (let i = initialCount; i < editedDataRef.current.rows.length; i++) {
      indices.push(i);
    }
    return indices;
  }, []);

  const hasPendingChanges = useCallback((): boolean => {
    return modifications.size > 0 || getNewRowIndices().length > 0;
  }, [modifications.size, getNewRowIndices, editedData.rows.length]);

  const handleAddRow = useCallback((): number | null => {
    if (!editMode) {
      return null;
    }

    if (!sql || !extractTableInfo(sql)) {
      return null;
    }

    const columnCount = editedData.columns.length || result.columns.length;
    if (columnCount === 0) {
      return null;
    }

    saveToHistory();

    const newRow = Array(columnCount).fill(null);
    const newRowIndex = editedData.rows.length;
    const newEditedData = {
      ...editedData,
      columns: editedData.columns.length > 0 ? editedData.columns : [...result.columns],
      rows: [...editedData.rows, newRow],
    };

    setEditedData(newEditedData);
    editedDataRef.current = newEditedData;
    setEditingCell({ row: newRowIndex, col: 0 });
    setEditingValue("");

    return newRowIndex;
  }, [editMode, sql, editedData, result.columns, saveToHistory]);
  
  // 编辑相关处理函数
  const handleCellDoubleClick = useCallback((originalRowIndex: number, cellIndex: number) => {
    if (!editMode) return;

    const latestEditedData = editedDataRef.current;
    if (originalRowIndex >= latestEditedData.rows.length) return;

    const cellValue = latestEditedData.rows[originalRowIndex][cellIndex];
    setEditingCell({ row: originalRowIndex, col: cellIndex });
    setEditingValue(cellValue === null || cellValue === undefined ? "" : String(cellValue));
  }, [editMode]);
  
  const handleCellInputChange = useCallback((value: string) => {
    setEditingValue(value);
  }, []);
  
  const handleCellSave = useCallback((rowIndex: number, cellIndex: number) => {
    if (!editingCell || editingCell.row !== rowIndex || editingCell.col !== cellIndex) return;
    
    const columns = editedData.columns.length > 0 ? editedData.columns : result.columns;
    const column = columns[cellIndex];

    if (rowIndex < 0 || rowIndex >= editedData.rows.length) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }

    if (!isNewRow(rowIndex) && rowIndex >= result.rows.length) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }

    const oldValue = isNewRow(rowIndex)
      ? editedData.rows[rowIndex]?.[cellIndex]
      : result.rows[rowIndex][cellIndex];
    
    const newValue = editingValue.trim() === "" ? null : editingValue;
    
    // 如果值未改变，不记录修改
    if (oldValue === newValue || String(oldValue) === String(newValue)) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }
    
    // 保存当前状态到历史栈（在修改之前）
    saveToHistory();
    
    // 更新编辑数据
    const newEditedData = { ...editedData };
    newEditedData.rows = [...newEditedData.rows];
    newEditedData.rows[rowIndex] = [...newEditedData.rows[rowIndex]];
    newEditedData.rows[rowIndex][cellIndex] = newValue;
    setEditedData(newEditedData);
    editedDataRef.current = newEditedData;
    
    if (!isNewRow(rowIndex)) {
      // 记录修改（新增行在保存时统一 INSERT，不写入 modifications）
      const modKey = `${rowIndex}-${cellIndex}`;
      const newMods = new Map(modifications);
      newMods.set(modKey, {
        rowIndex,
        column,
        oldValue,
        newValue
      });
      setModifications(newMods);
    }
    
    setEditingCell(null);
    setEditingValue("");
  }, [editingCell, editingValue, result.columns, result.rows, saveToHistory, editedData, modifications]);
  
  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);
  
  // 批量编辑选中单元格
  const handleBatchEdit = useCallback((value: string, selection: CellSelection | null) => {
    if (!selection) return;
    
    // 保存当前状态到历史栈（在修改之前）
    saveToHistory();
    
    // 使用 ref 获取最新的值，处理快速连续输入时状态还没更新的情况
    const latestEditedData = editedDataRef.current;
    const latestModifications = modificationsRef.current;
    
    const newEditedData = { ...latestEditedData };
    newEditedData.rows = [...latestEditedData.rows];
    const newMods = new Map(latestModifications);
    
    let modifiedCount = 0;
    
    // 收集所有选中单元格的当前值，用于判断是否应该追加
    const currentValues: string[] = [];
    // 将 Set 转换为数组并排序，确保处理顺序一致
    const sortedCellsForCollection = Array.from(selection.cells).sort();
    for (const cellKey of sortedCellsForCollection) {
      const [row, col] = cellKey.split('-').map(Number);
      const baselineValue = isNewRow(row)
        ? latestEditedData.rows[row]?.[col]
        : result.rows[row]?.[col];
      // 检查是否在修改记录中（优先检查 newMods，因为可能在同一函数调用中已经更新）
      const modKey = `${row}-${col}`;
      const isModifiedInNewMods = newMods.has(modKey);
      const isModifiedInOldMods = latestModifications.has(modKey);
      const isModified = isModifiedInNewMods || isModifiedInOldMods;
      
      // 优先使用 newMods 中的值（最新），然后是 latestModifications，最后是 latestEditedData
      // 这样可以处理快速连续输入时状态还没更新的情况
      let currentValue: any;
      if (isModifiedInNewMods) {
        currentValue = newMods.get(modKey)!.newValue;
      } else if (isModifiedInOldMods) {
        currentValue = latestModifications.get(modKey)!.newValue;
      } else {
        // 确保行数据存在
        if (!newEditedData.rows[row]) {
          // 如果 latestEditedData 中也没有该行，从原始 result 中获取
          if (latestEditedData.rows[row]) {
            newEditedData.rows[row] = [...latestEditedData.rows[row]];
          } else if (result.rows[row]) {
            newEditedData.rows[row] = [...result.rows[row]];
          } else {
            // 如果原始数据中也没有，创建一个空数组
            newEditedData.rows[row] = [];
          }
        }
        // 也检查 newEditedData，因为可能在同一循环中已经更新
        // 优先使用 newEditedData，然后是 latestEditedData，最后是原始 result
        currentValue = newEditedData.rows[row]?.[col] ?? 
                      latestEditedData.rows[row]?.[col] ?? 
                      result.rows[row]?.[col];
      }
      
      // 如果当前值等于原始值且不在修改记录中，说明未修改，使用空字符串作为标记
      // 注意：即使字符串表示相同，如果已经在修改记录中，也应该使用当前值
      const valueStr = (!isModified && (currentValue === baselineValue || String(currentValue) === String(baselineValue)))
        ? "" 
        : String(currentValue ?? "");
      currentValues.push(valueStr);
    }
    
    // 判断所有单元格的当前值是否相同
    const allValuesSame = currentValues.length > 0 && currentValues.every(v => v === currentValues[0]);
    // 判断是否所有单元格都未修改（当前值都等于原始值）
    const allUnmodified = currentValues.every(v => v === "");
    
    // 确定新值：
    // 1. 如果所有单元格都未修改，则替换模式（第一次输入）
    // 2. 如果所有单元格的当前值相同，则追加模式（连续输入）
    // 3. 否则，统一替换为输入的值
    let baseValue = "";
    if (allUnmodified) {
      // 所有单元格都未修改，替换模式
      baseValue = "";
    } else if (allValuesSame) {
      // 所有单元格的当前值相同，追加模式
      baseValue = currentValues[0];
    } else {
      // 单元格的值不同，统一替换
      baseValue = "";
    }
    
    const newValue = value.trim() === "" ? null : (baseValue + value);
    
    // 遍历所有选中的单元格（按顺序处理，确保所有单元格都被更新）
    // 将 Set 转换为数组并排序，确保处理顺序一致
    const sortedCells = Array.from(selection.cells).sort();
    for (const cellKey of sortedCells) {
      const [row, col] = cellKey.split('-').map(Number);
      const baselineValue = isNewRow(row)
        ? latestEditedData.rows[row]?.[col]
        : result.rows[row]?.[col];
      
      // 获取当前值（在更新之前）
      // 优先检查是否已经在本次循环中更新过
      const modKey = `${row}-${col}`;
      const alreadyUpdatedInThisLoop = newMods.has(modKey);
      
      let currentValue: any;
      if (alreadyUpdatedInThisLoop) {
        // 如果已经在本次循环中更新过，使用更新后的值
        currentValue = newMods.get(modKey)!.newValue;
      } else {
        // 否则，从修改记录或原始数据中获取当前值
        // 优先使用 latestModifications（之前已经修改过的值），然后是 latestEditedData，最后是原始 result
        if (latestModifications.has(modKey)) {
          currentValue = latestModifications.get(modKey)!.newValue;
        } else {
          currentValue = latestEditedData.rows[row]?.[col] ?? result.rows[row]?.[col];
        }
      }
      
      // 如果值未改变，跳过（避免不必要的更新）
      if (currentValue === newValue || String(currentValue) === String(newValue)) {
        continue;
      }
      
      // 确保行数据存在（在更新之前）
      if (!newEditedData.rows[row]) {
        // 如果 latestEditedData 中也没有该行，从原始 result 中获取
        if (latestEditedData.rows[row]) {
          newEditedData.rows[row] = [...latestEditedData.rows[row]];
        } else if (result.rows[row]) {
          newEditedData.rows[row] = [...result.rows[row]];
        } else {
          // 如果原始数据中也没有，创建一个空数组
          newEditedData.rows[row] = [];
        }
      }
      
      // 更新编辑数据
      newEditedData.rows[row] = [...newEditedData.rows[row]];
      newEditedData.rows[row][col] = newValue;
      
      if (!isNewRow(row)) {
        const column = result.columns[col];
        const modOldValue = newMods.has(modKey) ? newMods.get(modKey)!.oldValue : baselineValue;
        newMods.set(modKey, {
          rowIndex: row,
          column,
          oldValue: modOldValue,
          newValue
        });
      }
      
      modifiedCount++;
    }
    
    if (modifiedCount > 0) {
      setEditedData(newEditedData);
      setModifications(newMods);
      editedDataRef.current = newEditedData;
      modificationsRef.current = newMods;
    }
  }, [result, saveToHistory, isNewRow]);
  
  // 复制选中区域
  const handleCopy = useCallback(async (selection: CellSelection | null) => {
    if (!selection) return;
    
    // 按行分组选中的单元格
    const cellsByRow = new Map<number, Map<number, any>>();
    for (const cellKey of selection.cells) {
      const [row, col] = cellKey.split('-').map(Number);
      if (!cellsByRow.has(row)) {
        cellsByRow.set(row, new Map());
      }
      const value = editedData.rows[row]?.[col];
      cellsByRow.get(row)!.set(col, value === null || value === undefined ? '' : String(value));
    }
    
    // 获取所有行和列的范围
    const rows = Array.from(cellsByRow.keys()).sort((a, b) => a - b);
    const allCols = new Set<number>();
    for (const cols of cellsByRow.values()) {
      for (const col of cols.keys()) {
        allCols.add(col);
      }
    }
    const sortedCols = Array.from(allCols).sort((a, b) => a - b);
    
    // 构建复制文本（按行和列的顺序）
    const textRows: string[] = [];
    for (const row of rows) {
      const cells: string[] = [];
      for (const col of sortedCols) {
        const cols = cellsByRow.get(row);
        cells.push(cols?.get(col) ?? '');
      }
      textRows.push(cells.join('\t'));
    }
    
    const text = textRows.join('\n');
    await navigator.clipboard.writeText(text);
  }, [editedData.rows]);
  
  // 粘贴数据（优先传入 clipboardText，来自原生 paste 事件的 clipboardData，无需 Clipboard 读权限）
  const applyPasteFromText = useCallback((
    selection: CellSelection,
    text: string,
  ) => {
    if (!text || text.trim() === '') {
      return;
    }

    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      const parsedLines = lines.map(line => {
        if (line.includes('\t')) {
          return line.split('\t');
        } else if (line.includes(',')) {
          return line.split(',').map(v => v.trim());
        } else {
          return [line];
        }
      });
      
      saveToHistory();
      
      const columns =
        editedData.columns.length > 0 ? editedData.columns : result.columns;
      const columnCount = columns.length;
      const newEditedData = { ...editedData };
      newEditedData.rows = [...newEditedData.rows];
      const newMods = new Map(modifications);
      
      let hasUpdates = false;
      
      const isSingleValue = parsedLines.length === 1 && parsedLines[0].length === 1;
      const singleValue = isSingleValue
        ? (parsedLines[0][0].trim() === "" ? null : parsedLines[0][0].trim())
        : null;
      
      const selectedCells = Array.from(selection.cells)
        .map(key => {
          const [row, col] = key.split('-').map(Number);
          return { row, col };
        })
        .sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });
      
      const minRow = Math.min(...selectedCells.map(c => c.row));
      const minCol = Math.min(...selectedCells.map(c => c.col));

      const ensureRow = (row: number) => {
        if (!newEditedData.rows[row]) {
          newEditedData.rows[row] = Array(columnCount).fill(null);
        } else if (newEditedData.rows[row].length < columnCount) {
          newEditedData.rows[row] = [
            ...newEditedData.rows[row],
            ...Array(columnCount - newEditedData.rows[row].length).fill(null),
          ];
        }
        newEditedData.rows[row] = [...newEditedData.rows[row]];
      };

      const applyPasteToCell = (row: number, col: number, pasteValue: string | null) => {
        if (row < 0 || row >= newEditedData.rows.length || col < 0 || col >= columnCount) {
          return;
        }
        if (pasteValue === null && !isSingleValue) {
          return;
        }

        ensureRow(row);

        const rowIsNew = isNewRow(row);
        const oldValue = rowIsNew
          ? newEditedData.rows[row][col]
          : result.rows[row]?.[col];
        const newValue = pasteValue;

        newEditedData.rows[row][col] = newValue;
        hasUpdates = true;

        if (!rowIsNew) {
          const unchanged =
            oldValue === newValue ||
            String(oldValue ?? "") === String(newValue ?? "");
          if (unchanged) {
            return;
          }

          const modKey = `${row}-${col}`;
          const modOldValue = newMods.has(modKey)
            ? newMods.get(modKey)!.oldValue
            : oldValue;
          newMods.set(modKey, {
            rowIndex: row,
            column: columns[col],
            oldValue: modOldValue,
            newValue,
          });
        }
      };

      if (isSingleValue) {
        for (const { row, col } of selectedCells) {
          applyPasteToCell(row, col, singleValue);
        }
      } else {
        // 从选区左上角按剪贴板维度展开粘贴（支持只选中一个单元格粘贴整行）
        for (let r = 0; r < parsedLines.length; r++) {
          for (let c = 0; c < parsedLines[r].length; c++) {
            const raw = parsedLines[r][c];
            const pasteValue = raw.trim() === "" ? null : raw.trim();
            applyPasteToCell(minRow + r, minCol + c, pasteValue);
          }
        }
      }
      
    if (hasUpdates) {
      setEditedData(newEditedData);
      setModifications(newMods);
      editedDataRef.current = newEditedData;
      modificationsRef.current = newMods;
    }
  }, [result, editedData, modifications, saveToHistory, isNewRow]);

  const handlePaste = useCallback(async (
    selection: CellSelection | null,
    clipboardText?: string,
  ) => {
    if (!selection) {
      return;
    }

    let text = clipboardText;
    if (text === undefined) {
      try {
        text = await navigator.clipboard.readText();
      } catch (error) {
        // Tauri/WebView 常拒绝 readText；应由 paste 事件传入 clipboardData
        console.warn('无法通过 Clipboard API 读取剪贴板，请使用 Ctrl+V 粘贴:', error);
        return;
      }
    }

    try {
      applyPasteFromText(selection, text);
    } catch (error) {
      console.error('粘贴错误:', error);
    }
  }, [applyPasteFromText]);
  
  // 保存修改到数据库
  const handleSaveChanges = useCallback(async () => {
    if (!currentConnectionId || !currentConnection) {
      return;
    }
    
    const newRowIndices = getNewRowIndices();
    if (modifications.size === 0 && newRowIndices.length === 0) {
      return;
    }
    
    if (!sql) {
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const tableInfo = extractTableInfo(sql);
      if (!tableInfo) {
        throw new Error("无法从 SQL 中提取表信息");
      }
      
      const databaseToUse = tableInfo.database || currentDatabase;
      const dbParam = currentConnection.type === "sqlite" ? "" : (databaseToUse || undefined);
      
      // 获取表结构：主键 + 列类型（用于 INSERT/UPDATE 数值/布尔转换）
      let primaryKeyColumns: string[] | undefined;
      let columnTypes: Record<string, string> | undefined;
      try {
        const columns = await describeTable(currentConnectionId, tableInfo.tableName, dbParam || undefined);
        primaryKeyColumns = columns.filter(c => c.primary_key).map(c => c.name);
        if (primaryKeyColumns.length === 0) primaryKeyColumns = undefined;
        columnTypes = Object.fromEntries(columns.map((c) => [c.name, c.data_type]));
      } catch {
        // 获取失败时回退到全列 WHERE
      }

      const existingRowMods = new Map<string, CellModification>();
      modifications.forEach((mod, key) => {
        if (mod.rowIndex < initialRowCountRef.current) {
          existingRowMods.set(key, mod);
        }
      });
      
      const updateSqls = generateUpdateSql(
        existingRowMods,
        sql,
        result,
        currentConnection as any,
        currentDatabase,
        primaryKeyColumns,
        columnTypes
      );

      const insertSqls = generateInsertSqlForRowIndices(
        newRowIndices,
        sql,
        editedData,
        currentConnection as any,
        currentDatabase,
        editedData.columns.length > 0 ? editedData.columns : result.columns,
        columnTypes
      );
      
      const allSqls = [...insertSqls, ...updateSqls];
      if (allSqls.length === 0) {
        return;
      }
      
      const failures: SaveFailureDetail[] = [];

      for (let i = 0; i < allSqls.length; i++) {
        const statement = allSqls[i];
        try {
          await executeSql(currentConnectionId, statement, dbParam);
        } catch (error) {
          const message = formatErrorMessage(error);
          failures.push({
            index: i + 1,
            statement,
            message,
          });
          console.error("Save SQL:", statement);
          console.error("Database param:", dbParam);
          console.error("Error:", error);
        }
      }

      if (failures.length > 0) {
        const detailMessage = buildSaveErrorMessage(failures, allSqls.length);
        setSaveError(detailMessage);
        throw new Error(detailMessage);
      }
      
      // 重新执行原始 SQL 查询以刷新数据
      if (!currentTab) return;
      
      const newResult = await runTabQuery({
        tabId: currentTab.id,
        sql,
        connectionId: currentConnectionId,
        database: databaseToUse,
        mode: "refresh",
        saveWorkspace: false,
      });

      if (newResult) {
        setModifications(new Map());
        setEditedData(newResult);
        editedDataRef.current = newResult;
        initialRowCountRef.current = newResult.rows.length;
        setSaveSuccess(true);
      }
    } catch (error) {
      const message = formatErrorMessage(error);
      setSaveError((prev) => prev || message);
      console.error("保存失败:", error);
    } finally {
      setIsSaving(false);
    }
  }, [currentConnectionId, currentConnection, modifications, sql, result, editedData, currentDatabase, currentTab, getNewRowIndices]);
  
  // 退出编辑模式
  const handleExitEditMode = useCallback((setEditMode: (mode: boolean) => void) => {
    if (hasPendingChanges()) {
      // 显示确认对话框
      setShowExitConfirm(true);
    } else {
      // 没有修改，直接退出
      doExitEditMode(setEditMode);
    }
  }, [hasPendingChanges]);
  
  const doExitEditMode = useCallback((setEditMode: (mode: boolean) => void) => {
    setEditedData(result);
    setModifications(new Map());
    setEditMode(false);
    setEditingCell(null);
    setEditingValue("");
    clearSelection();
    setShowExitConfirm(false);
  }, [result, clearSelection]);
  
  const handleConfirmExit = useCallback((setEditMode: (mode: boolean) => void) => {
    doExitEditMode(setEditMode);
  }, [doExitEditMode]);
  
  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);
  
  return {
    // 状态
    editedData,
    modifications,
    editingCell,
    editingValue,
    showExitConfirm,
    isSaving,
    saveError,
    saveSuccess,
    editHistory,
    
    // 方法
    handleCellDoubleClick,
    handleCellInputChange,
    handleCellSave,
    handleCellCancel,
    handleBatchEdit,
    handleCopy,
    handlePaste,
    handleUndo,
    handleRedo,
    handleResetAll,
    handleAddRow,
    handleSaveChanges,
    getNewRowIndices,
    hasPendingChanges,
    handleExitEditMode,
    handleConfirmExit,
    handleCancelExit,
    setEditedData,
    setModifications,
  };
}

