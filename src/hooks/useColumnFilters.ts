import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useConnectionStore } from "../store/connectionStore";

/**
 * Hook to manage column filters with synchronization between ref and state
 */
export function useColumnFilters(sql: string | null | undefined) {
  const { columnFilters, setColumnFilters } = useConnectionStore();
  const columnFiltersRef = useRef<Record<string, string>>({});
  const lastFiltersRef = useRef<Record<string, string>>({});
  const originalSqlRef = useRef<string | null>(sql || null);

  // Sync ref and state on mount and when SQL changes
  useEffect(() => {
    if (sql && sql !== originalSqlRef.current) {
      // SQL changed, clear filters
      originalSqlRef.current = sql;
      setColumnFilters({});
      columnFiltersRef.current = {};
    } else if (sql) {
      originalSqlRef.current = sql;
      // Sync ref and state
      syncFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql]);

  // Sync filters between ref and state
  const syncFilters = () => {
    const refHasFilters = Object.keys(columnFiltersRef.current).length > 0;
    const stateHasFilters = Object.keys(columnFilters).length > 0;
    const lastHasFilters = Object.keys(lastFiltersRef.current).length > 0;

    if (refHasFilters && (!stateHasFilters || JSON.stringify(columnFiltersRef.current) !== JSON.stringify(columnFilters))) {
      setColumnFilters(columnFiltersRef.current);
    } else if (!refHasFilters && stateHasFilters) {
      columnFiltersRef.current = columnFilters;
      lastFiltersRef.current = columnFilters;
    } else if (!refHasFilters && !stateHasFilters && lastHasFilters) {
      columnFiltersRef.current = lastFiltersRef.current;
      setColumnFilters(lastFiltersRef.current);
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
  };

  return {
    columnFilters,
    columnFiltersRef,
    lastFiltersRef,
    originalSqlRef,
    updateFilters,
  };
}

