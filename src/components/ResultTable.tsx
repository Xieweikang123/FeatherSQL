import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { type QueryResult } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";
import {
  selectCurrentConnectionId,
  selectCurrentDatabase,
  selectCurrentTab,
  selectEditMode,
} from "../store/selectors";
import { runTabQuery } from "../services/tabQueryService";
import ConfirmDialog from "./ConfirmDialog";
import { extractTableInfo } from "../lib/utils";
import { useColumnFilters } from "../hooks/useColumnFilters";
import { useCellSelection } from "../hooks/useCellSelection";
import { useTableEditing } from "../hooks/useTableEditing";
import { buildFilteredAndSortedSql, generateInsertSql as generateInsertSqlUtil, generateUpdateSqlForRows as generateUpdateSqlForRowsUtil } from "../utils/sqlGenerator";
import { applySortAction, type SortAction } from "../utils/sortConfig";
import SqlDisplayBar from "./ResultTable/SqlDisplayBar";
import TableHeader from "./ResultTable/TableHeader";
import TableBody from "./ResultTable/TableBody";
import EmptyState from "./ResultTable/EmptyState";
import TableStructure from "./TableStructure";
import ContextMenu from "./ResultTable/ContextMenu";
import { exportToCsv, exportToJson, exportToExcel, exportToSql, type ExportFormat } from "../utils/exportUtils";
import Pagination from "./ResultTable/Pagination";

interface ResultTableProps {
  result: QueryResult;
  sql?: string | null;
}

