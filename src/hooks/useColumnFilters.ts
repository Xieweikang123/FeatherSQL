import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useConnectionStore } from "../store/connectionStore";

/**
 * Hook to manage column filters with synchronization between ref and state
 * @param isSqlFromFilter - 当为 true 时，sql 来自筛选结果，不更新 originalSqlRef（保留原始 SQL 供多次筛选使用）
 */
export function useColumnFilters(sql: string | null | undefined, initialFilters?: Record<string, string>, isSqlFromFilter?: boolean) {
  const { setColumnFilters } = useConnectionStore();
  const [columnFilters, setColumnFiltersState] = useState<Record<string, string>>(initialFilters || {});
  const columnFiltersRef = useRef<Record<string, string>>(initialFilters || {});
  const lastFiltersRef = useRef<Record<string, string>>(initialFilters || {});
  const originalSqlRef = useRef<string | null>(sql || null);

  // Sync with initial filters
  useEffect(() => {
    if (initialFilters && JSON.stringify(initialFilters) !== JSON.stringify(columnFilters)) {
      setColumnFiltersState(initialFilters);
      columnFiltersRef.current = initialFilters;
      lastFiltersRef.current = initialFilters;
    }
  }, [initialFilters]);

  // Sync ref and state on mount and when SQL changes
  useEffect(() => {
    if (!sql) return;
    if (sql !== originalSqlRef.current) {
      // sql 来自筛选结果时，不更新 originalSqlRef，避免多次筛选时 base SQL 被覆盖导致语法错误
      if (isSqlFromFilter) {
        syncFilters();
        return;
      }
      const hasRestoredFilters =
        initialFilters &&
        Object.values(initialFilters).some((value) => value.trim() !== "");
      if (hasRestoredFilters) {
        originalSqlRef.current = sql;
        setColumnFiltersState(initialFilters);
        columnFiltersRef.current = initialFilters;
        lastFiltersRef.current = initialFilters;
        return;
      }
      // SQL 变化（用户执行了新查询），更新 originalSqlRef 并清空筛选
      originalSqlRef.current = sql;
      setColumnFilters({});
      setColumnFiltersState({});
      columnFiltersRef.current = {};
    } else {
      originalSqlRef.current = sql;
      syncFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql, isSqlFromFilter]);

  // Sync filters between ref and state
  const syncFilters = () => {
    const refHasFilters = Object.keys(columnFiltersRef.current).length > 0;
    const stateHasFilters = Object.keys(columnFilters).length > 0;
    const lastHasFilters = Object.keys(lastFiltersRef.current).length > 0;

    if (refHasFilters && (!stateHasFilters || JSON.stringify(columnFiltersRef.current) !== JSON.stringify(columnFilters))) {
      setColumnFilters(columnFiltersRef.current);
      setColumnFiltersState(columnFiltersRef.current);
    } else if (!refHasFilters && stateHasFilters) {
      columnFiltersRef.current = columnFilters;
      lastFiltersRef.current = columnFilters;
    } else if (!refHasFilters && !stateHasFilters && lastHasFilters) {
      columnFiltersRef.current = lastFiltersRef.current;
      setColumnFilters(lastFiltersRef.current);
      setColumnFiltersState(lastFiltersRef.current);
    }
  };

  // Use layout effect to ensure sync before render
  useLayoutEffect(() => {
    syncFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnFilters]);

  // Update filters (both ref and state)
  const updateFilters = (filters: Record<string, string>) => {
    columnFiltersRef.current = filters;
    lastFiltersRef.current = filters;
    setColumnFilters(filters);
    setColumnFiltersState(filters);
  };

  return {
    columnFilters,
    columnFiltersRef,
    lastFiltersRef,
    originalSqlRef,
    updateFilters,
  };
}

