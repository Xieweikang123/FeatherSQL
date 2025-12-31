import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { type QueryResult, executeSql } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import ConfirmDialog from "./ConfirmDialog";
import { extractTableInfo, escapeIdentifier, escapeSqlValue, buildTableName } from "../lib/utils";
import { useColumnFilters } from "../hooks/useColumnFilters";
import { useEditHistory, type CellModification } from "../hooks/useEditHistory";
import { useCellSelection } from "../hooks/useCellSelection";
import EditToolbar from "./ResultTable/EditToolbar";
import SqlDisplayBar from "./ResultTable/SqlDisplayBar";
import TableHeader from "./ResultTable/TableHeader";
import TableRow from "./ResultTable/TableRow";
import TableStructure from "./TableStructure";

interface ResultTableProps {
  result: QueryResult;
  sql?: string | null;
}

interface EditingCell {
  row: number;
  col: number;
}

export default function ResultTable({ result, sql }: ResultTableProps) {
  const [expandedSearchColumn, setExpandedSearchColumn] = useState<string | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  
  // 保存原始列信息（当查询返回空结果时，保留列信息用于显示表头）
  const originalColumnsRef = useRef<string[]>([]);
  
  // 初始化时保存列信息
  if (result && result.columns.length > 0) {
    originalColumnsRef.current = result.columns;
  }
  
  // 获取连接信息（需要在 useCellSelection 之前获取 editMode）
  const { 
    currentConnectionId, 
    currentDatabase, 
    connections, 
    addLog, 
    setQueryResult,
    setIsQuerying,
    editMode, // 从 store 读取 editMode
    setEditMode // 使用 store 的 setEditMode
  } = useConnectionStore();
  
  // 使用自定义 hooks
  const { columnFilters, updateFilters, originalSqlRef } = useColumnFilters(sql);
  const { selection, setSelection, clearSelection, isDragging, setIsDragging, dragStartRef } = useCellSelection(editMode);
  
  // 编辑相关状态
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editedData, setEditedData] = useState<QueryResult>(result);
  const [modifications, setModifications] = useState<Map<string, CellModification>>(new Map());
  const [editingValue, setEditingValue] = useState<string>("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [viewingStructure, setViewingStructure] = useState<string | null>(null);
  
  // 使用编辑历史 hook
  const editHistory = useEditHistory(editedData);
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const [isSaving, setIsSaving] = useState(false);

  // 保存列信息
  useEffect(() => {
    if (result && result.columns.length > 0) {
      originalColumnsRef.current = result.columns;
    }
  }, [result]);

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
    // 如果查询返回空结果但没有列信息，使用保存的列信息
    if (result && result.columns.length === 0 && originalColumnsRef.current.length > 0) {
      const resultWithColumns = {
        ...result,
        columns: originalColumnsRef.current
      };
      setEditedData(resultWithColumns);
    } else {
      setEditedData(result);
    }
    setModifications(new Map());
    setEditingCell(null);
    clearSelectionRef.current();
    resetHistoryRef.current();
  }, [result]);

  // 构建带 WHERE 条件的 SQL
  const buildFilteredSql = (baseSql: string, filters: Record<string, string>): string => {
    if (!baseSql) return baseSql;
    
    const activeFilters = Object.entries(filters).filter(([_, value]) => value.trim() !== "");
    if (activeFilters.length === 0) return baseSql;

    // 移除注释和多余空白
    const cleaned = baseSql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    // 检查是否已经有 WHERE 子句
    const hasWhere = /\bWHERE\b/i.test(cleaned);
    
    // 构建 WHERE 条件
    const dbType = currentConnection?.type || 'sqlite';
    const conditions: string[] = [];
    
    activeFilters.forEach(([columnName, filterValue]) => {
      const escapedColumn = escapeIdentifier(columnName, dbType);
      const escapedValue = escapeSqlValue(`%${filterValue}%`, dbType);
      
      // 使用 LIKE 进行模糊匹配（不区分大小写）
      if (dbType === 'postgres') {
        conditions.push(`LOWER(${escapedColumn}::text) LIKE LOWER(${escapedValue})`);
      } else if (dbType === 'mssql') {
        conditions.push(`${escapedColumn} LIKE ${escapedValue} COLLATE SQL_Latin1_General_CP1_CI_AS`);
      } else {
        // MySQL 和 SQLite
        conditions.push(`LOWER(${escapedColumn}) LIKE LOWER(${escapedValue})`);
      }
    });

    if (conditions.length === 0) return baseSql;

    const whereClause = conditions.join(' AND ');
    
    if (hasWhere) {
      // 如果已有 WHERE，在 WHERE 后面添加 AND 条件
      // 找到 WHERE 关键字的位置
      const whereMatch = cleaned.match(/\bWHERE\b/i);
      if (whereMatch && whereMatch.index !== undefined) {
        const whereIndex = whereMatch.index + whereMatch[0].length;
        // 在 WHERE 后面添加 AND 条件
        return cleaned.slice(0, whereIndex) + ` AND (${whereClause})` + cleaned.slice(whereIndex);
      }
      // 如果找不到 WHERE 位置，回退到简单替换
      return cleaned.replace(/\bWHERE\b/i, `WHERE (${whereClause}) AND`);
    } else {
      // 如果没有 WHERE，添加 WHERE 子句
      // 找到 ORDER BY, GROUP BY, LIMIT 等子句的位置
      const orderByMatch = cleaned.match(/\bORDER\s+BY\b/i);
      const groupByMatch = cleaned.match(/\bGROUP\s+BY\b/i);
      const havingMatch = cleaned.match(/\bHAVING\b/i);
      const limitMatch = cleaned.match(/\bLIMIT\b/i);
      
      let insertPosition = cleaned.length;
      if (orderByMatch) insertPosition = Math.min(insertPosition, orderByMatch.index || cleaned.length);
      if (groupByMatch) insertPosition = Math.min(insertPosition, groupByMatch.index || cleaned.length);
      if (havingMatch) insertPosition = Math.min(insertPosition, havingMatch.index || cleaned.length);
      if (limitMatch) insertPosition = Math.min(insertPosition, limitMatch.index || cleaned.length);
      
      return cleaned.slice(0, insertPosition).trim() + ` WHERE ${whereClause} ` + cleaned.slice(insertPosition);
    }
  };

  // 执行带过滤的 SQL 查询
  const executeFilteredSql = async (filters: Record<string, string>) => {
    if (!currentConnectionId || !originalSqlRef.current) {
      return;
    }

    const activeFilters = Object.entries(filters).filter(([_, value]) => value.trim() !== "");
    
    console.log('[ResultTable] executeFilteredSql 开始', {
      filters,
      activeFilters,
      originalSql: originalSqlRef.current.substring(0, 50),
      currentColumnFilters: columnFilters
    });
    
    try {
      setIsFiltering(true);
      setIsQuerying(true);
      
      let sqlToExecute: string;
      if (activeFilters.length === 0) {
        // 没有过滤条件，使用原始 SQL
        sqlToExecute = originalSqlRef.current;
      } else {
        // 构建带 WHERE 条件的 SQL
        sqlToExecute = buildFilteredSql(originalSqlRef.current, filters);
      }
      
      addLog(`执行过滤查询: ${sqlToExecute.substring(0, 100)}...`);
      const newResult = await executeSql(
        currentConnectionId,
        sqlToExecute,
        currentDatabase || undefined
      );
      
      console.log('[ResultTable] executeFilteredSql 查询完成', {
        resultColumns: newResult.columns,
        resultRowsCount: newResult.rows.length,
        originalColumns: originalColumnsRef.current,
        currentColumnFilters: columnFilters,
        filters: filters
      });
      
      // 更新过滤器状态
      updateFilters(filters);
      
      // 如果查询返回空结果但没有列信息，尝试从保存的列信息中恢复
      if (newResult.columns.length === 0 && originalColumnsRef.current.length > 0) {
        const resultWithColumns = {
          ...newResult,
          columns: originalColumnsRef.current
        };
        setQueryResult(resultWithColumns);
      } else {
        setQueryResult(newResult);
      }
      addLog(`过滤查询成功，返回 ${newResult.rows.length} 行`);
    } catch (error) {
      const errorMsg = String(error);
      addLog(`过滤查询失败: ${errorMsg}`);
      console.error("Filtered SQL execution error:", error);
    } finally {
      setIsFiltering(false);
      setIsQuerying(false);
    }
  };

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




  // 使用保存的列信息，如果当前 result 没有列但之前有列，使用之前的列
  const displayColumns = useMemo(() => 
    (result && result.columns.length > 0) 
      ? result.columns 
      : originalColumnsRef.current,
    [result]
  );
  
  const displayRows = useMemo(() => result?.rows || [], [result]);
  
  // 计算显示的行数据（直接使用 result.rows，不再需要前端过滤）
  const filteredRows = useMemo(() => displayRows, [displayRows]);

  // 更新过滤值（不自动执行查询）
  const handleFilterChange = useCallback((columnName: string, value: string) => {
    const newFilters = {
      ...columnFilters,
      [columnName]: value,
    };
    
    if (value.trim() === "") {
      delete newFilters[columnName];
    }
    
    updateFilters(newFilters);
  }, [columnFilters, updateFilters]);

  // 手动触发查询（按 Enter 键时调用）
  const handleFilterSearch = useCallback((columnName: string) => {
    const filterValue = columnFilters[columnName] || "";
    const newFilters = { ...columnFilters };
    
    if (filterValue.trim() === "") {
      delete newFilters[columnName];
    }
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    executeFilteredSql(newFilters);
  }, [columnFilters]);

  const handleClearFilter = useCallback((columnName: string) => {
    const newFilters = { ...columnFilters };
    delete newFilters[columnName];
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    executeFilteredSql(newFilters);
  }, [columnFilters]);

  // 清除所有过滤
  const handleClearAllFilters = useCallback(() => {
    updateFilters({});
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    if (originalSqlRef.current && currentConnectionId) {
      setIsFiltering(true);
      setIsQuerying(true);
      executeSql(
        currentConnectionId,
        originalSqlRef.current,
        currentDatabase || undefined
      )
        .then((newResult) => {
          setQueryResult(newResult);
          addLog("已清除所有过滤条件");
        })
        .catch((error) => {
          const errorMsg = String(error);
          addLog(`恢复原始查询失败: ${errorMsg}`);
        })
        .finally(() => {
          setIsFiltering(false);
          setIsQuerying(false);
        });
    }
  }, [updateFilters, originalSqlRef, currentConnectionId, currentDatabase, setQueryResult, addLog, setIsQuerying]);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);


  // 编辑相关处理函数
  const handleCellDoubleClick = (filteredRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    
    // 获取原始行索引（考虑过滤）
    // filteredRows 就是 result.rows 的引用，所以 rowIndex 就是 originalRowIndex
    // 但为了兼容性，仍然尝试查找，如果找不到则使用 rowIndex
    const filteredRow = filteredRows[filteredRowIndex];
    let originalRowIndex = result.rows.findIndex((row) => row === filteredRow);
    if (originalRowIndex === -1) {
      // 如果找不到（可能是引用变化），使用 rowIndex 作为后备
      originalRowIndex = filteredRowIndex;
    }
    
    if (originalRowIndex >= editedData.rows.length) return;
    
    const cellValue = editedData.rows[originalRowIndex][cellIndex];
    setEditingCell({ row: originalRowIndex, col: cellIndex });
    setEditingValue(cellValue === null || cellValue === undefined ? "" : String(cellValue));
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
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  // 获取原始行索引
  const getOriginalRowIndex = (filteredRowIndex: number): number => {
    const filteredRow = filteredRows[filteredRowIndex];
    // filteredRows 就是 result.rows 的引用，所以 rowIndex 就是 originalRowIndex
    // 但为了兼容性，仍然尝试查找，如果找不到则使用 rowIndex
    let originalRowIndex = result.rows.findIndex((row) => row === filteredRow);
    if (originalRowIndex === -1) {
      // 如果找不到（可能是引用变化），使用 rowIndex 作为后备
      originalRowIndex = filteredRowIndex;
    }
    return originalRowIndex;
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
    
    const clickedCell = { row: originalRowIndex, col: cellIndex };
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isCurrentlySelected = selection && isCellSelected(originalRowIndex, cellIndex);
    
    if (e.shiftKey && selection) {
      // Shift+点击：扩展选择范围（从 start 到点击位置）
      setSelection({
        start: selection.start,
        end: clickedCell
      });
    } else if (isCtrlOrCmd) {
      // Ctrl+点击：只影响点击的那个单元格
      e.preventDefault();
      e.stopPropagation();
      
      if (isCurrentlySelected) {
        // 如果已选中，只取消选中点击的这个单元格，保留其他选中的单元格
        const minRow = Math.min(selection.start.row, selection.end.row);
        const maxRow = Math.max(selection.start.row, selection.end.row);
        const minCol = Math.min(selection.start.col, selection.end.col);
        const maxCol = Math.max(selection.start.col, selection.end.col);
        
        // 如果选择区域是单个单元格，清除选择
        if (minRow === maxRow && minCol === maxCol) {
          setSelection(null);
        } else {
          // 收集所有选中的单元格（排除点击的单元格）
          const remainingCells: Array<{ row: number; col: number }> = [];
          for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
              if (row !== originalRowIndex || col !== cellIndex) {
                remainingCells.push({ row, col });
              }
            }
          }
          
          // 如果没有剩余的单元格，清除选择
          if (remainingCells.length === 0) {
            setSelection(null);
          } else {
            // 计算剩余单元格的最小和最大行列，形成新的矩形选择范围
            const newMinRow = Math.min(...remainingCells.map(c => c.row));
            const newMaxRow = Math.max(...remainingCells.map(c => c.row));
            const newMinCol = Math.min(...remainingCells.map(c => c.col));
            const newMaxCol = Math.max(...remainingCells.map(c => c.col));
            
            // 验证新的矩形范围是否只包含剩余单元格（检查是否连续）
            const remainingCellsSet = new Set(remainingCells.map(c => `${c.row}-${c.col}`));
            let isValidRect = true;
            for (let row = newMinRow; row <= newMaxRow; row++) {
              for (let col = newMinCol; col <= newMaxCol; col++) {
                if (!remainingCellsSet.has(`${row}-${col}`)) {
                  isValidRect = false;
                  break;
                }
              }
              if (!isValidRect) break;
            }
            
            if (!isValidRect) {
              // 剩余单元格不连续，找到包含最多剩余单元格的连续矩形区域
              let bestRect: { minRow: number; maxRow: number; minCol: number; maxCol: number; count: number } | null = null;
              
              // 尝试所有可能的矩形组合（任意两个剩余单元格作为对角）
              for (let i = 0; i < remainingCells.length; i++) {
                for (let j = i; j < remainingCells.length; j++) {
                  const cell1 = remainingCells[i];
                  const cell2 = remainingCells[j];
                  const testMinRow = Math.min(cell1.row, cell2.row);
                  const testMaxRow = Math.max(cell1.row, cell2.row);
                  const testMinCol = Math.min(cell1.col, cell2.col);
                  const testMaxCol = Math.max(cell1.col, cell2.col);
                  
                  // 检查这个矩形是否只包含剩余单元格（连续矩形）
                  let testIsValid = true;
                  let count = 0;
                  for (let row = testMinRow; row <= testMaxRow; row++) {
                    for (let col = testMinCol; col <= testMaxCol; col++) {
                      if (remainingCellsSet.has(`${row}-${col}`)) {
                        count++;
                      } else {
                        // 矩形中包含非剩余单元格，不连续
                        testIsValid = false;
                        break;
                      }
                    }
                    if (!testIsValid) break;
                  }
                  
                  // 如果这个矩形是连续的，且包含的剩余单元格数量更多，则更新最佳矩形
                  if (testIsValid && (!bestRect || count > bestRect.count)) {
                    bestRect = { minRow: testMinRow, maxRow: testMaxRow, minCol: testMinCol, maxCol: testMaxCol, count };
                  }
                }
              }
              
              if (bestRect) {
                // 使用找到的最佳矩形（包含最多剩余单元格的连续矩形）
                const wasStartTopLeft = selection.start.row <= selection.end.row && selection.start.col <= selection.end.col;
                const wasStartTopRight = selection.start.row <= selection.end.row && selection.start.col > selection.end.col;
                const wasStartBottomLeft = selection.start.row > selection.end.row && selection.start.col <= selection.end.col;
                
                if (wasStartTopLeft) {
                  setSelection({
                    start: { row: bestRect.minRow, col: bestRect.minCol },
                    end: { row: bestRect.maxRow, col: bestRect.maxCol }
                  });
                } else if (wasStartTopRight) {
                  setSelection({
                    start: { row: bestRect.minRow, col: bestRect.maxCol },
                    end: { row: bestRect.maxRow, col: bestRect.minCol }
                  });
                } else if (wasStartBottomLeft) {
                  setSelection({
                    start: { row: bestRect.maxRow, col: bestRect.minCol },
                    end: { row: bestRect.minRow, col: bestRect.maxCol }
                  });
                } else {
                  setSelection({
                    start: { row: bestRect.maxRow, col: bestRect.maxCol },
                    end: { row: bestRect.minRow, col: bestRect.minCol }
                  });
                }
              } else {
                // 找不到任何连续矩形，尝试选择包含最多剩余单元格的单个单元格区域
                // 对于单个单元格，每个单元格都是一个"矩形"，包含1个剩余单元格
                // 所以应该选择第一个剩余单元格（因为所有单个单元格都包含相同数量的剩余单元格）
                // 但为了更好的用户体验，我们选择最靠近原选择中心的剩余单元格
                
                // 计算原选择的中心点
                const centerRow = Math.floor((minRow + maxRow) / 2);
                const centerCol = Math.floor((minCol + maxCol) / 2);
                
                // 找到距离中心点最近的剩余单元格
                let closestCell = remainingCells[0];
                let minDistance = Math.abs(remainingCells[0].row - centerRow) + Math.abs(remainingCells[0].col - centerCol);
                
                for (let i = 1; i < remainingCells.length; i++) {
                  const cell = remainingCells[i];
                  const distance = Math.abs(cell.row - centerRow) + Math.abs(cell.col - centerCol);
                  if (distance < minDistance) {
                    minDistance = distance;
                    closestCell = cell;
                  }
                }
                
                setSelection({
                  start: closestCell,
                  end: closestCell
                });
              }
            } else {
              // 剩余单元格连续，可以形成矩形选择
              // 保持 start 和 end 的相对位置
              const wasStartTopLeft = selection.start.row <= selection.end.row && selection.start.col <= selection.end.col;
              const wasStartTopRight = selection.start.row <= selection.end.row && selection.start.col > selection.end.col;
              const wasStartBottomLeft = selection.start.row > selection.end.row && selection.start.col <= selection.end.col;
              
              if (wasStartTopLeft) {
                setSelection({
                  start: { row: newMinRow, col: newMinCol },
                  end: { row: newMaxRow, col: newMaxCol }
                });
              } else if (wasStartTopRight) {
                setSelection({
                  start: { row: newMinRow, col: newMaxCol },
                  end: { row: newMaxRow, col: newMinCol }
                });
              } else if (wasStartBottomLeft) {
                setSelection({
                  start: { row: newMaxRow, col: newMinCol },
                  end: { row: newMinRow, col: newMaxCol }
                });
              } else {
                setSelection({
                  start: { row: newMaxRow, col: newMaxCol },
                  end: { row: newMinRow, col: newMinCol }
                });
              }
            }
          }
        }
      } else {
        // 如果未选中，追加到已选择（扩展选择范围以包含这个单元格）
        if (!selection) {
          // 没有选择，创建新选择
          setSelection({
            start: clickedCell,
            end: clickedCell
          });
        } else {
          // 有选择，扩展选择范围以包含点击的单元格
          const minRow = Math.min(selection.start.row, selection.end.row, originalRowIndex);
          const maxRow = Math.max(selection.start.row, selection.end.row, originalRowIndex);
          const minCol = Math.min(selection.start.col, selection.end.col, cellIndex);
          const maxCol = Math.max(selection.start.col, selection.end.col, cellIndex);
          
          setSelection({
            start: { row: minRow, col: minCol },
            end: { row: maxRow, col: maxCol }
          });
        }
      }
      
      dragStartRef.current = null;
      setIsDragging(false);
    } else {
      // 普通点击：创建新选择
      setSelection({
        start: clickedCell,
        end: clickedCell
      });
      dragStartRef.current = clickedCell;
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
    
    // 保存当前状态到历史栈（在修改之前）
    saveToHistory();
    
    const newEditedData = { ...editedData };
    newEditedData.rows = [...newEditedData.rows];
    const newMods = new Map(modifications);
    
    let modifiedCount = 0;
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        // 获取原始值和当前编辑后的值
        const originalValue = result.rows[row][col];
        const currentValue = editedData.rows[row]?.[col];
        
        // 确定新值：如果当前值等于原始值，说明是第一次输入，直接设置；否则追加
        let newValue: string | null;
        if (value.trim() === "") {
          newValue = null;
        } else {
          // 如果当前值等于原始值，说明是第一次输入，直接设置
          // 否则，追加到当前值后面
          if (currentValue === originalValue || String(currentValue) === String(originalValue)) {
            newValue = value;
          } else {
            // 追加模式：将新字符追加到当前值后面
            const currentStr = currentValue === null || currentValue === undefined ? "" : String(currentValue);
            newValue = currentStr + value;
          }
        }
        
        // 如果值未改变，跳过（避免不必要的更新）
        const oldValueForCompare = currentValue !== undefined ? currentValue : originalValue;
        if (oldValueForCompare === newValue || String(oldValueForCompare) === String(newValue)) continue;
        
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
      
      // 计算选择区域的范围
      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);
      const minCol = Math.min(selection.start.col, selection.end.col);
      const maxCol = Math.max(selection.start.col, selection.end.col);
      
      const newEditedData = { ...editedData };
      newEditedData.rows = [...newEditedData.rows];
      const newMods = new Map(modifications);
      
      let pastedCount = 0;
      
      // 判断是否为单个值粘贴（只有一行一列）
      const isSingleValue = parsedLines.length === 1 && parsedLines[0].length === 1;
      const singleValue = isSingleValue ? (parsedLines[0][0].trim() === "" ? null : parsedLines[0][0].trim()) : null;
      
      // 遍历选择区域内的所有单元格
      for (let row = minRow; row <= maxRow; row++) {
        // 如果超出数据范围，跳过
        if (row >= newEditedData.rows.length) {
          continue;
        }
        
        // 确保行数据存在
        if (!newEditedData.rows[row]) {
          newEditedData.rows[row] = [...editedData.rows[row]];
        }
        newEditedData.rows[row] = [...newEditedData.rows[row]];
        
        for (let col = minCol; col <= maxCol; col++) {
          // 如果超出列范围，跳过
          if (col >= result.columns.length) {
            continue;
          }
          
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
          
          const oldValue = result.rows[row][col];
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
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      handleRedo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
      e.preventDefault();
      handleCopy();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
      e.preventDefault();
      handlePaste();
    } else if (e.key === 'Delete' && selection && !editingCell) {
      e.preventDefault();
      handleBatchEdit('');
    } else if (!editingCell && selection && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 直接输入字符时，如果有选中单元格，进行批量编辑
      e.preventDefault();
      // 将输入的字符应用到所有选中的单元格
      handleBatchEdit(e.key);
    }
  };

  // 全局键盘快捷键处理
  useEffect(() => {
    if (!editMode) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框中，不处理全局快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
        e.preventDefault();
        handlePaste();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
        e.preventDefault();
        handleCopy();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [editMode, handleUndo, handleRedo, handlePaste, handleCopy, editingCell, selection, filteredRows, result.rows, editedData]);

  const handleExitEditMode = () => {
    if (modifications.size > 0) {
      // 显示确认对话框
      setShowExitConfirm(true);
    } else {
      // 没有修改，直接退出
      doExitEditMode();
    }
  };

  const doExitEditMode = useCallback(() => {
    setEditedData(result);
    setModifications(new Map());
    setEditMode(false);
    setEditingCell(null);
    setEditingValue("");
    clearSelection();
    setShowExitConfirm(false);
  }, [result, setEditMode, clearSelection]);

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

  const hasActiveFilters = useMemo(() => 
    Object.values(columnFilters).some(v => v.trim() !== ""), 
    [columnFilters]
  );
  
  const filteredSql = useMemo(() => {
    if (!hasActiveFilters || !sql) return sql;
    return buildFilteredSql(originalSqlRef.current || sql, columnFilters);
  }, [hasActiveFilters, sql, columnFilters]);

  // 从 SQL 中提取表名
  const tableInfo = useMemo(() => {
    if (!sql) return null;
    return extractTableInfo(sql);
  }, [sql]);

  // 处理查看表结构
  const handleViewStructure = () => {
    if (tableInfo && tableInfo.tableName) {
      setViewingStructure(tableInfo.tableName);
    }
  };

  // 如果正在查看表结构，显示表结构组件
  if (viewingStructure) {
    return (
      <TableStructure
        tableName={viewingStructure}
        onClose={() => setViewingStructure(null)}
      />
    );
  }

  // 只有在完全没有 result 或完全没有列信息时才显示"无数据返回"
  // 如果 result 存在但只是没有行数据，应该显示表格结构
  if (!result) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--neu-text-light)' }}>
        无数据返回
      </div>
    );
  }
  
  // 如果完全没有列信息（包括保存的列信息），显示"无数据返回"
  if (displayColumns.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--neu-text-light)' }}>
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
        {editMode && (
          <EditToolbar
            modificationsCount={modifications.size}
            selection={selection}
            canUndo={editHistory.canUndo}
            canRedo={editHistory.canRedo}
            isSaving={isSaving}
            hasConnection={!!currentConnectionId}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClearSelection={clearSelection}
            onSave={handleSaveChanges}
            onExit={handleExitEditMode}
          />
        )}

        {sql && (
          <SqlDisplayBar
            sql={sql}
            filteredSql={filteredSql || null}
            hasActiveFilters={hasActiveFilters}
            isFiltering={isFiltering}
            rowCount={displayRows.length}
            editMode={editMode}
            canViewStructure={!!tableInfo?.tableName}
            onEnterEditMode={() => setEditMode(true)}
            onClearFilters={handleClearAllFilters}
            onViewStructure={handleViewStructure}
          />
        )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <TableHeader
            columns={displayColumns}
            columnFilters={columnFilters}
            expandedSearchColumn={expandedSearchColumn}
            isFiltering={isFiltering}
            onFilterChange={handleFilterChange}
            onFilterSearch={handleFilterSearch}
            onClearFilter={handleClearFilter}
            onExpandSearch={setExpandedSearchColumn}
          />
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={displayColumns.length}
                  className="px-4 py-12 text-center"
                  style={{ color: 'var(--neu-text-light)' }}
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
                let originalRowIndex = result.rows.findIndex((r) => r === row);
                if (originalRowIndex === -1) {
                  originalRowIndex = rowIndex;
                }
                const displayRow = originalRowIndex < editedData.rows.length ? editedData.rows[originalRowIndex] : row;
                
                return (
                  <TableRow
                    key={rowIndex}
                    row={displayRow}
                    rowIndex={rowIndex}
                    originalRowIndex={originalRowIndex}
                    columns={displayColumns}
                    editMode={editMode}
                    editingCell={editingCell}
                    editingValue={editingValue}
                    modifications={modifications}
                    selection={selection}
                    isCellSelected={isCellSelected}
                    onCellMouseDown={handleCellMouseDown}
                    onCellDoubleClick={handleCellDoubleClick}
                    onCellKeyDown={handleKeyDown}
                    onCellInputChange={handleCellInputChange}
                    onCellSave={handleCellSave}
                    onCellCancel={handleCellCancel}
                  />
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

