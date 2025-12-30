import { useState, useMemo, useEffect, useRef } from "react";
import { type QueryResult, executeSql } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import ConfirmDialog from "./ConfirmDialog";
import { extractTableInfo, escapeIdentifier, escapeSqlValue, buildTableName } from "../lib/utils";

interface ResultTableProps {
  result: QueryResult;
  sql?: string | null;
}

interface EditingCell {
  row: number;
  col: number;
}

interface CellModification {
  rowIndex: number;
  column: string;
  oldValue: any;
  newValue: any;
}

interface SelectionRange {
  start: { row: number; col: number };
  end: { row: number; col: number };
}

export default function ResultTable({ result, sql }: ResultTableProps) {
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [expandedSearchColumn, setExpandedSearchColumn] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // 编辑相关状态
  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editedData, setEditedData] = useState<QueryResult>(result);
  const [modifications, setModifications] = useState<Map<string, CellModification>>(new Map());
  const [editingValue, setEditingValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  // 选择相关状态
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  
  // 获取连接信息
  const { 
    currentConnectionId, 
    currentDatabase, 
    connections, 
    addLog, 
    setQueryResult,
    setIsQuerying 
  } = useConnectionStore();
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const [isSaving, setIsSaving] = useState(false);
  
  // 当 result 变化时，重置编辑状态
  useEffect(() => {
    setEditedData(result);
    setModifications(new Map());
    setEditingCell(null);
    setSelection(null);
  }, [result]);

  // 点击表格外部时清除选择
  useEffect(() => {
    if (!editMode) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 如果点击的不是表格单元格，清除选择
      if (!target.closest('td') && !target.closest('input')) {
        setSelection(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editMode]);

  // 点击外部关闭搜索框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!expandedSearchColumn) return;
      
      const searchBox = searchBoxRefs.current[expandedSearchColumn];
      const target = event.target as HTMLElement;
      
      // 检查是否点击在搜索框内或表头按钮上
      if (searchBox && !searchBox.contains(target)) {
        const isHeaderButton = target.closest('th')?.querySelector('button');
        if (!isHeaderButton || !isHeaderButton.contains(target)) {
          setExpandedSearchColumn(null);
        }
      }
    };

    if (expandedSearchColumn) {
      // 使用 setTimeout 避免立即触发（因为点击按钮的事件会先触发）
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [expandedSearchColumn]);

  // 过滤行数据
  const filteredRows = useMemo(() => {
    if (!result || result.rows.length === 0) return [];
    
    const activeFilters = Object.entries(columnFilters).filter(([_, value]) => value.trim() !== "");
    if (activeFilters.length === 0) return result.rows;

    return result.rows.filter((row) => {
      return activeFilters.every(([columnName, filterValue]) => {
        const columnIndex = result.columns.indexOf(columnName);
        if (columnIndex === -1) return true;

        const cellValue = row[columnIndex];
        const cellStr = cellValue === null || cellValue === undefined 
          ? "" 
          : typeof cellValue === "object" 
          ? JSON.stringify(cellValue) 
          : String(cellValue);

        // 不区分大小写的模糊匹配
        return cellStr.toLowerCase().includes(filterValue.toLowerCase());
      });
    });
  }, [result, columnFilters]);

  const handleFilterChange = (columnName: string, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [columnName]: value,
    }));
  };

  const handleClearFilter = (columnName: string) => {
    setColumnFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[columnName];
      return newFilters;
    });
  };

  const handleCopySql = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy SQL:", error);
    }
  };

  // 编辑相关处理函数
  const handleCellDoubleClick = (filteredRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    
    // 获取原始行索引（考虑过滤）
    const filteredRow = filteredRows[filteredRowIndex];
    const originalRowIndex = result.rows.findIndex((row) => row === filteredRow);
    
    if (originalRowIndex === -1) return;
    
    const cellValue = editedData.rows[originalRowIndex][cellIndex];
    setEditingCell({ row: originalRowIndex, col: cellIndex });
    setEditingValue(cellValue === null || cellValue === undefined ? "" : String(cellValue));
    
    // 聚焦输入框
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleCellInputChange = (value: string) => {
    setEditingValue(value);
  };

  const handleCellSave = (rowIndex: number, cellIndex: number) => {
    if (!editingCell || editingCell.row !== rowIndex || editingCell.col !== cellIndex) return;
    
    const column = result.columns[cellIndex];
    const oldValue = result.rows[rowIndex][cellIndex];
    const newValue = editingValue.trim() === "" ? null : editingValue;
    
    // 如果值未改变，不记录修改
    if (oldValue === newValue || String(oldValue) === String(newValue)) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }
    
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
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  // 获取原始行索引
  const getOriginalRowIndex = (filteredRowIndex: number): number => {
    const filteredRow = filteredRows[filteredRowIndex];
    return result.rows.findIndex((row) => row === filteredRow);
  };

  // 检查单元格是否在选择范围内
  const isCellSelected = (originalRowIndex: number, cellIndex: number): boolean => {
    if (!selection || originalRowIndex === -1) return false;
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    return (
      originalRowIndex >= minRow &&
      originalRowIndex <= maxRow &&
      cellIndex >= minCol &&
      cellIndex <= maxCol
    );
  };

  // 处理单元格鼠标按下
  const handleCellMouseDown = (filteredRowIndex: number, cellIndex: number, e: React.MouseEvent) => {
    if (!editMode) return;
    
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    
    // 如果正在编辑，不处理选择
    if (editingCell) return;
    
    if (e.shiftKey && selection) {
      // Shift+点击：扩展选择范围
      setSelection({
        start: selection.start,
        end: { row: originalRowIndex, col: cellIndex }
      });
    } else {
      // 普通点击或 Ctrl+点击：新选择
      setSelection({
        start: { row: originalRowIndex, col: cellIndex },
        end: { row: originalRowIndex, col: cellIndex }
      });
      dragStartRef.current = { row: originalRowIndex, col: cellIndex };
      setIsDragging(true);
    }
  };

  // 处理单元格鼠标移动（拖拽）
  const handleCellMouseMove = (filteredRowIndex: number, cellIndex: number) => {
    if (!editMode || !isDragging || !dragStartRef.current) return;
    
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    
    setSelection({
      start: dragStartRef.current,
      end: { row: originalRowIndex, col: cellIndex }
    });
  };

  // 处理鼠标释放和移动
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // 鼠标移动时，找到当前悬停的单元格
      const target = e.target as HTMLElement;
      const cell = target.closest('td');
      if (cell && cell.dataset.rowIndex !== undefined && cell.dataset.cellIndex !== undefined) {
        const filteredRowIndex = parseInt(cell.dataset.rowIndex);
        const cellIndex = parseInt(cell.dataset.cellIndex);
        handleCellMouseMove(filteredRowIndex, cellIndex);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, editMode]);

  // 批量编辑选中单元格
  const handleBatchEdit = (value: string) => {
    if (!selection) return;
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    const newEditedData = { ...editedData };
    newEditedData.rows = [...newEditedData.rows];
    const newMods = new Map(modifications);
    
    let modifiedCount = 0;
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const oldValue = result.rows[row][col];
        const newValue = value.trim() === "" ? null : value;
        
        // 如果值未改变，跳过
        if (oldValue === newValue || String(oldValue) === String(newValue)) continue;
        
        // 更新编辑数据
        if (!newEditedData.rows[row]) {
          newEditedData.rows[row] = [...editedData.rows[row]];
        }
        newEditedData.rows[row] = [...newEditedData.rows[row]];
        newEditedData.rows[row][col] = newValue;
        
        // 记录修改
        const modKey = `${row}-${col}`;
        const column = result.columns[col];
        newMods.set(modKey, {
          rowIndex: row,
          column,
          oldValue,
          newValue
        });
        
        modifiedCount++;
      }
    }
    
    if (modifiedCount > 0) {
      setEditedData(newEditedData);
      setModifications(newMods);
      addLog(`批量修改了 ${modifiedCount} 个单元格`);
    }
  };

  // 复制选中区域
  const handleCopy = async () => {
    if (!selection) return;
    
    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);
    
    const rows: string[] = [];
    
    for (let row = minRow; row <= maxRow; row++) {
      const cells: string[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        const value = editedData.rows[row]?.[col];
        cells.push(value === null || value === undefined ? '' : String(value));
      }
      rows.push(cells.join('\t'));
    }
    
    const text = rows.join('\n');
    await navigator.clipboard.writeText(text);
    addLog(`已复制 ${rows.length} 行 ${maxCol - minCol + 1} 列`);
  };

  // 粘贴数据
  const handlePaste = async () => {
    if (!selection) return;
    
    try {
      const text = await navigator.clipboard.readText();
      const lines = text.split('\n').map(line => line.split('\t'));
      
      const startRow = selection.start.row;
      const startCol = selection.start.col;
      
      const newEditedData = { ...editedData };
      newEditedData.rows = [...newEditedData.rows];
      const newMods = new Map(modifications);
      
      let pastedCount = 0;
      
      lines.forEach((line, rowOffset) => {
        line.forEach((value, colOffset) => {
          const row = startRow + rowOffset;
          const col = startCol + colOffset;
          
          if (row < newEditedData.rows.length && col < result.columns.length) {
            const oldValue = result.rows[row][col];
            const newValue = value.trim() === "" ? null : value;
            
            if (!newEditedData.rows[row]) {
              newEditedData.rows[row] = [...editedData.rows[row]];
            }
            newEditedData.rows[row] = [...newEditedData.rows[row]];
            newEditedData.rows[row][col] = newValue;
            
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
        });
      });
      
      if (pastedCount > 0) {
        setEditedData(newEditedData);
        setModifications(newMods);
        addLog(`已粘贴 ${pastedCount} 个单元格`);
      }
    } catch (error) {
      addLog(`粘贴失败: ${error}`);
    }
  };

  // 处理键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent, filteredRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    
    if (e.key === "Enter" && editingCell) {
      e.preventDefault();
      handleCellSave(editingCell.row, editingCell.col);
    } else if (e.key === "Escape" && editingCell) {
      e.preventDefault();
      handleCellCancel();
    } else if (e.key === "F2" && !editingCell) {
      e.preventDefault();
      handleCellDoubleClick(filteredRowIndex, cellIndex);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
      e.preventDefault();
      handleCopy();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
      e.preventDefault();
      handlePaste();
    } else if (e.key === 'Delete' && selection && !editingCell) {
      e.preventDefault();
      handleBatchEdit('');
    }
  };

  const handleExitEditMode = () => {
    if (modifications.size > 0) {
      // 显示确认对话框
      setShowExitConfirm(true);
    } else {
      // 没有修改，直接退出
      doExitEditMode();
    }
  };

  const doExitEditMode = () => {
    // 还原所有未保存的修改
    setEditedData(result);
    setModifications(new Map());
    setEditMode(false);
    setEditingCell(null);
    setEditingValue("");
    setSelection(null);
    setShowExitConfirm(false);
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleConfirmExit = () => {
    doExitEditMode();
  };

  const handleCancelExit = () => {
    setShowExitConfirm(false);
  };

  // 生成 UPDATE SQL 语句
  const generateUpdateSql = (): string[] => {
    if (modifications.size === 0 || !sql || !currentConnection) return [];
    
    const tableInfo = extractTableInfo(sql);
    if (!tableInfo || !tableInfo.tableName) {
      throw new Error("无法从 SQL 中提取表名，请确保 SQL 是 SELECT ... FROM table_name 格式");
    }
    
    const dbType = currentConnection.type;
    // 如果 SQL 中指定了数据库名，使用 SQL 中的；否则使用当前选择的数据库
    const databaseToUse = tableInfo.database || currentDatabase;
    const escapedTableName = buildTableName(tableInfo.tableName, dbType, databaseToUse);
    
    // 按行分组修改
    const rowMods = new Map<number, Map<string, any>>();
    
    modifications.forEach((mod) => {
      if (!rowMods.has(mod.rowIndex)) {
        rowMods.set(mod.rowIndex, new Map());
      }
      rowMods.get(mod.rowIndex)!.set(mod.column, mod.newValue);
    });
    
    // 生成 UPDATE 语句
    const sqls: string[] = [];
    
    rowMods.forEach((columns, rowIndex) => {
      // SET 子句
      const setClause = Array.from(columns.entries())
        .map(([col, val]) => {
          const escapedCol = escapeIdentifier(col, dbType);
          const escapedVal = escapeSqlValue(val, dbType);
          return `${escapedCol} = ${escapedVal}`;
        })
        .join(', ');
      
      // WHERE 子句：使用所有列的原始值来定位行
      // 注意：这不是最理想的方式，但可以在没有主键的情况下工作
      const whereConditions: string[] = [];
      const originalRow = result.rows[rowIndex];
      
      result.columns.forEach((col, colIndex) => {
        const escapedCol = escapeIdentifier(col, dbType);
        const originalValue = originalRow[colIndex];
        
        // 处理 NULL 值
        if (originalValue === null || originalValue === undefined) {
          whereConditions.push(`${escapedCol} IS NULL`);
        } else {
          const escapedVal = escapeSqlValue(originalValue, dbType);
          whereConditions.push(`${escapedCol} = ${escapedVal}`);
        }
      });
      
      const whereClause = whereConditions.join(' AND ');
      
      sqls.push(`UPDATE ${escapedTableName} SET ${setClause} WHERE ${whereClause};`);
    });
    
    return sqls;
  };

  // 保存修改到数据库
  const handleSaveChanges = async () => {
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
    setIsQuerying(true);
    
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
      const updateSqls = generateUpdateSql();
      
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
      addLog("正在刷新数据...");
      const newResult = await executeSql(currentConnectionId, sql, dbParam);
      setQueryResult(newResult);
      
      // 清除修改记录
      setModifications(new Map());
      setEditedData(newResult);
      
      addLog("数据已刷新");
    } catch (error) {
      const errorMsg = String(error);
      addLog(`保存失败: ${errorMsg}`);
      // 不抛出错误，让用户看到日志
    } finally {
      setIsSaving(false);
      setIsQuerying(false);
    }
  };

  const hasActiveFilters = Object.values(columnFilters).some(v => v.trim() !== "");

  if (!result || result.columns.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        无数据返回
      </div>
    );
  }

  return (
    <>
      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={showExitConfirm}
        title="退出编辑模式"
        message={`有 ${modifications.size} 个未保存的修改，确定要退出编辑模式吗？退出后这些修改将丢失。`}
        confirmText="确定退出"
        cancelText="取消"
        type="warning"
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />

      <div className="h-full flex flex-col">
        {/* 编辑工具栏 */}
        {editMode && (
        <div className="px-4 py-2 bg-blue-600/20 border-b border-blue-500/30 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs text-blue-400 font-semibold">编辑模式</span>
            {modifications.size > 0 && (
              <span className="text-xs text-yellow-400">
                ({modifications.size} 个未保存的修改)
              </span>
            )}
            {selection && (
              <span className="text-xs text-blue-300">
                (已选择: {
                  Math.abs(selection.end.row - selection.start.row) + 1
                } 行 × {
                  Math.abs(selection.end.col - selection.start.col) + 1
                } 列)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selection && (
              <>
                <input
                  type="text"
                  placeholder="批量编辑选中单元格..."
                  className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleBatchEdit(e.currentTarget.value);
                      e.currentTarget.value = '';
                    } else if (e.key === 'Escape') {
                      setSelection(null);
                      e.currentTarget.blur();
                    }
                  }}
                  title="输入值后按 Enter 批量编辑，按 Escape 清除选择"
                />
                <button
                  onClick={handleCopy}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  title="复制选中区域 (Ctrl+C)"
                >
                  📋 复制
                </button>
                <button
                  onClick={handlePaste}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  title="粘贴到选中区域 (Ctrl+V)"
                >
                  📄 粘贴
                </button>
                <button
                  onClick={() => setSelection(null)}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  title="清除选择"
                >
                  ✕
                </button>
              </>
            )}
            {modifications.size > 0 && (
              <button
                onClick={handleSaveChanges}
                disabled={isSaving || !currentConnectionId}
                className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-white font-medium"
                title="保存所有修改到数据库"
              >
                {isSaving ? "保存中..." : `💾 保存 (${modifications.size})`}
              </button>
            )}
            <button
              onClick={handleExitEditMode}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title="退出编辑模式"
            >
              退出编辑
            </button>
          </div>
        </div>
      )}

      {/* SQL 显示栏 */}
      {sql && (
        <div className="px-4 py-2.5 bg-gray-800/40 border-b border-gray-700/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-gray-400 font-semibold flex-shrink-0">SQL:</span>
            <code className="text-xs text-gray-300 font-mono truncate flex-1">
              {sql}
            </code>
            {hasActiveFilters && (
              <span className="text-xs text-blue-400 flex-shrink-0">
                (已过滤: {filteredRows.length} / {result.rows.length})
              </span>
            )}
            {!hasActiveFilters && (
              <span className="text-xs text-gray-500 flex-shrink-0">
                (共 {result.rows.length} 条)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 rounded transition-colors text-white font-medium"
                title="进入编辑模式（双击单元格可编辑）"
              >
                ✏️ 编辑模式
              </button>
            )}
            {hasActiveFilters && (
              <button
                onClick={() => setColumnFilters({})}
                className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                title="清除所有过滤"
              >
                清除过滤
              </button>
            )}
            <button
              onClick={handleCopySql}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/60 rounded transition-colors"
              title="复制 SQL"
            >
              {copied ? "✓ 已复制" : "📋 复制"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-900/95 sticky top-0 backdrop-blur-sm z-10 shadow-sm">
            <tr>
              {result.columns.map((column, index) => {
                const filterValue = columnFilters[column] || "";
                const hasFilter = filterValue.trim() !== "";
                const isExpanded = expandedSearchColumn === column;

                return (
                  <th
                    key={index}
                    className="px-4 py-3 text-left border-b border-gray-800/80 font-semibold text-gray-200 uppercase text-xs tracking-wider relative group"
                    style={{ minWidth: "120px" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate">{column}</span>
                      {hasFilter && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full" title="已应用过滤"></span>
                      )}
                      <button
                        onClick={() => setExpandedSearchColumn(isExpanded ? null : column)}
                        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${
                          isExpanded || hasFilter
                            ? "bg-blue-500/20 text-blue-400 opacity-100"
                            : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-300 hover:bg-gray-800/60"
                        }`}
                        title="搜索此列"
                      >
                        <span className="text-xs">🔍</span>
                      </button>
                    </div>
                    
                    {/* 搜索输入框 */}
                    {isExpanded && (
                      <div 
                        ref={(el) => { searchBoxRefs.current[column] = el; }}
                        className="absolute top-full left-0 right-0 mt-1 p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20"
                      >
                        <div className="relative">
                          <input
                            type="text"
                            value={filterValue}
                            onChange={(e) => handleFilterChange(column, e.target.value)}
                            placeholder={`搜索 ${column}...`}
                            className="w-full px-2.5 py-1.5 pl-7 bg-gray-800/60 border border-gray-700/50 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setExpandedSearchColumn(null);
                              }
                            }}
                          />
                          <span className="absolute left-2 top-1.5 text-gray-400 text-xs">🔍</span>
                          {filterValue && (
                            <button
                              onClick={() => {
                                handleClearFilter(column);
                                setExpandedSearchColumn(null);
                              }}
                              className="absolute right-2 top-1.5 text-gray-400 hover:text-white text-xs w-4 h-4 flex items-center justify-center hover:bg-gray-700/60 rounded transition-colors"
                              title="清除"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={result.columns.length}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl opacity-50">📭</span>
                    <span className="font-medium">
                      {hasActiveFilters ? "无匹配的数据" : "无数据"}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rowIndex) => {
                // 找到原始行索引
                const originalRowIndex = result.rows.findIndex((r) => r === row);
                const displayRow = originalRowIndex !== -1 ? editedData.rows[originalRowIndex] : row;
                
                return (
                  <tr
                    key={rowIndex}
                    className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors duration-150 group"
                  >
                    {displayRow.map((cell, cellIndex) => {
                      const isEditing = editingCell?.row === originalRowIndex && editingCell?.col === cellIndex;
                      const modKey = `${originalRowIndex}-${cellIndex}`;
                      const isModified = modifications.has(modKey);
                      const isSelected = isCellSelected(originalRowIndex, cellIndex);
                      
                      return (
                        <td
                          key={cellIndex}
                          data-row-index={rowIndex}
                          data-cell-index={cellIndex}
                          className={`
                            px-4 py-2.5 text-gray-300 relative
                            ${isEditing ? 'bg-blue-500/20 ring-2 ring-blue-400' : ''}
                            ${isSelected && !isEditing ? 'bg-blue-500/30 ring-1 ring-blue-400' : ''}
                            ${isModified && !isEditing && !isSelected ? 'bg-yellow-500/10 border-l-2 border-yellow-500' : ''}
                            ${editMode ? 'cursor-cell hover:bg-gray-800/60' : 'max-w-xs truncate'}
                            group-hover:text-gray-200
                            select-none
                          `}
                          title={!isEditing ? String(cell ?? "") : undefined}
                          onMouseDown={(e) => handleCellMouseDown(rowIndex, cellIndex, e)}
                          onDoubleClick={() => handleCellDoubleClick(rowIndex, cellIndex)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, cellIndex)}
                          tabIndex={editMode ? 0 : -1}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editingValue}
                              onChange={(e) => handleCellInputChange(e.target.value)}
                              onBlur={() => handleCellSave(originalRowIndex, cellIndex)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleCellSave(originalRowIndex, cellIndex);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  handleCellCancel();
                                }
                              }}
                              className="w-full bg-gray-700 text-white px-2 py-1 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              {cell === null || cell === undefined
                                ? (
                                  <span className="text-gray-500 italic font-mono text-xs">NULL</span>
                                )
                                : typeof cell === "object"
                                ? <span className="font-mono text-xs text-gray-400">{JSON.stringify(cell)}</span>
                                : <span className="font-mono text-xs">{String(cell)}</span>}
                              {isModified && (
                                <span className="absolute top-1 right-1 text-yellow-500 text-xs" title="已修改">●</span>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