export default function ResultTable({ result, sql }: ResultTableProps) {
  const [expandedSearchColumn, setExpandedSearchColumn] = useState<string | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  
  // 获取连接信息（需要在 useCellSelection 之前获取 editMode）
  const currentConnectionId = useConnectionStore(selectCurrentConnectionId);
  const currentDatabase = useConnectionStore(selectCurrentDatabase);
  const connections = useConnectionStore((s) => s.connections);
  const currentTab = useConnectionStore(selectCurrentTab);
  const updateTab = useConnectionStore((s) => s.updateTab);
  const setSelectedTable = useConnectionStore((s) => s.setSelectedTable);
  const editMode = useConnectionStore(selectEditMode);
  const setEditMode = useConnectionStore((s) => s.setEditMode);
  
  const selectedTable = currentTab?.selectedTable || null;
  // 从 store 中获取 actualExecutedSql，如果不存在则使用 sql
  const actualExecutedSqlFromStore = currentTab?.actualExecutedSql || null;
  // 保存实际执行到数据库的SQL
  const [actualExecutedSql, setActualExecutedSql] = useState<string | null>(actualExecutedSqlFromStore || sql || null);
  // 使用 ref 来保存 actualExecutedSql，避免被 useEffect 重置
  const actualExecutedSqlRef = useRef<string | null>(actualExecutedSqlFromStore || sql || null);
  // 用 ref 同步标记是否正在拖拽，避免 isDragging 异步更新导致后续 mousedown 被误拦截
  const isDraggingRef = useRef(false);
  
  // 保存原始列信息（当查询返回空结果时，保留列信息用于显示表头）
  const originalColumnsRef = useRef<string[]>([]);
  
  // 保存原始查询结果（用于索引映射和oldValue获取）
  const originalResultRef = useRef<QueryResult | null>(null);
  
  // 初始化时保存列信息和原始结果
  if (result && result.columns.length > 0) {
    originalColumnsRef.current = result.columns;
  }
  const tabColumnFilters = currentTab?.columnFilters || {};
  const tabColumnFilterModes = currentTab?.columnFilterModes || {};
  
  // 使用自定义 hooks（使用标签页的 columnFilters）
  // 当 isFilterResult 为 true 时，sql 来自筛选结果，不更新 originalSqlRef 以保留原始 SQL
  const { columnFilters, updateFilters, originalSqlRef, columnFiltersRef } = useColumnFilters(sql, tabColumnFilters, currentTab?.isFilterResult);
  
  // 同步 columnFilters 到标签页
  useEffect(() => {
    if (currentTab && JSON.stringify(columnFilters) !== JSON.stringify(tabColumnFilters)) {
      updateTab(currentTab.id, { columnFilters });
    }
  }, [columnFilters, currentTab, tabColumnFilters, updateTab]);
  const { 
    selection, 
    selectionRef, // 用于获取最新选择状态
    clearSelection, 
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
  
  // 排序状态：从 tab 读取，排序时组件会因 isQuerying 卸载，需持久化到 store
  const sortConfig = currentTab?.sortConfig ?? [];
  
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  
  // 使用编辑 hook
  const editing = useTableEditing({
    result,
    editMode,
    currentConnectionId,
    currentConnection: currentConnection || null,
    currentDatabase,
    sql: sql || null,
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
    // 注意：不要在这里重置 actualExecutedSql，因为它可能已经被筛选查询更新了
    if (sql && sql !== originalSqlRef.current) {
      // sql 来自筛选/排序时（isFilterResult），不重置 sortConfig，否则排序按钮会闪烁消失
      if (currentTab?.isFilterResult) {
        return;
      }
      originalResultRef.current = result;
      // 新查询时，实际执行的SQL就是原始SQL
      // 只有在 SQL prop 真正变化时才重置（表示用户执行了新的查询）
      actualExecutedSqlRef.current = sql;
      setActualExecutedSql(sql);
      // 新查询时重置排序，过滤/排序导致 result 变化时不重置
      if (currentTab) {
        updateTab(currentTab.id, { actualExecutedSql: sql, sortConfig: [] });
      }
    } else if (sql && sql === originalSqlRef.current && result) {
      // SQL 没有变化，但 result 变化了（可能是筛选查询的结果）
      // 在这种情况下，不要重置 actualExecutedSql，保持当前的值
      // 但是需要确保 ref 和 state 同步
      // 如果 state 有带 WHERE 条件的 SQL，但 ref 被重置为原始 SQL（组件重新创建），恢复 ref
      if (actualExecutedSql && actualExecutedSql !== sql && actualExecutedSqlRef.current === sql) {
        // state 有带 WHERE 条件的 SQL，但 ref 被重置为原始 SQL，恢复 ref
        actualExecutedSqlRef.current = actualExecutedSql;
      } else if (actualExecutedSqlRef.current && actualExecutedSqlRef.current !== actualExecutedSql) {
        // ref 有值但 state 不同步，同步 state
        setActualExecutedSql(actualExecutedSqlRef.current);
      }
    }
  }, [result, sql, currentTab, updateTab]);

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
    // 重置到第一页（排序在 sql 变化时单独重置，避免过滤/排序后误清空）
    setCurrentPage(1);
    // 新查询结果：直接展示全部数据（最多 5000 条，避免性能问题）
    if (result?.rows?.length > 0) {
      setPageSize(Math.min(result.rows.length, 5000));
    }
  }, [result, setEditedData]);

  const buildFilteredAndSortedSqlCallback = useCallback((
    baseSql: string, 
    filters: Record<string, string>,
    sortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>,
    filterModes?: Record<string, 'fuzzy' | 'exact'>
  ): string => {
    const dbType = currentConnection?.type || 'sqlite';
    return buildFilteredAndSortedSql(baseSql, filters, sortConfig, dbType, filterModes);
  }, [currentConnection]);

  // 执行带过滤和排序的 SQL 查询
  // filterModesOverride: 切换模糊/精确时传入新值，避免闭包中的 tabColumnFilterModes 尚未更新
  const executeFilteredAndSortedSql = useCallback(async (
    filters: Record<string, string>, 
    sortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>,
    filterModesOverride?: Record<string, 'fuzzy' | 'exact'>
  ) => {
    // 使用 originalSqlForFilter 作为 base，避免多次筛选时在已有 WHERE 上重复插入导致 SQL 语法错误
    let baseSql = currentTab?.originalSqlForFilter?.trim() || originalSqlRef.current?.trim() || actualExecutedSqlRef.current?.trim() || currentTab?.actualExecutedSql?.trim() || sql?.trim();
    if (!currentConnectionId || !baseSql) {
      return;
    }
    // 向后兼容：若 tab 无 originalSqlForFilter（旧数据/恢复的会话），首次筛选时保存当前 base
    if (currentTab && !currentTab.originalSqlForFilter?.trim()) {
      updateTab(currentTab.id, { originalSqlForFilter: baseSql });
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
      // 过滤/排序时不设置 isQuerying，避免 ResultTable 卸载导致 sortConfig 丢失、UI 闪烁
      
      let sqlToExecute: string;
      if (activeFilters.length === 0 && sortConfig.length === 0) {
        // 没有过滤条件和排序，使用原始 SQL
        sqlToExecute = baseSql;
      } else {
        // 构建带 WHERE 条件和 ORDER BY 的 SQL
        const modes = filterModesOverride ?? tabColumnFilterModes;
        sqlToExecute = buildFilteredAndSortedSqlCallback(baseSql, filters, sortConfig, modes);
      }
      
      const newResult = await runTabQuery({
        tabId: currentTab.id,
        sql: sqlToExecute,
        connectionId: currentConnectionId,
        database: currentDatabase,
        mode: "filter",
      });

      if (!newResult) {
        return;
      }

      actualExecutedSqlRef.current = sqlToExecute;
      setActualExecutedSql(sqlToExecute);

      updateFilters(filters);

      if (newResult.columns.length === 0 && originalColumnsRef.current.length > 0) {
        updateTab(currentTab.id, {
          queryResult: {
            ...newResult,
            columns: originalColumnsRef.current,
          },
        });
      }
      // 过滤后重置到第一页
      setCurrentPage(1);
    } catch (error) {
      console.error("Filtered SQL execution error:", error);
      if (currentTab) {
        updateTab(currentTab.id, { isQuerying: false });
      }
    } finally {
      setIsFiltering(false);
    }
    }, [currentConnectionId, currentDatabase, buildFilteredAndSortedSqlCallback, updateFilters, currentTab, updateTab, editMode, editing, result, sql, tabColumnFilterModes]);




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
    // 使用 ref 获取最新的筛选值，避免状态更新延迟问题
    const currentFilters = columnFiltersRef.current;
    const filterValue = currentFilters[columnName] || "";
    const newFilters = { ...currentFilters };
    
    if (filterValue.trim() === "") {
      delete newFilters[columnName];
    }
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    executeFilteredAndSortedSql(newFilters, sortConfig);
  }, [columnFiltersRef, sortConfig, executeFilteredAndSortedSql]);

  const handleClearFilter = useCallback((columnName: string) => {
    // 使用 ref 获取最新的筛选值
    const currentFilters = columnFiltersRef.current;
    const newFilters = { ...currentFilters };
    delete newFilters[columnName];
    
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    executeFilteredAndSortedSql(newFilters, sortConfig);
  }, [columnFiltersRef, sortConfig, executeFilteredAndSortedSql]);

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

  // 清除排序（全部或指定列）
  const handleClearSort = useCallback(() => {
    if (!currentTab) return;
    updateTab(currentTab.id, { sortConfig: [] });
    setCurrentPage(1);
    executeFilteredAndSortedSql(columnFiltersRef.current, []);
  }, [currentTab, columnFiltersRef, executeFilteredAndSortedSql, updateTab]);

  const handleClearSortColumn = useCallback((column: string) => {
    if (!currentTab) return;
    const newConfig = sortConfig.filter((s) => s.column !== column);
    updateTab(currentTab.id, { sortConfig: newConfig });
    setCurrentPage(1);
    executeFilteredAndSortedSql(columnFiltersRef.current, newConfig);
  }, [currentTab, sortConfig, columnFiltersRef, executeFilteredAndSortedSql, updateTab]);

  const handleFilterModeChange = useCallback((column: string, mode: 'fuzzy' | 'exact', filterValueOverride?: string) => {
    if (!currentTab) return;
    const newModes = { ...tabColumnFilterModes, [column]: mode };
    updateTab(currentTab.id, { columnFilterModes: newModes });
    // 点击精确时传入当前输入值，避免 ref 未同步导致筛选内容为空
    let filtersToUse = columnFiltersRef.current;
    if (filterValueOverride !== undefined) {
      filtersToUse = { ...filtersToUse, [column]: filterValueOverride };
      updateFilters(filtersToUse);
    }
    executeFilteredAndSortedSql(filtersToUse, sortConfig, newModes);
  }, [currentTab, tabColumnFilterModes, columnFiltersRef, sortConfig, executeFilteredAndSortedSql, updateTab, updateFilters]);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);


  // 编辑相关处理函数：统一使用当前 result 中的 displayRowIndex
  const handleCellDoubleClick = (displayRowIndex: number, cellIndex: number) => {
    if (!editMode) return;
    if (displayRowIndex < 0 || displayRowIndex >= editing.editedData.rows.length) return;
    editing.handleCellDoubleClick(displayRowIndex, cellIndex);
  };

  const handleCellInputChange = editing.handleCellInputChange;
  const handleCellSave = editing.handleCellSave;
  const handleCellCancel = editing.handleCellCancel;

  const isCellSelected = isCellSelectedHook;

  const handleCellClick = (displayRowIndex: number, cellIndex: number, e: React.MouseEvent) => {
    if (!editMode || editing.editingCell) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (displayRowIndex < 0 || displayRowIndex >= filteredRows.length) return;
    const clickedCell = { row: displayRowIndex, col: cellIndex };
    setRectSelection(clickedCell, clickedCell);
  };

  const handleCellMouseDown = (displayRowIndex: number, cellIndex: number, e: React.MouseEvent) => {
    const textSelection = window.getSelection();
    if (textSelection && textSelection.toString().trim().length > 0) {
      return;
    }
    
    if (!editMode) return;
    if (displayRowIndex < 0 || displayRowIndex >= filteredRows.length) return;
    
    if (editing.editingCell) return;
    
    if (isDraggingRef.current) {
      return;
    }
    
    const clickedCell = { row: displayRowIndex, col: cellIndex };
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isCurrentlySelected = selection && isCellSelected(displayRowIndex, cellIndex);
    
    if (e.shiftKey && selection && selection.range) {
      e.preventDefault();
      const anchor = selection.range.start;
      setRectSelection(anchor, clickedCell);
      dragStartRef.current = anchor;
      isDraggingRef.current = true;
      setIsDragging(true);
      attachDragListeners();
    } else if (isCtrlOrCmd) {
      e.preventDefault();
      e.stopPropagation();
      
      if (isCurrentlySelected) {
        removeCellFromSelection(displayRowIndex, cellIndex);
      } else {
        addCellToSelection(displayRowIndex, cellIndex);
      }
      
      dragStartRef.current = null;
      setIsDragging(false);
    } else {
      e.preventDefault();
      setRectSelection(clickedCell, clickedCell);
      dragStartRef.current = clickedCell;
      isDraggingRef.current = true;
      setIsDragging(true);
      attachDragListeners();
    }
  };

  const handleCellMouseMove = useCallback((displayRowIndex: number, cellIndex: number) => {
    if (!editMode || !dragStartRef.current) return;
    if (displayRowIndex < 0 || displayRowIndex >= filteredRows.length) return;
    
    const endCell = { row: displayRowIndex, col: cellIndex };
    setRectSelection(dragStartRef.current, endCell);
  }, [editMode, filteredRows.length, setRectSelection]);

  // 用 ref 保存最新的 handleCellMouseMove
  const handleCellMouseMoveRef = useRef(handleCellMouseMove);
  handleCellMouseMoveRef.current = handleCellMouseMove;

  // 立即添加拖拽监听器（不等待 React 更新），避免快速拖拽时错过 mousemove
  const attachDragListeners = useCallback(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 优先用 target，若不在 td 内则用 elementFromPoint（快速拖拽时 target 可能不准）
      let cell = (e.target as HTMLElement).closest('td');
      if (!cell && document.elementFromPoint) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        cell = el?.closest?.('td') ?? null;
      }
      if (cell && cell.dataset.rowIndex !== undefined && cell.dataset.cellIndex !== undefined) {
        const filteredRowIndex = parseInt(cell.dataset.rowIndex);
        const cellIndex = parseInt(cell.dataset.cellIndex);
        handleCellMouseMoveRef.current(filteredRowIndex, cellIndex);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false; // 同步重置，确保下次 mousedown 不被拦截
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setIsDragging]);

  // 批量编辑、复制、粘贴（使用 editing hook）
  const handleBatchEdit = (value: string) => {
    // 使用 selectionRef 获取最新选择状态，避免 React 异步状态更新导致的问题
    const latestSelection = selectionRef.current;
    editing.handleBatchEdit(value, latestSelection);
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
    } else if (!editing.editingCell && selectionRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 直接输入字符时，如果有选中单元格，进行批量编辑
      // 使用 selectionRef 获取最新选择状态
      e.preventDefault();
      handleBatchEdit(e.key);
    }
  };

  // 全局键盘快捷键处理（选中单元格后即使焦点不在 td 上也能响应）
  useEffect(() => {
    if (!editMode) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框中，不处理全局快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const sel = selectionRef.current;
      const hasSelection = sel && sel.cells.size > 0;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editing.handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        editing.handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && hasSelection) {
        e.preventDefault();
        editing.handlePaste(sel);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && hasSelection) {
        e.preventDefault();
        editing.handleCopy(sel);
      } else if (!editing.editingCell && hasSelection) {
        // 批量编辑：选中时直接输入或 Delete，不依赖 td 焦点
        if (e.key === 'Delete') {
          e.preventDefault();
          editing.handleBatchEdit('', sel);
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          editing.handleBatchEdit(e.key, sel);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [editMode, editing]);

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

  // 处理列头排序（通过菜单选择升序/降序/取消）
  const handleApplySort = useCallback((column: string, action: SortAction, shiftKey: boolean) => {
    if (!currentTab) return;

    const newConfig = applySortAction(sortConfig, column, action, shiftKey);

    updateTab(currentTab.id, { sortConfig: newConfig });
    setCurrentPage(1);
    executeFilteredAndSortedSql(columnFiltersRef.current, newConfig);
  }, [sortConfig, currentTab, columnFiltersRef, executeFilteredAndSortedSql, updateTab]);

  // 处理序号列点击，选中整行
  const handleRowNumberClick = useCallback((displayRowIndex: number, e: React.MouseEvent) => {
    if (!editMode) return;
    if (displayRowIndex < 0 || displayRowIndex >= filteredRows.length) return;
    
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    
    if (isShift && selectedRows.size > 0) {
      const lastSelected = Math.max(...Array.from(selectedRows));
      const minRow = Math.min(lastSelected, displayRowIndex);
      const maxRow = Math.max(lastSelected, displayRowIndex);
      const newSelectedRows = new Set(selectedRows);
      for (let i = minRow; i <= maxRow; i++) {
        newSelectedRows.add(i);
      }
      setSelectedRows(newSelectedRows);
      
      setRectSelection(
        { row: minRow, col: 0 },
        { row: maxRow, col: displayColumns.length - 1 }
      );
    } else if (isCtrlOrCmd) {
      const newSelectedRows = new Set(selectedRows);
      if (newSelectedRows.has(displayRowIndex)) {
        newSelectedRows.delete(displayRowIndex);
        for (let col = 0; col < displayColumns.length; col++) {
          removeCellFromSelection(displayRowIndex, col);
        }
      } else {
        newSelectedRows.add(displayRowIndex);
        for (let col = 0; col < displayColumns.length; col++) {
          addCellToSelection(displayRowIndex, col);
        }
      }
      setSelectedRows(newSelectedRows);
    } else {
      setSelectedRows(new Set([displayRowIndex]));
      setRectSelection(
        { row: displayRowIndex, col: 0 },
        { row: displayRowIndex, col: displayColumns.length - 1 }
      );
    }
  }, [editMode, selectedRows, displayColumns.length, filteredRows.length, setRectSelection, addCellToSelection, removeCellFromSelection]);

  const handleRowContextMenu = useCallback((displayRowIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (displayRowIndex < 0 || displayRowIndex >= filteredRows.length) return;
    
    if (!selectedRows.has(displayRowIndex)) {
      setSelectedRows(new Set([displayRowIndex]));
      setRectSelection(
        { row: displayRowIndex, col: 0 },
        { row: displayRowIndex, col: displayColumns.length - 1 }
      );
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      rowIndex: displayRowIndex,
    });
  }, [selectedRows, displayColumns.length, filteredRows.length, setRectSelection]);

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
    }
  }, [generateInsertSqlCallback, selectedRows.size]);

  // 处理生成 UPDATE 语句
  const handleGenerateUpdate = useCallback(() => {
    const updateSql = generateUpdateSqlForRowsCallback();
    if (updateSql) {
      navigator.clipboard.writeText(updateSql);
    }
  }, [generateUpdateSqlForRowsCallback, selectedRows.size]);

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
        throw new Error(exportSelected ? '没有选中的行可导出' : '没有数据可导出');
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

      const tableName = (sql && extractTableInfo(sql)?.tableName) || 'exported_data';
      const dbType = currentConnection?.type || 'sqlite';
      const database = currentDatabase || null;

      switch (format) {
        case 'csv':
          exportToCsv(exportData, filename);
          break;
        case 'json':
          exportToJson(exportData, filename);
          break;
        case 'excel':
          try {
            exportToExcel(exportData, filename);
          } catch (excelError) {
            console.error('Excel export error:', excelError);
          }
          break;
        case 'sql':
          exportToSql(exportData, filename, tableName, dbType, database);
          break;
      }
    } catch (error) {
      console.error('导出错误:', error);
    }
  }, [selectedRows, editing.editedData.rows, displayColumns, sql, currentConnection?.type, currentDatabase]);

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
  // 注意：INSERT/UPDATE/DELETE 语句会返回 affected_rows 列，应该正常显示
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
        {sql && (() => {
          const filteredSqlValue = actualExecutedSqlRef.current || actualExecutedSql;
          return (
            <div
              className="px-4 py-2 neu-flat flex items-center gap-3"
              style={{ borderBottom: "1px solid var(--neu-dark)", display: "flex", flexWrap: "nowrap", overflow: "hidden" }}
            >
              {selectedTable && (
                <>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active flex-shrink-0"
                    style={{ color: 'var(--neu-text)' }}
                    title="返回表视图"
                  >
                    <span>←</span>
                    <span>返回</span>
                  </button>
                  <div className="w-px h-6 flex-shrink-0" style={{ backgroundColor: "var(--neu-dark)" }} />
                </>
              )}
              {/* 编辑模式工具栏部分 */}
              {editMode && (
                <>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold" style={{ color: "var(--neu-accent)" }}>
                      编辑模式
                    </span>
                    {editing.modifications.size > 0 && (
                      <span className="text-xs" style={{ color: "var(--neu-warning)" }}>
                        ({editing.modifications.size} 个未保存的修改)
                      </span>
                    )}
                    {selection && (
                      <span className="text-xs" style={{ color: "var(--neu-accent-light)" }}>
                        (已选择: {selection.cells.size} 个单元格)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={editing.handleUndo}
                      disabled={!editing.editHistory.canUndo}
                      className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:hover:neu-flat"
                      style={{ color: "var(--neu-text)" }}
                      title="撤销 (Ctrl+Z)"
                    >
                      ↶ 撤销
                    </button>
                    <button
                      onClick={editing.handleRedo}
                      disabled={!editing.editHistory.canRedo}
                      className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:hover:neu-flat"
                      style={{ color: "var(--neu-text)" }}
                      title="重做 (Ctrl+Y 或 Ctrl+Shift+Z)"
                    >
                      ↷ 重做
                    </button>
                    {editing.modifications.size > 0 && (
                      <button
                        onClick={editing.handleResetAll}
                        className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
                        style={{ color: "var(--neu-warning)" }}
                        title="撤销所有改动"
                      >
                        ↶ 撤销所有
                      </button>
                    )}
                    {selection && (
                      <button
                        onClick={() => {
                          clearSelection();
                          setSelectedRows(new Set());
                        }}
                        className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
                        style={{ color: "var(--neu-text)" }}
                        title="清除选择"
                      >
                        ✕
                      </button>
                    )}
                    {editing.modifications.size > 0 && (
                      <button
                        onClick={handleSaveChanges}
                        disabled={editing.isSaving || !currentConnectionId}
                        className="px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-raised hover:neu-hover active:neu-active disabled:hover:neu-raised font-medium"
                        style={{ color: "var(--neu-success)" }}
                        title="保存所有修改到数据库"
                      >
                        {editing.isSaving ? "保存中..." : `💾 保存 (${editing.modifications.size})`}
                      </button>
                    )}
                    {editing.saveSuccess && (
                      <span className="text-xs" style={{ color: "var(--neu-success)" }}>
                        保存成功
                      </span>
                    )}
                    {editing.saveError && (
                      <span className="text-xs max-w-xs truncate" style={{ color: "var(--neu-error)" }} title={editing.saveError}>
                        保存失败: {editing.saveError}
                      </span>
                    )}
                    <button
                      onClick={handleExitEditMode}
                      className="px-3 py-1.5 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
                      style={{ color: "var(--neu-text)" }}
                      title="退出编辑模式"
                    >
                      退出编辑
                    </button>
                  </div>
                  <div className="w-px h-6" style={{ backgroundColor: "var(--neu-dark)" }}></div>
                </>
              )}
              {/* SQL 显示栏部分 */}
              <SqlDisplayBar
                sql={sql}
                filteredSql={filteredSqlValue}
                hasActiveFilters={hasActiveFilters}
                hasActiveSort={sortConfig.length > 0}
                isFiltering={isFiltering}
                rowCount={displayRows.length}
                editMode={editMode}
                canViewStructure={!!tableInfo?.tableName}
                onEnterEditMode={() => setEditMode(true)}
                onClearFilters={handleClearAllFilters}
                onClearSort={handleClearSort}
                onViewStructure={handleViewStructure}
                onExport={handleExport}
                hasSelectedRows={selectedRows.size > 0}
              />
            </div>
          );
        })()}

      <div className="flex-1 overflow-auto relative" style={{ marginTop: 0, paddingTop: 0 }}>
        {/* 大批量搜索/过滤时的加载遮罩 */}
        {isFiltering && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(2px)",
            }}
          >
            <div className="flex flex-col items-center gap-4 p-6 rounded-xl neu-raised" style={{ minWidth: 200 }}>
              <svg
                className="animate-spin h-10 w-10"
                style={{ color: "var(--neu-accent)" }}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm font-medium" style={{ color: "var(--neu-text)" }}>
                正在搜索/过滤，请稍候...
              </span>
            </div>
          </div>
        )}
        <table className="w-full border-collapse text-sm" style={{ marginTop: 0 }}>
          <TableHeader
            columns={displayColumns}
            columnFilters={columnFilters}
            columnFilterModes={tabColumnFilterModes}
            expandedSearchColumn={expandedSearchColumn}
            isFiltering={isFiltering}
            sortConfig={sortConfig}
            onFilterChange={handleFilterChange}
            onFilterSearch={handleFilterSearch}
            onFilterModeChange={handleFilterModeChange}
            onClearFilter={handleClearFilter}
            onExpandSearch={setExpandedSearchColumn}
            onApplySort={handleApplySort}
            onClearSortColumn={handleClearSortColumn}
          />
          {filteredRows.length === 0 ? (
            <tbody>
              <EmptyState hasActiveFilters={hasActiveFilters} columnCount={displayColumns.length} />
            </tbody>
          ) : (
            <TableBody
              paginatedRows={paginatedRows}
              filteredRows={filteredRows}
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
                    onCellClick={handleCellClick}
                    onCellDoubleClick={handleCellDoubleClick}
                    onCellKeyDown={handleKeyDown}
                    onCellInputChange={handleCellInputChange}
                    onCellSave={handleCellSave}
                    onCellCancel={handleCellCancel}
                    onRowNumberClick={handleRowNumberClick}
                    onRowContextMenu={handleRowContextMenu}
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

