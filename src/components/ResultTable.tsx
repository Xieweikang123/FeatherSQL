import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
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

interface EditHistoryState {
  editedData: QueryResult;
  modifications: Map<string, CellModification>;
}

export default function ResultTable({ result, sql }: ResultTableProps) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:COMPONENT_RENDER',message:'Component rendering',data:{resultExists:!!result,resultColumnsLength:result?.columns?.length || 0,sql:sql?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  
  const [expandedSearchColumn, setExpandedSearchColumn] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // 保存原始 SQL（用于清除过滤时恢复）
  const originalSqlRef = useRef<string | null>(sql || null);
  // 保存原始列信息（当查询返回空结果时，保留列信息用于显示表头）
  const originalColumnsRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<number | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  // 使用 ref 保存 columnFilters，避免闭包问题
  const columnFiltersRef = useRef<Record<string, string>>({});
  // 方案7：使用一个持久化的 ref 保存最后一次的 filters，即使组件重新挂载也能恢复
  const lastFiltersRef = useRef<Record<string, string>>({});
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:COMPONENT_RENDER:REFS',message:'Component refs initialized',data:{originalSql:originalSqlRef.current?.substring(0,50),originalColumnsLength:originalColumnsRef.current.length,columnFiltersRef:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  
  // 初始化时保存列信息
  if (result && result.columns.length > 0 && originalColumnsRef.current.length === 0) {
    originalColumnsRef.current = result.columns;
  }
  
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
  
  // 撤销/重做历史栈
  const [history, setHistory] = useState<EditHistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1); // 用于同步跟踪 historyIndex
  const maxHistorySize = 50; // 最多保存50步历史
  
  // 获取连接信息
  const { 
    currentConnectionId, 
    currentDatabase, 
    connections, 
    addLog, 
    setQueryResult,
    setIsQuerying,
    columnFilters, // 方案8：从 store 读取 columnFilters
    setColumnFilters // 方案8：使用 store 的 setColumnFilters
  } = useConnectionStore();
  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const [isSaving, setIsSaving] = useState(false);
  
  // 同步 historyIndexRef 和 historyIndex
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // 保存原始 SQL
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:SQL',message:'SQL useEffect triggered',data:{sql:sql?.substring(0,50),originalSql:originalSqlRef.current?.substring(0,50),sqlChanged:sql && sql !== originalSqlRef.current,currentColumnFilters:columnFilters,refColumnFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    if (sql && sql !== originalSqlRef.current) {
      // SQL 变化了，说明是新的查询，清空过滤条件
      console.log('[ResultTable] SQL 变化，清空过滤条件', {
        oldSql: originalSqlRef.current?.substring(0, 50),
        newSql: sql.substring(0, 50)
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:SQL:CLEAR',message:'Clearing columnFilters due to SQL change',data:{oldSql:originalSqlRef.current?.substring(0,50),newSql:sql.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      originalSqlRef.current = sql;
      setColumnFilters({});
      columnFiltersRef.current = {};
    } else if (sql) {
      originalSqlRef.current = sql;
      // SQL 没有变化，但可能 columnFilters 状态和 ref 不同步，同步一下
      // 优先使用 ref 的值，因为它总是最新的（在 executeFilteredSql 中会先更新 ref）
      // 但如果 ref 为空而 state 有值，说明 ref 可能被意外清空了，需要从 state 恢复 ref
      // 方案7：如果 ref 和 state 都为空，尝试从 lastFiltersRef 恢复
      const refHasFilters = Object.keys(columnFiltersRef.current).length > 0;
      const stateHasFilters = Object.keys(columnFilters).length > 0;
      const lastHasFilters = Object.keys(lastFiltersRef.current).length > 0;
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:SQL:CHECK_SYNC',message:'Checking if sync needed',data:{refHasFilters,stateHasFilters,lastHasFilters,refColumnFilters:columnFiltersRef.current,stateColumnFilters:columnFilters,lastFilters:lastFiltersRef.current,willSyncFromRef:refHasFilters && (!stateHasFilters || JSON.stringify(columnFiltersRef.current) !== JSON.stringify(columnFilters)),willSyncFromState:!refHasFilters && stateHasFilters,willSyncFromLast:!refHasFilters && !stateHasFilters && lastHasFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // 如果 ref 有值但 state 为空，同步 ref 到 state（避免状态丢失）
      // 如果 ref 和 state 都有值但不一致，也同步 ref 到 state（ref 是权威来源）
      if (refHasFilters && (!stateHasFilters || JSON.stringify(columnFiltersRef.current) !== JSON.stringify(columnFilters))) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:SQL:SYNC',message:'Syncing columnFilters from ref',data:{refColumnFilters:columnFiltersRef.current,stateColumnFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        setColumnFilters(columnFiltersRef.current);
      } else if (!refHasFilters && stateHasFilters) {
        // 如果 ref 为空但 state 有值，说明 ref 可能被意外清空了，需要从 state 恢复 ref
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:SQL:SYNC_FROM_STATE',message:'Syncing columnFiltersRef from state (ref was cleared)',data:{stateColumnFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        columnFiltersRef.current = columnFilters;
        lastFiltersRef.current = columnFilters;
      } else if (!refHasFilters && !stateHasFilters && lastHasFilters) {
        // 方案7：如果 ref 和 state 都为空，尝试从 lastFiltersRef 恢复（组件可能重新挂载了）
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:SQL:SYNC_FROM_LAST',message:'Syncing columnFilters from lastFiltersRef (component may have remounted)',data:{lastFilters:lastFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        columnFiltersRef.current = lastFiltersRef.current;
        setColumnFilters(lastFiltersRef.current);
      }
    }
  }, [sql]); // 移除 columnFilters 依赖，避免在状态更新时触发不必要的重新执行
  
  // 保存列信息（单独处理，避免与 SQL 变化逻辑冲突）
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:ENTRY',message:'Result useEffect triggered',data:{resultExists:!!result,resultColumnsLength:result?.columns?.length || 0,originalColumnsLength:originalColumnsRef.current.length,currentColumnFilters:columnFilters,refColumnFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
    // #endregion
    
    if (result && result.columns.length > 0) {
      // 检查列是否发生变化（只有当列真正不同时才认为变化）
      // 使用副本进行排序，避免修改原数组
      const currentColumnsStr = JSON.stringify([...result.columns].sort());
      const originalColumnsStr = JSON.stringify([...originalColumnsRef.current].sort());
      const columnsChanged = currentColumnsStr !== originalColumnsStr;
      const sqlMatches = sql === originalSqlRef.current;
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:CHECK',message:'Checking column changes',data:{currentColumns:result.columns,originalColumns:originalColumnsRef.current,columnsChanged,sqlMatches,currentColumnFilters:columnFilters,refColumnFilters:columnFiltersRef.current,willClear:columnsChanged && originalColumnsRef.current.length > 0 && sqlMatches},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
      // #endregion
      
      console.log('[ResultTable] result 变化，检查列变化', {
        currentColumns: result.columns,
        originalColumns: originalColumnsRef.current,
        columnsChanged,
        sql: sql?.substring(0, 50),
        originalSql: originalSqlRef.current?.substring(0, 50),
        sqlMatches: sql === originalSqlRef.current
      });
      
      // 如果列发生了变化，且之前有列信息，清空过滤条件（因为列名可能不同）
      // 但只有在 SQL 没有变化时才清空（避免过滤查询时误判）
      // 如果 SQL 变化了，上面的 useEffect 已经清空了，这里不需要再清空
      if (columnsChanged && originalColumnsRef.current.length > 0 && sqlMatches) {
        console.log('[ResultTable] 列变化且 SQL 未变化，清空过滤条件');
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:CLEAR',message:'Clearing columnFilters due to column change',data:{columnsChanged,sqlMatches,currentColumnFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
        // #endregion
        
        setColumnFilters({});
        columnFiltersRef.current = {};
      } else if (!columnsChanged && sqlMatches) {
        // 列没有变化且 SQL 匹配，可能是过滤查询的结果
        // 优先使用 ref 的值，因为它总是最新的（在 executeFilteredSql 中会先更新 ref）
        // 但如果 ref 为空而 state 有值，说明 ref 可能被意外清空了，需要从 state 恢复 ref
        // 方案7：如果 ref 和 state 都为空，尝试从 lastFiltersRef 恢复
        const refHasFilters = Object.keys(columnFiltersRef.current).length > 0;
        const stateHasFilters = Object.keys(columnFilters).length > 0;
        const lastHasFilters = Object.keys(lastFiltersRef.current).length > 0;
        
        // 如果 ref 有值但 state 为空，同步 ref 到 state（避免状态丢失）
        // 如果 ref 和 state 都有值但不一致，也同步 ref 到 state（ref 是权威来源）
        if (refHasFilters && (!stateHasFilters || JSON.stringify(columnFiltersRef.current) !== JSON.stringify(columnFilters))) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:SYNC',message:'Syncing columnFilters from ref after filter query',data:{refColumnFilters:columnFiltersRef.current,stateColumnFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
          // #endregion
          setColumnFilters(columnFiltersRef.current);
        } else if (!refHasFilters && stateHasFilters) {
          // 如果 ref 为空但 state 有值，说明 ref 可能被意外清空了，需要从 state 恢复 ref
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:SYNC_FROM_STATE',message:'Syncing columnFiltersRef from state (ref was cleared)',data:{stateColumnFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
          // #endregion
          columnFiltersRef.current = columnFilters;
          lastFiltersRef.current = columnFilters;
        } else if (!refHasFilters && !stateHasFilters && lastHasFilters) {
          // 方案7：如果 ref 和 state 都为空，尝试从 lastFiltersRef 恢复（组件可能重新挂载了）
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:SYNC_FROM_LAST',message:'Syncing columnFilters from lastFiltersRef (component may have remounted)',data:{lastFilters:lastFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
          // #endregion
          columnFiltersRef.current = lastFiltersRef.current;
          setColumnFilters(lastFiltersRef.current);
        }
      }
      
      // 更新列信息（即使没有变化也要更新，因为可能是过滤查询返回的结果）
      // 但只有在列真正变化时才更新引用，避免不必要的更新
      if (columnsChanged || originalColumnsRef.current.length === 0) {
        originalColumnsRef.current = result.columns;
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useEffect:RESULT:SKIP',message:'Skipping column check - no result or empty columns',data:{resultExists:!!result,resultColumnsLength:result?.columns?.length || 0,currentColumnFilters:columnFilters,refColumnFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    }
  }, [result, sql]); // 移除 columnFilters 依赖，避免在状态更新时触发不必要的重新执行

  // 方案4：使用 useLayoutEffect 在渲染前确保 ref 和 state 同步
  // 这会在 DOM 更新之前执行，确保在渲染时 ref 和 state 是一致的
  useLayoutEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useLayoutEffect:ENTRY',message:'useLayoutEffect triggered',data:{stateColumnFilters:columnFilters,refColumnFilters:columnFiltersRef.current,lastFilters:lastFiltersRef.current,resultExists:!!result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
    // #endregion
    
    // 如果 state 有值但 ref 为空，从 state 恢复 ref
    const stateHasFilters = Object.keys(columnFilters).length > 0;
    const refHasFilters = Object.keys(columnFiltersRef.current).length > 0;
    const lastHasFilters = Object.keys(lastFiltersRef.current).length > 0;
    
    if (stateHasFilters && !refHasFilters) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useLayoutEffect:SYNC',message:'useLayoutEffect syncing ref from state',data:{stateColumnFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      columnFiltersRef.current = columnFilters;
      lastFiltersRef.current = columnFilters;
    } else if (refHasFilters && !stateHasFilters) {
      // 如果 ref 有值但 state 为空，从 ref 恢复 state
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useLayoutEffect:SYNC_STATE',message:'useLayoutEffect syncing state from ref',data:{refColumnFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      setColumnFilters(columnFiltersRef.current);
    } else if (!refHasFilters && !stateHasFilters && lastHasFilters) {
      // 方案7：如果 ref 和 state 都为空，尝试从 lastFiltersRef 恢复（组件可能重新挂载了）
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:useLayoutEffect:SYNC_FROM_LAST',message:'useLayoutEffect syncing from lastFiltersRef (component may have remounted)',data:{lastFilters:lastFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      columnFiltersRef.current = lastFiltersRef.current;
      setColumnFilters(lastFiltersRef.current);
    }
  }, [columnFilters, result]); // 依赖 columnFilters 和 result，确保在状态变化时同步

  // 当 result 变化时，重置编辑状态
  useEffect(() => {
    // 如果查询返回空结果但没有列信息，使用保存的列信息
    if (result && result.columns.length === 0 && originalColumnsRef.current.length > 0) {
      // 创建一个新的 result 对象，使用保存的列信息
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
    setSelection(null);
    setHistory([]);
    setHistoryIndex(-1);
    historyIndexRef.current = -1;
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
      
      // 在 setQueryResult 之前，同步更新 ref 和 state
      // 这样 useEffect 在重新渲染时能读取到最新的值
      // 先更新 ref（同步操作）
      columnFiltersRef.current = filters;
      // 然后更新 store（方案8：使用 store 的 setColumnFilters）
      const filtersMatch = JSON.stringify(filters) === JSON.stringify(columnFilters);
      if (!filtersMatch) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:BEFORE_SETQUERY:UPDATE_STATE',message:'Updating columnFilters state before setQueryResult',data:{filters,prevFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
        // #endregion
      }
      setColumnFilters(filters);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:BEFORE_SETQUERY',message:'Before setQueryResult, updating ref and state',data:{filters,refFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      
      // 重要：在 setQueryResult 之前，确保 ref 已经更新
      // 因为 setQueryResult 会触发重新渲染，useEffect 会读取 ref 的值
      // 我们使用 React.startTransition 来确保状态更新的优先级
      
      // 方案6：在 setQueryResult 之前，确保 ref 和 state 都已经更新
      // 使用多个保护措施确保 ref 不会被清空
      columnFiltersRef.current = filters;
      lastFiltersRef.current = filters; // 保存到持久化 ref
      setColumnFilters(filters);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:BEFORE_SETQUERY:FINAL',message:'Final update before setQueryResult',data:{filters,refFilters:columnFiltersRef.current,lastFilters:lastFiltersRef.current,stateFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      
      // 如果查询返回空结果但没有列信息，尝试从保存的列信息中恢复
      if (newResult.columns.length === 0 && originalColumnsRef.current.length > 0) {
        // 保留列信息，只更新行数据
        const resultWithColumns = {
          ...newResult,
          columns: originalColumnsRef.current
        };
        console.log('[ResultTable] 使用保存的列信息填充空结果', {
          resultWithColumns,
          filters: filters
        });
        setQueryResult(resultWithColumns);
      } else {
        console.log('[ResultTable] 直接设置查询结果', {
          newResult,
          filters: filters
        });
        setQueryResult(newResult);
      }
      
      // 方案1：在 setQueryResult 之后，立即再次更新 ref，确保 ref 始终是最新值
      // 使用 Object.assign 确保是同一个对象引用，避免被清空
      Object.assign(columnFiltersRef.current, filters);
      lastFiltersRef.current = filters; // 同时更新持久化 ref
      
      // 方案2：使用多个 setTimeout 确保在不同渲染周期都更新 ref
      // 第一个 setTimeout：立即更新（当前渲染周期）
      setTimeout(() => {
        columnFiltersRef.current = filters;
        lastFiltersRef.current = filters; // 同时更新持久化 ref
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:AFTER_SETQUERY:SETTIMEOUT1',message:'After setQueryResult, setTimeout 1 updating ref',data:{filters,refFilters:columnFiltersRef.current,lastFilters:lastFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
        // #endregion
      }, 0);
      
      // 第二个 setTimeout：在下一个事件循环更新（确保在所有 useEffect 执行后）
      setTimeout(() => {
        columnFiltersRef.current = filters;
        lastFiltersRef.current = filters; // 同时更新持久化 ref
        setColumnFilters(filters);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:AFTER_SETQUERY:SETTIMEOUT2',message:'After setQueryResult, setTimeout 2 updating ref and state',data:{filters,refFilters:columnFiltersRef.current,lastFilters:lastFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
        // #endregion
      }, 10);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:AFTER_SETQUERY',message:'After setQueryResult, ensuring ref is updated',data:{filters,refFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      
      // 方案3：验证过滤条件是否正确保留（用于调试）
      setTimeout(() => {
        const filtersMatch = JSON.stringify(filters) === JSON.stringify(columnFilters);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:executeFilteredSql:AFTER_QUERY',message:'After setQueryResult, verifying filters',data:{filters,columnFilters,filtersMatch,refFilters:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
        // #endregion
        
        if (!filtersMatch) {
          console.warn('[ResultTable] 过滤条件不匹配，尝试修复', {
            filters,
            columnFilters
          });
          // 如果仍然不匹配，再次更新（可能是由于其他状态更新导致）
          setColumnFilters(filters);
          columnFiltersRef.current = filters;
        }
      }, 50);
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
  const saveToHistory = () => {
    const currentState: EditHistoryState = {
      editedData: JSON.parse(JSON.stringify(editedData)), // 深拷贝
      modifications: new Map(modifications)
    };
    
    // 使用 ref 获取最新的 historyIndex，确保同步
    const currentIndex = historyIndexRef.current;
    
    setHistory(prevHistory => {
      // 如果当前不在历史栈的末尾，删除后面的历史
      const newHistory = prevHistory.slice(0, currentIndex + 1);
      // 添加新状态
      newHistory.push(currentState);
      // 限制历史栈大小
      if (newHistory.length > maxHistorySize) {
        return newHistory.slice(-maxHistorySize);
      }
      return newHistory;
    });
    
    const newIndex = currentIndex + 1;
    const finalIndex = newIndex >= maxHistorySize ? maxHistorySize - 1 : newIndex;
    setHistoryIndex(finalIndex);
    historyIndexRef.current = finalIndex;
  };

  // 撤销
  const handleUndo = () => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex < 0) {
      addLog("没有可撤销的操作");
      return;
    }
    
    const previousState = history[currentIndex];
    if (previousState) {
      setEditedData(previousState.editedData);
      setModifications(previousState.modifications);
      const newIndex = currentIndex - 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      addLog("已撤销上一步操作");
    }
  };

  // 重做
  const handleRedo = () => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex >= history.length - 1) {
      addLog("没有可重做的操作");
      return;
    }
    
    const nextState = history[currentIndex + 1];
    if (nextState) {
      setEditedData(nextState.editedData);
      setModifications(nextState.modifications);
      const newIndex = currentIndex + 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      addLog("已重做操作");
    }
  };

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

  // 计算显示的行数据（直接使用 result.rows，不再需要前端过滤）
  const filteredRows = useMemo(() => {
    return result?.rows || [];
  }, [result]);

  // 更新过滤值（不自动执行查询）
  const handleFilterChange = (columnName: string, value: string) => {
    const newFilters = {
      ...columnFilters,
      [columnName]: value,
    };
    
    // 如果值为空，移除该过滤
    if (value.trim() === "") {
      delete newFilters[columnName];
    }
    
    console.log('[ResultTable] handleFilterChange', {
      columnName,
      value,
      newFilters,
      oldFilters: columnFilters
    });
    
    setColumnFilters(newFilters);
    columnFiltersRef.current = newFilters;
  };

  // 手动触发查询（按 Enter 键时调用）
  const handleFilterSearch = (columnName: string) => {
    const filterValue = columnFilters[columnName] || "";
    const newFilters = { ...columnFilters };
    
    // 如果值为空，移除该过滤
    if (filterValue.trim() === "") {
      delete newFilters[columnName];
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:handleFilterSearch:ENTRY',message:'handleFilterSearch called',data:{columnName,filterValue,newFilters,currentFilters:columnFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    console.log('[ResultTable] handleFilterSearch', {
      columnName,
      filterValue,
      newFilters,
      currentFilters: columnFilters
    });
    
    // 方案5：在 handleFilterSearch 中，同时更新 ref 和 state，并使用多个保护措施
    // 先更新 ref（同步操作）
    columnFiltersRef.current = newFilters;
    
    // 更新过滤条件状态，确保输入框中的值保留
    setColumnFilters(newFilters);
    
    // 使用 setTimeout 确保在下一个事件循环中 ref 仍然是最新的
    setTimeout(() => {
      columnFiltersRef.current = newFilters;
    }, 0);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ResultTable.tsx:handleFilterSearch:AFTER_SET',message:'setColumnFilters called',data:{newFilters,refUpdated:columnFiltersRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // 清除之前的定时器
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // 立即执行查询
    executeFilteredSql(newFilters);
  };

  const handleClearFilter = (columnName: string) => {
    const newFilters = { ...columnFilters };
    delete newFilters[columnName];
    setColumnFilters(newFilters);
    columnFiltersRef.current = newFilters;
    
    // 清除之前的定时器
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // 立即执行（清除过滤不需要防抖）
    executeFilteredSql(newFilters);
  };

  // 清除所有过滤
  const handleClearAllFilters = () => {
    setColumnFilters({});
    
    // 清除之前的定时器
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    // 立即执行原始 SQL
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
  };

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
    
    // 保存当前状态到历史栈（在修改之前）
    saveToHistory();
    
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
      
      // 保存当前状态到历史栈（在修改之前）
      saveToHistory();
      
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
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [editMode, historyIndex, history, handleUndo, handleRedo, editingCell, selection, filteredRows, result.rows, editedData]);

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

  // 使用保存的列信息，如果当前 result 没有列但之前有列，使用之前的列
  const displayColumns = (result && result.columns.length > 0) 
    ? result.columns 
    : originalColumnsRef.current;
  const displayRows = result?.rows || [];

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
        {/* 编辑工具栏 */}
        {editMode && (
        <div className="px-4 py-2 neu-flat flex items-center gap-3" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--neu-accent)' }}>编辑模式</span>
            {modifications.size > 0 && (
              <span className="text-xs" style={{ color: 'var(--neu-warning)' }}>
                ({modifications.size} 个未保存的修改)
              </span>
            )}
            {selection && (
              <span className="text-xs" style={{ color: 'var(--neu-accent-light)' }}>
                (已选择: {
                  Math.abs(selection.end.row - selection.start.row) + 1
                } 行 × {
                  Math.abs(selection.end.col - selection.start.col) + 1
                } 列)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={historyIndex < 0}
              className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:hover:neu-flat"
              style={{ color: 'var(--neu-text)' }}
              title="撤销 (Ctrl+Z)"
            >
              ↶ 撤销
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:hover:neu-flat"
              style={{ color: 'var(--neu-text)' }}
              title="重做 (Ctrl+Y 或 Ctrl+Shift+Z)"
            >
              ↷ 重做
            </button>
            {selection && (
              <button
                onClick={() => setSelection(null)}
                className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
                style={{ color: 'var(--neu-text)' }}
                title="清除选择"
              >
                ✕
              </button>
            )}
            {modifications.size > 0 && (
              <button
                onClick={handleSaveChanges}
                disabled={isSaving || !currentConnectionId}
                className="px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-raised hover:neu-hover active:neu-active disabled:hover:neu-raised font-medium"
                style={{ color: 'var(--neu-success)' }}
                title="保存所有修改到数据库"
              >
                {isSaving ? "保存中..." : `💾 保存 (${modifications.size})`}
              </button>
            )}
            <button
              onClick={handleExitEditMode}
              className="px-3 py-1.5 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text)' }}
              title="退出编辑模式"
            >
              退出编辑
            </button>
          </div>
        </div>
      )}

      {/* SQL 显示栏 */}
      {sql && (
        <div className="px-4 py-2.5 neu-flat flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--neu-text-light)' }}>SQL:</span>
            <code 
              className="text-xs font-mono flex-1 break-all whitespace-pre-wrap" 
              style={{ color: 'var(--neu-text)', wordBreak: 'break-word', overflowWrap: 'break-word' }}
              title={hasActiveFilters ? buildFilteredSql(originalSqlRef.current || sql, columnFilters) : (originalSqlRef.current || sql)}
            >
              {hasActiveFilters ? buildFilteredSql(originalSqlRef.current || sql, columnFilters) : (originalSqlRef.current || sql)}
            </code>
            {hasActiveFilters && (
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--neu-accent)' }}>
                {isFiltering ? "(过滤中...)" : `(已过滤: ${displayRows.length} 条)`}
              </span>
            )}
            {!hasActiveFilters && (
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--neu-text-light)' }}>
                (共 {displayRows.length} 条)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="px-3 py-1.5 text-xs rounded transition-all neu-raised hover:neu-hover active:neu-active font-medium"
                style={{ color: 'var(--neu-success)' }}
                title="进入编辑模式（双击单元格可编辑）"
              >
                ✏️ 编辑模式
              </button>
            )}
            {hasActiveFilters && (
              <button
                onClick={handleClearAllFilters}
                disabled={isFiltering}
                className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: 'var(--neu-accent)' }}
                title="清除所有过滤"
              >
                {isFiltering ? "过滤中..." : "清除过滤"}
              </button>
            )}
            <button
              onClick={handleCopySql}
              className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text-light)' }}
              title="复制 SQL"
            >
              {copied ? "✓ 已复制" : "📋 复制"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="neu-raised sticky top-0 z-10">
            <tr>
              {displayColumns.map((column, index) => {
                const filterValue = columnFilters[column] || "";
                const hasFilter = filterValue.trim() !== "";
                const isExpanded = expandedSearchColumn === column;

                return (
                  <th
                    key={index}
                    className="px-4 py-3 text-left font-semibold uppercase text-xs tracking-wider relative group"
                    style={{ 
                      minWidth: "120px",
                      borderBottom: '1px solid var(--neu-dark)',
                      color: 'var(--neu-text)'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate">{column}</span>
                      {hasFilter && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full" title="已应用过滤"></span>
                      )}
                      <button
                        onClick={() => setExpandedSearchColumn(isExpanded ? null : column)}
                        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active ${
                          isExpanded || hasFilter
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                        style={{ color: isExpanded || hasFilter ? 'var(--neu-accent)' : 'var(--neu-text-light)' }}
                        title="搜索此列"
                      >
                        <span className="text-xs">🔍</span>
                      </button>
                    </div>
                    
                    {/* 搜索输入框 */}
                    {isExpanded && (
                      <div 
                        ref={(el) => { searchBoxRefs.current[column] = el; }}
                        className="absolute top-full left-0 right-0 mt-1 p-2 neu-raised rounded-lg z-20"
                      >
                        <div className="relative">
                          <input
                            type="text"
                            value={filterValue}
                            onChange={(e) => handleFilterChange(column, e.target.value)}
                            placeholder={`搜索 ${column}...`}
                            className="w-full px-2.5 py-1.5 pl-7 neu-pressed rounded text-sm focus:outline-none transition-all"
                            style={{ 
                              color: 'var(--neu-text)',
                              '--placeholder-color': 'var(--neu-text-light)'
                            } as React.CSSProperties}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setExpandedSearchColumn(null);
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                handleFilterSearch(column);
                              }
                            }}
                          />
                          <span className="absolute left-2 top-1.5 text-xs" style={{ color: 'var(--neu-text-light)' }}>
                            🔍
                          </span>
                          <div className="absolute right-2 top-1 flex items-center gap-1">
                            {filterValue && (
                              <button
                                onClick={() => {
                                  handleFilterSearch(column);
                                }}
                                disabled={isFiltering}
                                className="text-xs px-2 py-0.5 rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ color: 'var(--neu-accent)' }}
                                title="搜索 (Enter)"
                              >
                                {isFiltering ? "⏳" : "搜索"}
                              </button>
                            )}
                            {filterValue && (
                              <button
                                onClick={() => {
                                  handleClearFilter(column);
                                  setExpandedSearchColumn(null);
                                }}
                                disabled={isFiltering}
                                className="text-xs w-4 h-4 flex items-center justify-center rounded transition-all neu-flat hover:neu-hover disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ color: 'var(--neu-text-light)' }}
                                title="清除"
                              >
                                ✕
                              </button>
                            )}
                          </div>
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
                // 找到原始行索引
                const originalRowIndex = result.rows.findIndex((r) => r === row);
                const displayRow = originalRowIndex !== -1 ? editedData.rows[originalRowIndex] : row;
                
                return (
                  <tr
                    key={rowIndex}
                    className="transition-colors duration-150 group neu-flat"
                    style={{ borderBottom: '1px solid var(--neu-dark)' }}
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
                            px-4 py-2.5 relative
                            ${isEditing ? 'neu-pressed' : ''}
                            ${isSelected && !isEditing ? 'neu-raised' : ''}
                            ${isModified && !isEditing && !isSelected ? '' : ''}
                            ${editMode ? 'cursor-cell hover:neu-hover' : 'max-w-xs truncate'}
                            select-none
                          `}
                          style={{
                            color: isEditing ? 'var(--neu-accent-dark)' : isSelected ? 'var(--neu-accent-dark)' : isModified ? 'var(--neu-warning)' : 'var(--neu-text)',
                            borderLeft: isModified && !isEditing && !isSelected ? '2px solid var(--neu-warning)' : 'none'
                          }}
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
                              className="w-full neu-pressed px-2 py-1 rounded text-xs font-mono focus:outline-none transition-all"
                              style={{ color: 'var(--neu-text)' }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              {cell === null || cell === undefined
                                ? (
                                  <span className="italic font-mono text-xs" style={{ color: 'var(--neu-text-light)' }}>NULL</span>
                                )
                                : typeof cell === "object"
                                ? <span className="font-mono text-xs" style={{ color: 'var(--neu-text-light)' }}>{JSON.stringify(cell)}</span>
                                : <span className="font-mono text-xs">{String(cell)}</span>}
                              {isModified && (
                                <span className="absolute top-1 right-1 text-xs" style={{ color: 'var(--neu-warning)' }} title="已修改">●</span>
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

