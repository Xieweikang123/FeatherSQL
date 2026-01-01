import { useState, useCallback, useEffect, useRef } from "react";
import type { QueryResult } from "../lib/commands";
import type { CellModification } from "./useEditHistory";
import type { CellSelection } from "./useCellSelection";
import { useEditHistory } from "./useEditHistory";
import { executeSql } from "../lib/commands";
import { generateUpdateSql } from "../utils/sqlGenerator";
import { extractTableInfo } from "../lib/utils";

interface EditingCell {
  row: number;
  col: number;
}

interface UseTableEditingOptions {
  result: QueryResult;
  editMode: boolean;
  currentConnectionId: string | null;
  currentConnection: { type: string } | null;
  currentDatabase: string | null;
  sql: string | null;
  addLog: (message: string) => void;
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
  addLog,
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
  
  // 使用编辑历史 hook
  const editHistory = useEditHistory(editedData);
  
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
    const previousState = editHistory.undo();
    if (previousState) {
      setEditedData(previousState.editedData);
      setModifications(previousState.modifications);
      addLog("已撤销上一步操作");
    } else {
      addLog("没有可撤销的操作");
    }
  }, [editHistory, addLog]);
  
  // 重做
  const handleRedo = useCallback(() => {
    const nextState = editHistory.redo();
    if (nextState) {
      setEditedData(nextState.editedData);
      setModifications(nextState.modifications);
      addLog("已重做操作");
    } else {
      addLog("没有可重做的操作");
    }
  }, [editHistory, addLog]);
  
  // 撤销所有改动
  const handleResetAll = useCallback(() => {
    setEditedData(result);
    setModifications(new Map());
    editHistory.reset();
    clearSelection();
    setEditingCell(null);
    setEditingValue("");
    addLog("已撤销所有改动");
  }, [result, editHistory, clearSelection, addLog]);
  
  // 编辑相关处理函数
  const handleCellDoubleClick = useCallback((originalRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    
    if (originalRowIndex >= editedData.rows.length) return;
    
    const cellValue = editedData.rows[originalRowIndex][cellIndex];
    setEditingCell({ row: originalRowIndex, col: cellIndex });
    setEditingValue(cellValue === null || cellValue === undefined ? "" : String(cellValue));
  }, [editMode, editedData.rows.length]);
  
  const handleCellInputChange = useCallback((value: string) => {
    setEditingValue(value);
  }, []);
  
  const handleCellSave = useCallback((rowIndex: number, cellIndex: number) => {
    if (!editingCell || editingCell.row !== rowIndex || editingCell.col !== cellIndex) return;
    
    const column = result.columns[cellIndex];
    
    // 使用原始结果获取oldValue，而不是当前result（可能是过滤后的）
    let oldValue: any;
    if (originalResultRef?.current && rowIndex < originalResultRef.current.rows.length) {
      oldValue = originalResultRef.current.rows[rowIndex][cellIndex];
    } else if (rowIndex < result.rows.length) {
      // 如果没有原始结果，使用当前result
      oldValue = result.rows[rowIndex][cellIndex];
    } else {
      // 索引超出范围
      setEditingCell(null);
      setEditingValue("");
      return;
    }
    
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
    
    // 记录修改
    const modKey = `${rowIndex}-${cellIndex}`;
    const newMods = new Map(modifications);
    newMods.set(modKey, {
      rowIndex,
      column,
      oldValue,
      newValue
    });
    setModifications(newMods);
    
    setEditingCell(null);
    setEditingValue("");
    addLog(`已修改: ${column} = ${newValue === null ? 'NULL' : newValue}`);
  }, [editingCell, editingValue, result.columns, result.rows, saveToHistory, editedData, modifications, addLog, originalResultRef]);
  
  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);
  
  // 批量编辑选中单元格
  const handleBatchEdit = useCallback((value: string, selection: CellSelection | null) => {
    if (!selection) return;
    
    // 保存当前状态到历史栈（在修改之前）
    saveToHistory();
    
    const newEditedData = { ...editedData };
    newEditedData.rows = [...newEditedData.rows];
    const newMods = new Map(modifications);
    
    let modifiedCount = 0;
    
    // 收集所有选中单元格的当前值，用于判断是否应该追加
    const currentValues: string[] = [];
    for (const cellKey of selection.cells) {
      const [row, col] = cellKey.split('-').map(Number);
      // 使用原始结果获取原始值
      const originalValue = originalResultRef?.current?.rows[row]?.[col] ?? result.rows[row]?.[col];
      const currentValue = editedData.rows[row]?.[col];
      // 检查是否在修改记录中（如果在修改记录中，说明已经被修改过）
      const modKey = `${row}-${col}`;
      const isModified = modifications.has(modKey);
      
      // 如果当前值等于原始值且不在修改记录中，说明未修改，使用空字符串作为标记
      // 注意：即使字符串表示相同，如果已经在修改记录中，也应该使用当前值
      const valueStr = (!isModified && (currentValue === originalValue || String(currentValue) === String(originalValue)))
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
    
    // 遍历所有选中的单元格
    for (const cellKey of selection.cells) {
      const [row, col] = cellKey.split('-').map(Number);
      // 获取原始值和当前编辑后的值（使用原始结果获取原始值）
      const originalValue = originalResultRef?.current?.rows[row]?.[col] ?? result.rows[row]?.[col];
      const currentValue = editedData.rows[row]?.[col];
      
      // 如果值未改变，跳过（避免不必要的更新）
      if (currentValue === newValue || String(currentValue) === String(newValue)) continue;
      
      // 更新编辑数据
      if (!newEditedData.rows[row]) {
        newEditedData.rows[row] = [...editedData.rows[row]];
      }
      newEditedData.rows[row] = [...newEditedData.rows[row]];
      newEditedData.rows[row][col] = newValue;
      
      // 记录修改（使用原始值作为 oldValue，用于撤销）
      const modKey = `${row}-${col}`;
      const column = result.columns[col];
      // 如果这个单元格还没有被修改过，使用原始值；否则使用之前的修改记录中的 oldValue
      const modOldValue = newMods.has(modKey) ? newMods.get(modKey)!.oldValue : originalValue;
      newMods.set(modKey, {
        rowIndex: row,
        column,
        oldValue: modOldValue,
        newValue
      });
      
      modifiedCount++;
    }
    
    if (modifiedCount > 0) {
      setEditedData(newEditedData);
      setModifications(newMods);
      addLog(`批量修改了 ${modifiedCount} 个单元格`);
    }
  }, [result, editedData, modifications, saveToHistory, addLog, originalResultRef]);
  
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
    addLog(`已复制 ${textRows.length} 行 ${sortedCols.length} 列`);
  }, [editedData.rows, addLog]);
  
  // 粘贴数据
  const handlePaste = useCallback(async (selection: CellSelection | null) => {
    if (!selection) {
      addLog('粘贴失败: 没有选中单元格');
      return;
    }
    
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim() === '') {
        addLog('粘贴失败: 剪贴板为空');
        return;
      }
      
      // 处理粘贴内容：按行分割，每行按制表符或逗号分割
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      const parsedLines = lines.map(line => {
        // 如果包含制表符，按制表符分割；否则按逗号分割；如果都没有，整行作为一个值
        if (line.includes('\t')) {
          return line.split('\t');
        } else if (line.includes(',')) {
          return line.split(',').map(v => v.trim());
        } else {
          return [line];
        }
      });
      
      // 保存当前状态到历史栈（在修改之前）
      saveToHistory();
      
      const newEditedData = { ...editedData };
      newEditedData.rows = [...newEditedData.rows];
      const newMods = new Map(modifications);
      
      let pastedCount = 0;
      
      // 判断是否为单个值粘贴（只有一行一列）
      const isSingleValue = parsedLines.length === 1 && parsedLines[0].length === 1;
      const singleValue = isSingleValue ? (parsedLines[0][0].trim() === "" ? null : parsedLines[0][0].trim()) : null;
      
      // 将选中的单元格转换为有序数组（按行和列排序）
      const selectedCells = Array.from(selection.cells)
        .map(key => {
          const [row, col] = key.split('-').map(Number);
          return { row, col };
        })
        .sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });
      
      // 计算选择区域的范围（用于粘贴时的位置计算）
      const minRow = Math.min(...selectedCells.map(c => c.row));
      const minCol = Math.min(...selectedCells.map(c => c.col));
      
      // 遍历所有选中的单元格
      for (let i = 0; i < selectedCells.length; i++) {
        const { row, col } = selectedCells[i];
        
        // 如果超出数据范围，跳过
        if (row >= newEditedData.rows.length || col >= result.columns.length) {
          continue;
        }
        
        // 确保行数据存在
        if (!newEditedData.rows[row]) {
          newEditedData.rows[row] = [...editedData.rows[row]];
        }
        newEditedData.rows[row] = [...newEditedData.rows[row]];
        
        // 获取粘贴值
        let pasteValue = null;
        
        if (isSingleValue) {
          // 单个值：应用到所有选中的单元格
          pasteValue = singleValue;
        } else {
          // 多个值：按位置对应粘贴
          const rowOffset = row - minRow;
          const colOffset = col - minCol;
          
          if (rowOffset < parsedLines.length) {
            const pasteLine = parsedLines[rowOffset];
            if (colOffset < pasteLine.length) {
              const value = pasteLine[colOffset];
              pasteValue = value.trim() === "" ? null : value.trim();
            }
          }
        }
        
        // 如果 pasteValue 仍然是 null（且不是单个值的情况），跳过
        if (pasteValue === null && !isSingleValue) {
          continue;
        }
        
        // 使用原始结果获取oldValue
        const oldValue = originalResultRef?.current?.rows[row]?.[col] ?? result.rows[row]?.[col];
        const newValue = pasteValue;
        
        // 更新单元格值
        newEditedData.rows[row][col] = newValue;
        
        // 记录修改（即使值相同也记录，因为可能是从其他地方粘贴的）
        if (oldValue !== newValue && String(oldValue) !== String(newValue)) {
          const modKey = `${row}-${col}`;
          const column = result.columns[col];
          newMods.set(modKey, {
            rowIndex: row,
            column,
            oldValue,
            newValue
          });
          pastedCount++;
        }
      }
      
      if (pastedCount > 0) {
        setEditedData(newEditedData);
        setModifications(newMods);
        addLog(`已粘贴 ${pastedCount} 个单元格`);
      } else {
        addLog(`粘贴完成，但没有单元格被修改（可能是值相同）`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`粘贴失败: ${errorMsg}`);
      console.error('粘贴错误:', error);
    }
  }, [result, editedData, modifications, saveToHistory, addLog, originalResultRef]);
  
  // 保存修改到数据库
  const handleSaveChanges = useCallback(async () => {
    if (!currentConnectionId || !currentConnection) {
      addLog("错误: 未选择数据库连接");
      return;
    }
    
    if (modifications.size === 0) {
      addLog("没有需要保存的修改");
      return;
    }
    
    if (!sql) {
      addLog("错误: 无法保存，缺少原始 SQL 语句");
      return;
    }
    
    setIsSaving(true);
    
    try {
      // 提取表信息（包括数据库名）
      const tableInfo = extractTableInfo(sql);
      if (!tableInfo) {
        throw new Error("无法从 SQL 中提取表信息");
      }
      
      // 确定使用的数据库：优先使用 SQL 中指定的数据库，否则使用当前选择的数据库
      const databaseToUse = tableInfo.database || currentDatabase;
      // 对于 SQLite，数据库参数应该是空字符串
      const dbParam = currentConnection.type === "sqlite" ? "" : (databaseToUse || undefined);
      
      // 生成 UPDATE SQL 语句
      const updateSqls = generateUpdateSql(
        modifications,
        sql,
        result,
        currentConnection as any,
        currentDatabase
      );
      
      if (updateSqls.length === 0) {
        addLog("错误: 无法生成 UPDATE 语句");
        return;
      }
      
      addLog(`开始保存 ${updateSqls.length} 条修改...`);
      if (databaseToUse) {
        addLog(`使用数据库: ${databaseToUse}`);
      }
      
      // 执行所有 UPDATE 语句
      let successCount = 0;
      let failCount = 0;
      
      for (const updateSql of updateSqls) {
        try {
          await executeSql(currentConnectionId, updateSql, dbParam);
          successCount++;
        } catch (error) {
          failCount++;
          const errorMsg = String(error);
          addLog(`保存失败: ${errorMsg}`);
          console.error("Update SQL:", updateSql);
          console.error("Database param:", dbParam);
          console.error("Error:", error);
        }
      }
      
      if (failCount > 0) {
        addLog(`保存完成: 成功 ${successCount} 条，失败 ${failCount} 条`);
        throw new Error(`部分保存失败: ${failCount} 条记录保存失败`);
      }
      
      addLog(`成功保存 ${successCount} 条修改`);
      
      // 重新执行原始 SQL 查询以刷新数据
      if (!currentTab) return;
      
      addLog("正在刷新数据...");
      updateTab(currentTab.id, { isQuerying: true });
      try {
        const newResult = await executeSql(currentConnectionId, sql, dbParam);
        updateTab(currentTab.id, { queryResult: newResult, error: null, isQuerying: false });
        
        // 清除修改记录
        setModifications(new Map());
        setEditedData(newResult);
        
        addLog("数据已刷新");
      } finally {
        updateTab(currentTab.id, { isQuerying: false });
      }
    } catch (error) {
      const errorMsg = String(error);
      addLog(`保存失败: ${errorMsg}`);
      // 不抛出错误，让用户看到日志
    } finally {
      setIsSaving(false);
    }
  }, [currentConnectionId, currentConnection, modifications, sql, result, currentDatabase, addLog, currentTab, updateTab]);
  
  // 退出编辑模式
  const handleExitEditMode = useCallback((setEditMode: (mode: boolean) => void) => {
    if (modifications.size > 0) {
      // 显示确认对话框
      setShowExitConfirm(true);
    } else {
      // 没有修改，直接退出
      doExitEditMode(setEditMode);
    }
  }, [modifications.size]);
  
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
    handleSaveChanges,
    handleExitEditMode,
    handleConfirmExit,
    handleCancelExit,
    setEditedData,
    setModifications,
  };
}

