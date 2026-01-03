import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { type QueryResult, executeSql } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import ConfirmDialog from "./ConfirmDialog";
import { extractTableInfo } from "../lib/utils";
import { useColumnFilters } from "../hooks/useColumnFilters";
import { useCellSelection } from "../hooks/useCellSelection";
import { useTableEditing } from "../hooks/useTableEditing";
import { buildFilteredAndSortedSql, generateInsertSql as generateInsertSqlUtil, generateUpdateSqlForRows as generateUpdateSqlForRowsUtil } from "../utils/sqlGenerator";
import EditToolbar from "./ResultTable/EditToolbar";
import SqlDisplayBar from "./ResultTable/SqlDisplayBar";
import TableHeader from "./ResultTable/TableHeader";
import TableBody from "./ResultTable/TableBody";
import EmptyState from "./ResultTable/EmptyState";
import TableStructure from "./TableStructure";
import ContextMenu from "./ResultTable/ContextMenu";
import { exportToCsv, exportToJson, exportToExcel, type ExportFormat } from "../utils/exportUtils";
import Pagination from "./ResultTable/Pagination";

interface ResultTableProps {
  result: QueryResult;
  sql?: string | null;
}

export default function ResultTable({ result, sql }: ResultTableProps) {
  const [expandedSearchColumn, setExpandedSearchColumn] = useState<string | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  
  // 保存原始列信息（当查询返回空结果时，保留列信息用于显示表头）
  const originalColumnsRef = useRef<string[]>([]);
  
  // 保存原始查询结果（用于索引映射和oldValue获取）
  const originalResultRef = useRef<QueryResult | null>(null);
  
  // 初始化时保存列信息和原始结果
  if (result && result.columns.length > 0) {
    originalColumnsRef.current = result.columns;
  }
  if (result) {
    originalResultRef.current = result;
  }
  
  // 获取连接信息（需要在 useCellSelection 之前获取 editMode）
  const { 
    currentConnectionId, 
    currentDatabase, 
    connections, 
    addLog, 
    getCurrentTab,
    updateTab,
    editMode, // 从 store 读取 editMode
    setEditMode // 使用 store 的 setEditMode
  } = useConnectionStore();
  
  // 获取当前标签页
  const currentTab = getCurrentTab();
  const tabColumnFilters = currentTab?.columnFilters || {};
  
  // 使用自定义 hooks（使用标签页的 columnFilters）
  const { columnFilters, updateFilters, originalSqlRef } = useColumnFilters(sql, tabColumnFilters);
  
  // 同步 columnFilters 到标签页
  useEffect(() => {
    if (currentTab && JSON.stringify(columnFilters) !== JSON.stringify(tabColumnFilters)) {
      updateTab(currentTab.id, { columnFilters });
    }
  }, [columnFilters, currentTab, tabColumnFilters, updateTab]);
  const { 
    selection, 
    clearSelection, 
    isDragging, 
    setIsDragging, 
    dragStartRef,
    isCellSelected: isCellSelectedHook,
    addCellToSelection,
    removeCellFromSelection,
    setRectSelection
  } = useCellSelection(editMode);
  
  // UI 状态
  const [viewingStructure, setViewingStructure] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowIndex: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  
  // 排序状态
  const [sortConfig, setSortConfig] = useState<Array<{ column: string; direction: 'asc' | 'desc' }>>([]);
  
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  
  // 使用编辑 hook
  const editing = useTableEditing({
    result,
    editMode,
    currentConnectionId,
    currentConnection: currentConnection || null,
    currentDatabase,
    sql: sql || null,
    addLog,
    updateTab,
    currentTab,
    clearSelection,
    originalResultRef,
  });

  // Extract setEditedData for stable reference
  const setEditedData = editing.setEditedData;

  // 保存列信息和原始结果
  useEffect(() => {
    if (result && result.columns.length > 0) {
      originalColumnsRef.current = result.columns;
    }
    // 只有当SQL变化时才更新原始结果（表示新的查询）
    if (sql && sql !== originalSqlRef.current) {
      originalResultRef.current = result;
    }
  }, [result, sql]);

  // 当 result 变化时，重置分页和排序
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
    setSelectedRows(new Set());
    setContextMenu(null);
    // 重置到第一页
    setCurrentPage(1);
    setSortConfig([]); // 重置排序
  }, [result, setEditedData]);

  // 构建带 WHERE 条件和 ORDER BY 的 SQL（使用工具函数）
  const buildFilteredAndSortedSqlCallback = useCallback((
    baseSql: string, 
    filters: Record<string, string>,
    sortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>
  ): string => {
    const dbType = currentConnection?.type || 'sqlite';
    return buildFilteredAndSortedSql(baseSql, filters, sortConfig, dbType);
  }, [currentConnection]);

  // 执行带过滤和排序的 SQL 查询
  const executeFilteredAndSortedSql = useCallback(async (filters: Record<string, string>, sortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>) => {
    if (!currentConnectionId || !originalSqlRef.current) {
      return;
    }

    if (!currentTab) return;
    
    // 检查是否有未保存的修改
    if (editMode && editing.modifications.size > 0) {
      const shouldContinue = window.confirm(
        `有 ${editing.modifications.size} 个未保存的修改。应用过滤/排序将清除这些修改，确定要继续吗？`
      );
      if (!shouldContinue) {
        return;
      }
      // 用户确认后，清除修改
      editing.setModifications(new Map());
      editing.setEditedData(result);
      editing.editHistory.reset();
    }
    
    const activeFilters = Object.entries(filters).filter(([_, value]) => value.trim() !== "");
    
    try {
      setIsFiltering(true);
      updateTab(currentTab.id, { isQuerying: true });
      
      let sqlToExecute: string;
      if (activeFilters.length === 0 && sortConfig.length === 0) {
        // 没有过滤条件和排序，使用原始 SQL
        sqlToExecute = originalSqlRef.current;
      } else {
        // 构建带 WHERE 条件和 ORDER BY 的 SQL
        sqlToExecute = buildFilteredAndSortedSqlCallback(originalSqlRef.current, filters, sortConfig);
      }
      
      addLog(`执行过滤查询: ${sqlToExecute.substring(0, 100)}...`);
      const newResult = await executeSql(
        currentConnectionId,
        sqlToExecute,
        currentDatabase || undefined
      );
      
      // 更新过滤器状态
      updateFilters(filters);
      
      // 如果查询返回空结果但没有列信息，尝试从保存的列信息中恢复
      if (newResult.columns.length === 0 && originalColumnsRef.current.length > 0) {
        const resultWithColumns = {
          ...newResult,
          columns: originalColumnsRef.current
        };
        updateTab(currentTab.id, { queryResult: resultWithColumns, error: null, isQuerying: false });
      } else {
        updateTab(currentTab.id, { queryResult: newResult, error: null, isQuerying: false });
      }
      // 过滤后重置到第一页
      setCurrentPage(1);
      addLog(`过滤查询成功，返回 ${newResult.rows.length} 行`);
    } catch (error) {
      const errorMsg = String(error);
      addLog(`过滤查询失败: ${errorMsg}`);
      console.error("Filtered SQL execution error:", error);
      if (currentTab) {
        updateTab(currentTab.id, { isQuerying: false });
      }
    } finally {
      setIsFiltering(false);
    }
    }, [currentConnectionId, originalSqlRef, currentDatabase, buildFilteredAndSortedSqlCallback, updateFilters, addLog, currentTab, updateTab, editMode, editing, result]);




  // 使用保存的列信息，如果当前 result 没有列但之前有列，使用之前的列
  const displayColumns = useMemo(() => 
    (result && result.columns.length > 0) 
      ? result.columns 
      : originalColumnsRef.current,
    [result]
  );
  
  const displayRows = useMemo(() => result?.rows || [], [result]);
  
  // 计算显示的行数据（排序已在数据库层面完成，这里直接返回）
  const filteredRows = useMemo(() => displayRows, [displayRows]);
  
  // 建立过滤后的索引到原始索引的映射
  // 如果result.rows是原始结果，则映射是1:1；如果是过滤后的结果，需要建立映射
  const filteredToOriginalIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    const originalResult = originalResultRef.current;
    
    if (!originalResult || !result) {
      // 如果没有原始结果，假设当前result就是原始的
      filteredRows.forEach((_, index) => {
        map.set(index, index);
      });
      return map;
    }
    
    // 如果result.rows和originalResult.rows相同，说明没有过滤
    if (result.rows === originalResult.rows) {
      filteredRows.forEach((_, index) => {
        map.set(index, index);
      });
      return map;
    }
    
    // 建立映射：对于每个过滤后的行，找到它在原始结果中的索引
    filteredRows.forEach((filteredRow, filteredIndex) => {
      const originalIndex = originalResult.rows.findIndex((originalRow) => {
        // 深度比较行数据
        if (originalRow.length !== filteredRow.length) return false;
        return originalRow.every((val, i) => val === filteredRow[i]);
      });
      if (originalIndex !== -1) {
        map.set(filteredIndex, originalIndex);
      } else {
        // 如果找不到，可能是新行或数据已变化，使用索引本身
        map.set(filteredIndex, filteredIndex);
      }
    });
    
    return map;
  }, [filteredRows, result, originalResultRef.current]);
  
  // 分页计算
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredRows.slice(startIndex, endIndex);
  }, [filteredRows, currentPage, pageSize]);
  
  // 当页码超出范围时，调整到有效范围
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  
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
    
    executeFilteredAndSortedSql(newFilters, sortConfig);
  }, [columnFilters, sortConfig, executeFilteredAndSortedSql]);

  const handleClearFilter = useCallback((columnName: string) => {
    const newFilters = { ...columnFilters };
    delete newFilters[columnName];
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    executeFilteredAndSortedSql(newFilters, sortConfig);
  }, [columnFilters, sortConfig, executeFilteredAndSortedSql]);

  // 清除所有过滤
  const handleClearAllFilters = useCallback(() => {
    updateFilters({});
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // 清除过滤但保留排序
    executeFilteredAndSortedSql({}, sortConfig);
  }, [updateFilters, sortConfig, executeFilteredAndSortedSql]);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);


  // 编辑相关处理函数（使用 editing hook）
  const handleCellDoubleClick = (filteredRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    editing.handleCellDoubleClick(originalRowIndex, cellIndex);
  };

  const handleCellInputChange = editing.handleCellInputChange;
  const handleCellSave = editing.handleCellSave;
  const handleCellCancel = editing.handleCellCancel;

  // 获取原始行索引
  const getOriginalRowIndex = useCallback((filteredRowIndex: number): number => {
    // 使用映射表获取原始索引
    const originalIndex = filteredToOriginalIndexMap.get(filteredRowIndex);
    if (originalIndex !== undefined) {
      return originalIndex;
    }
    // 如果映射表中没有，尝试直接查找
    const filteredRow = filteredRows[filteredRowIndex];
    if (!filteredRow) return -1;
    
    const originalResult = originalResultRef.current;
    if (!originalResult) {
      // 没有原始结果，假设当前索引就是原始索引
      return filteredRowIndex;
    }
    
    // 在原始结果中查找
    const foundIndex = originalResult.rows.findIndex((originalRow) => {
      if (originalRow.length !== filteredRow.length) return false;
      return originalRow.every((val, i) => val === filteredRow[i]);
    });
    
    return foundIndex !== -1 ? foundIndex : filteredRowIndex;
  }, [filteredRows, filteredToOriginalIndexMap]);

  // 检查单元格是否在选择范围内
  const isCellSelected = useCallback((originalRowIndex: number, cellIndex: number): boolean => {
    if (originalRowIndex === -1) return false;
    return isCellSelectedHook(originalRowIndex, cellIndex);
  }, [isCellSelectedHook]);

  // 处理单元格鼠标按下
  const handleCellMouseDown = (filteredRowIndex: number, cellIndex: number, e: React.MouseEvent) => {
    if (!editMode) return;
    
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    
    // 如果正在编辑，不处理选择
    if (editing.editingCell) return;
    
    const clickedCell = { row: originalRowIndex, col: cellIndex };
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isCurrentlySelected = selection && isCellSelected(originalRowIndex, cellIndex);
    
    if (e.shiftKey && selection && selection.range) {
      // Shift+点击：扩展选择范围（从 range.start 到点击位置）
      setRectSelection(selection.range.start, clickedCell);
    } else if (isCtrlOrCmd) {
      // Ctrl+点击：只影响点击的那个单元格
      e.preventDefault();
      e.stopPropagation();
      
      if (isCurrentlySelected) {
        // 如果已选中，只取消选中点击的这个单元格，保留其他选中的单元格
        removeCellFromSelection(originalRowIndex, cellIndex);
      } else {
        // 如果未选中，添加到选择中
        addCellToSelection(originalRowIndex, cellIndex);
      }
      
      dragStartRef.current = null;
      setIsDragging(false);
    } else {
      // 普通点击：创建新选择
      setRectSelection(clickedCell, clickedCell);
      dragStartRef.current = clickedCell;
      setIsDragging(true);
    }
  };

  // 处理单元格鼠标移动（拖拽）
  const handleCellMouseMove = (filteredRowIndex: number, cellIndex: number) => {
    if (!editMode || !isDragging || !dragStartRef.current) return;
    
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    
    setRectSelection(dragStartRef.current, { row: originalRowIndex, col: cellIndex });
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

  // 批量编辑、复制、粘贴（使用 editing hook）
  const handleBatchEdit = (value: string) => {
    editing.handleBatchEdit(value, selection);
  };

  const handleCopy = () => {
    editing.handleCopy(selection);
  };

  const handlePaste = () => {
    editing.handlePaste(selection);
  };

  // 处理键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent, filteredRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    
    if (e.key === "Enter" && editing.editingCell) {
      e.preventDefault();
      editing.handleCellSave(editing.editingCell.row, editing.editingCell.col);
    } else if (e.key === "Escape" && editing.editingCell) {
      e.preventDefault();
      editing.handleCellCancel();
    } else if (e.key === "F2" && !editing.editingCell) {
      e.preventDefault();
      handleCellDoubleClick(filteredRowIndex, cellIndex);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      editing.handleUndo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      editing.handleRedo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
      e.preventDefault();
      handleCopy();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
      e.preventDefault();
      handlePaste();
    } else if (e.key === 'Delete' && selection && !editing.editingCell) {
      e.preventDefault();
      handleBatchEdit('');
    } else if (!editing.editingCell && selection && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 直接输入字符时，如果有选中单元格，进行批量编辑
      e.preventDefault();
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
        editing.handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        editing.handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection) {
        e.preventDefault();
        editing.handlePaste(selection);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
        e.preventDefault();
        editing.handleCopy(selection);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [editMode, editing, handlePaste, handleCopy, selection]);

  const handleExitEditMode = () => {
    editing.handleExitEditMode(setEditMode);
  };

  const handleConfirmExit = () => {
    editing.handleConfirmExit(setEditMode);
  };

  const handleCancelExit = editing.handleCancelExit;

  // 保存修改到数据库（使用 editing hook）
  const handleSaveChanges = editing.handleSaveChanges;

  const hasActiveFilters = useMemo(() => 
    Object.values(columnFilters).some(v => v.trim() !== ""), 
    [columnFilters]
  );
  
  const filteredSql = useMemo(() => {
    if (!sql) return sql;
    // 如果有过滤或排序，构建完整的 SQL
    if (hasActiveFilters || sortConfig.length > 0) {
      const dbType = currentConnection?.type || 'sqlite';
      return buildFilteredAndSortedSql(originalSqlRef.current || sql, columnFilters, sortConfig, dbType);
    }
    return sql;
  }, [hasActiveFilters, sql, columnFilters, sortConfig, currentConnection, originalSqlRef]);

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

  // 处理列头排序
  const handleSort = useCallback((column: string, e: React.MouseEvent) => {
    const isShiftKey = e.shiftKey;
    
    setSortConfig(prev => {
      // 查找该列是否已存在排序配置
      const existingIndex = prev.findIndex(s => s.column === column);
      
      let newConfig: Array<{ column: string; direction: 'asc' | 'desc' }>;
      
      if (isShiftKey) {
        // Shift+点击：添加或更新多列排序
        if (existingIndex !== -1) {
          // 如果已存在，切换排序方向
          newConfig = [...prev];
          newConfig[existingIndex] = {
            column,
            direction: newConfig[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          };
        } else {
          // 如果不存在，添加新的排序
          newConfig = [...prev, { column, direction: 'asc' }];
        }
      } else {
        // 普通点击：单列排序，清除其他排序
        if (existingIndex !== -1 && prev.length === 1) {
          // 如果只有这一列且已存在，切换方向
          newConfig = [{
            column,
            direction: prev[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          }];
        } else {
          // 否则，设置为新的单列排序
          newConfig = [{ column, direction: 'asc' }];
        }
      }
      
      // 排序配置改变后，重新执行查询
      executeFilteredAndSortedSql(columnFilters, newConfig);
      
      // 排序改变时重置到第一页
      setCurrentPage(1);
      
      return newConfig;
    });
  }, [columnFilters, executeFilteredAndSortedSql]);

  // 处理序号列点击，选中整行
  const handleRowNumberClick = useCallback((filteredRowIndex: number, e: React.MouseEvent) => {
    if (!editMode) return;
    
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    
    if (isShift && selectedRows.size > 0) {
      // Shift+点击：选择从上次选中的行到当前行的范围
      const lastSelected = Math.max(...Array.from(selectedRows));
      const minRow = Math.min(lastSelected, originalRowIndex);
      const maxRow = Math.max(lastSelected, originalRowIndex);
      const newSelectedRows = new Set(selectedRows);
      for (let i = minRow; i <= maxRow; i++) {
        newSelectedRows.add(i);
      }
      setSelectedRows(newSelectedRows);
      
      // 同时选中这些行的所有单元格
      const newSelection: Set<string> = new Set();
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = 0; col < displayColumns.length; col++) {
          newSelection.add(`${row}-${col}`);
        }
      }
      setRectSelection(
        { row: minRow, col: 0 },
        { row: maxRow, col: displayColumns.length - 1 }
      );
    } else if (isCtrlOrCmd) {
      // Ctrl+点击：切换行选择
      const newSelectedRows = new Set(selectedRows);
      if (newSelectedRows.has(originalRowIndex)) {
        newSelectedRows.delete(originalRowIndex);
        // 取消选中该行的所有单元格
        for (let col = 0; col < displayColumns.length; col++) {
          removeCellFromSelection(originalRowIndex, col);
        }
      } else {
        newSelectedRows.add(originalRowIndex);
        // 选中该行的所有单元格
        for (let col = 0; col < displayColumns.length; col++) {
          addCellToSelection(originalRowIndex, col);
        }
      }
      setSelectedRows(newSelectedRows);
    } else {
      // 普通点击：只选中当前行
      setSelectedRows(new Set([originalRowIndex]));
      // 选中该行的所有单元格
      setRectSelection(
        { row: originalRowIndex, col: 0 },
        { row: originalRowIndex, col: displayColumns.length - 1 }
      );
    }
  }, [editMode, selectedRows, displayColumns.length, getOriginalRowIndex, setRectSelection, addCellToSelection, removeCellFromSelection]);

  // 处理右键菜单
  const handleRowContextMenu = useCallback((filteredRowIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const originalRowIndex = getOriginalRowIndex(filteredRowIndex);
    if (originalRowIndex === -1) return;
    
    // 如果右键点击的行不在选中列表中，先选中它
    if (!selectedRows.has(originalRowIndex)) {
      setSelectedRows(new Set([originalRowIndex]));
      setRectSelection(
        { row: originalRowIndex, col: 0 },
        { row: originalRowIndex, col: displayColumns.length - 1 }
      );
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      rowIndex: originalRowIndex,
    });
  }, [selectedRows, displayColumns.length, getOriginalRowIndex, setRectSelection]);

  // 生成 INSERT 和 UPDATE 语句（使用工具函数）
  const generateInsertSqlCallback = useCallback((): string | null => {
    if (!sql || !currentConnection || selectedRows.size === 0) return null;
    return generateInsertSqlUtil(
      selectedRows,
      sql,
      editing.editedData,
      displayColumns,
      currentConnection as any,
      currentDatabase
    );
  }, [sql, currentConnection, selectedRows, displayColumns, currentDatabase, editing.editedData]);

  const generateUpdateSqlForRowsCallback = useCallback((): string | null => {
    if (!sql || !currentConnection || selectedRows.size === 0) return null;
    return generateUpdateSqlForRowsUtil(
      selectedRows,
      sql,
      editing.editedData,
      result,
      displayColumns,
      currentConnection as any,
      currentDatabase
    );
  }, [sql, currentConnection, selectedRows, displayColumns, currentDatabase, editing.editedData, result]);

  // 处理生成 INSERT 语句
  const handleGenerateInsert = useCallback(() => {
    const insertSql = generateInsertSqlCallback();
    if (insertSql) {
      navigator.clipboard.writeText(insertSql);
      addLog(`已生成并复制 INSERT 语句（${selectedRows.size} 行）`);
    } else {
      addLog("错误: 无法生成 INSERT 语句");
    }
  }, [generateInsertSqlCallback, selectedRows.size, addLog]);

  // 处理生成 UPDATE 语句
  const handleGenerateUpdate = useCallback(() => {
    const updateSql = generateUpdateSqlForRowsCallback();
    if (updateSql) {
      navigator.clipboard.writeText(updateSql);
      addLog(`已生成并复制 UPDATE 语句（${selectedRows.size} 行）`);
    } else {
      addLog("错误: 无法生成 UPDATE 语句");
    }
  }, [generateUpdateSqlForRowsCallback, selectedRows.size, addLog]);

  // 处理数据导出
  const handleExport = useCallback(async (format: ExportFormat, exportSelected: boolean) => {
    try {
      let rowsToExport: any[][];
      let baseFilename: string;

      if (exportSelected && selectedRows.size > 0) {
        // 导出选中行
        const selectedRowIndices = Array.from(selectedRows).sort((a, b) => a - b);
        rowsToExport = selectedRowIndices
          .filter(rowIndex => rowIndex < editing.editedData.rows.length)
          .map(rowIndex => editing.editedData.rows[rowIndex]);
        baseFilename = `export_selected_${selectedRows.size}_rows`;
      } else {
        // 导出全部数据
        rowsToExport = editing.editedData.rows;
        baseFilename = `export_all_${rowsToExport.length}_rows`;
      }

      if (rowsToExport.length === 0) {
        addLog("导出失败: 没有可导出的数据");
        return;
      }

      // 尝试从 SQL 中提取表名
      if (sql) {
        const tableInfo = extractTableInfo(sql);
        if (tableInfo && tableInfo.tableName) {
          // 如果有数据库名，也添加到文件名中
          if (tableInfo.database) {
            baseFilename = `${tableInfo.database}_${tableInfo.tableName}`;
          } else {
            baseFilename = tableInfo.tableName;
          }
        }
      }

      // 添加时间戳到文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${baseFilename}_${timestamp}`;

      const exportData = {
        columns: displayColumns,
        rows: rowsToExport,
      };

      // 根据格式确定文件扩展名
      const extensions: Record<ExportFormat, string> = {
        csv: 'csv',
        json: 'json',
        excel: 'xlsx'
      };
      const extension = extensions[format];

      // 使用浏览器下载方式（Tauri 环境下会自动保存到下载目录）
      const fullFilename = `${filename}.${extension}`;
      
      switch (format) {
        case 'csv':
          exportToCsv(exportData, filename);
          addLog(`✓ 已导出 ${rowsToExport.length} 行数据为 CSV 格式`);
          addLog(`文件名: ${fullFilename}`);
          addLog(`文件已保存到下载目录`);
          break;
        case 'json':
          exportToJson(exportData, filename);
          addLog(`✓ 已导出 ${rowsToExport.length} 行数据为 JSON 格式`);
          addLog(`文件名: ${fullFilename}`);
          addLog(`文件已保存到下载目录`);
          break;
        case 'excel':
          try {
            exportToExcel(exportData, filename);
            addLog(`✓ 已导出 ${rowsToExport.length} 行数据为 Excel 格式`);
            addLog(`文件名: ${fullFilename}`);
            addLog(`文件已保存到下载目录`);
          } catch (excelError) {
            const excelErrorMsg = excelError instanceof Error ? excelError.message : String(excelError);
            addLog(`Excel 导出失败: ${excelErrorMsg}`);
            console.error('Excel export error:', excelError);
          }
          break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`导出失败: ${errorMsg}`);
      console.error('导出错误:', error);
    }
  }, [selectedRows, editing.editedData.rows, displayColumns, addLog, sql]);

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
        isOpen={editing.showExitConfirm}
        title="退出编辑模式"
        message={`有 ${editing.modifications.size} 个未保存的修改，确定要退出编辑模式吗？退出后这些修改将丢失。`}
        confirmText="确定退出"
        cancelText="取消"
        type="warning"
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />

      <div className="h-full flex flex-col">
        {editMode && (
          <EditToolbar
            modificationsCount={editing.modifications.size}
            selection={selection}
            canUndo={editing.editHistory.canUndo}
            canRedo={editing.editHistory.canRedo}
            isSaving={editing.isSaving}
            hasConnection={!!currentConnectionId}
            onUndo={editing.handleUndo}
            onRedo={editing.handleRedo}
            onResetAll={editing.handleResetAll}
            onClearSelection={() => {
              clearSelection();
              setSelectedRows(new Set());
            }}
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
            onExport={handleExport}
            hasSelectedRows={selectedRows.size > 0}
          />
        )}

      <div className="flex-1 overflow-auto" style={{ marginTop: 0, paddingTop: 0 }}>
        <table className="w-full border-collapse text-sm" style={{ marginTop: 0 }}>
          <TableHeader
            columns={displayColumns}
            columnFilters={columnFilters}
            expandedSearchColumn={expandedSearchColumn}
            isFiltering={isFiltering}
            sortConfig={sortConfig}
            onFilterChange={handleFilterChange}
            onFilterSearch={handleFilterSearch}
            onClearFilter={handleClearFilter}
            onExpandSearch={setExpandedSearchColumn}
            onSort={handleSort}
          />
            {filteredRows.length === 0 ? (
            <EmptyState hasActiveFilters={hasActiveFilters} columnCount={displayColumns.length} />
          ) : (
            <TableBody
              paginatedRows={paginatedRows}
              filteredRows={filteredRows}
              result={result}
              editedData={editing.editedData}
              displayColumns={displayColumns}
                    editMode={editMode}
              editingCell={editing.editingCell}
              editingValue={editing.editingValue}
              modifications={editing.modifications}
                    selection={selection}
              selectedRows={selectedRows}
              currentPage={currentPage}
              pageSize={pageSize}
                    isCellSelected={isCellSelected}
                    onCellMouseDown={handleCellMouseDown}
                    onCellDoubleClick={handleCellDoubleClick}
                    onCellKeyDown={handleKeyDown}
                    onCellInputChange={handleCellInputChange}
                    onCellSave={handleCellSave}
                    onCellCancel={handleCellCancel}
                    onRowNumberClick={handleRowNumberClick}
                    onRowContextMenu={handleRowContextMenu}
              getOriginalRowIndex={getOriginalRowIndex}
                  />
            )}
        </table>
      </div>
      
      {/* 分页控件 */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalRows={totalRows}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1); // 改变每页行数时重置到第一页
        }}
      />
      
      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onGenerateInsert={handleGenerateInsert}
          onGenerateUpdate={handleGenerateUpdate}
        />
      )}
    </div>
    </>
  );
}

