import React, { useRef, useEffect, memo } from "react";

interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
}

interface TableHeaderProps {
  columns: string[];
  columnFilters: Record<string, string>;
  expandedSearchColumn: string | null;
  isFiltering: boolean;
  sortConfig: SortConfig[];
  onFilterChange: (columnName: string, value: string) => void;
  onFilterSearch: (columnName: string) => void;
  onClearFilter: (columnName: string) => void;
  onExpandSearch: (columnName: string | null) => void;
  onSort: (column: string, e: React.MouseEvent) => void;
}

function TableHeader({
  columns,
  columnFilters,
  expandedSearchColumn,
  isFiltering,
  sortConfig,
  onFilterChange,
  onFilterSearch,
  onClearFilter,
  onExpandSearch,
  onSort,
}: TableHeaderProps) {
  const searchBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  // Close search box when clicking outside
  useEffect(() => {
    if (!expandedSearchColumn) return;

    const handleClickOutside = (event: MouseEvent) => {
      const searchBox = searchBoxRefs.current[expandedSearchColumn];
      const target = event.target as HTMLElement;

      if (searchBox && !searchBox.contains(target)) {
        const isHeaderButton = target.closest("th")?.querySelector("button");
        if (!isHeaderButton || !isHeaderButton.contains(target)) {
          onExpandSearch(null);
        }
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expandedSearchColumn, onExpandSearch]);

  // 更新搜索框宽度以匹配 th 的实际宽度
  useEffect(() => {
    if (!expandedSearchColumn) return;

    const updateSearchBoxWidth = () => {
      const th = thRefs.current[expandedSearchColumn];
      const searchBox = searchBoxRefs.current[expandedSearchColumn];
      
      if (th && searchBox) {
        const thWidth = th.offsetWidth;
        searchBox.style.width = `${thWidth}px`;
      }
    };

    updateSearchBoxWidth();
    
    // 监听窗口大小变化
    window.addEventListener('resize', updateSearchBoxWidth);
    
    return () => {
      window.removeEventListener('resize', updateSearchBoxWidth);
    };
  }, [expandedSearchColumn]);

  return (
    <thead className="neu-raised sticky top-0" style={{ zIndex: 10 }}>
      <tr>
        <th
          className="px-4 py-3 text-center font-semibold uppercase text-xs tracking-wider"
          style={{
            width: "60px",
            minWidth: "60px",
            borderBottom: "1px solid var(--neu-dark)",
            color: "var(--neu-text)",
          }}
        >
          序号
        </th>
        {columns.map((column, index) => {
          const filterValue = columnFilters[column] || "";
          const hasFilter = filterValue.trim() !== "";
          const isExpanded = expandedSearchColumn === column;
          
          // 查找该列的排序配置
          const sortIndex = sortConfig.findIndex(s => s.column === column);
          const sortInfo = sortIndex !== -1 ? sortConfig[sortIndex] : null;
          const sortOrder = sortIndex !== -1 ? sortIndex + 1 : null; // 显示排序优先级（1, 2, 3...）

          return (
            <th
              key={index}
              ref={(el) => {
                thRefs.current[column] = el;
              }}
              className="px-4 py-3 text-left font-semibold uppercase text-xs tracking-wider relative group cursor-pointer"
              style={{
                ...({
                  minWidth: "120px",
                  borderBottom: "1px solid var(--neu-dark)",
                  color: "var(--neu-text)",
                  zIndex: isExpanded ? 1001 : 'auto',
                } as React.CSSProperties),
                userSelect: 'text',
                WebkitUserSelect: 'text',
                MozUserSelect: 'text',
                msUserSelect: 'text',
              }}
              onClick={(e) => {
                // 如果点击的是搜索按钮，不触发排序
                if ((e.target as HTMLElement).closest('button')) {
                  return;
                }
                onSort(column, e);
              }}
              title={sortInfo ? `按 ${column} ${sortInfo.direction === 'asc' ? '升序' : '降序'} 排序${sortOrder && sortOrder > 1 ? ` (第${sortOrder}优先级)` : ''}。按住 Shift 点击可添加多列排序` : `点击排序。按住 Shift 点击可添加多列排序`}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate">{column}</span>
                {sortInfo && (
                  <span
                    className="flex-shrink-0 flex items-center gap-0.5"
                    style={{ color: "var(--neu-accent)" }}
                    title={`${sortInfo.direction === 'asc' ? '升序' : '降序'}${sortOrder && sortOrder > 1 ? ` (第${sortOrder}优先级)` : ''}`}
                  >
                    {sortInfo.direction === 'asc' ? '↑' : '↓'}
                    {sortOrder && sortOrder > 1 && (
                      <span className="text-[10px] font-bold">{sortOrder}</span>
                    )}
                  </span>
                )}
                {hasFilter && (
                  <span
                    className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"
                    title="已应用过滤"
                  ></span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpandSearch(isExpanded ? null : column);
                  }}
                  className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active ${
                    isExpanded || hasFilter ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{
                    color: isExpanded || hasFilter ? "var(--neu-accent)" : "var(--neu-text-light)",
                  }}
                  title="搜索此列"
                >
                  <span className="text-xs">🔍</span>
                </button>
              </div>

              {/* Search input box */}
              {isExpanded && (
                <div
                  ref={(el) => {
                    searchBoxRefs.current[column] = el;
                    // 立即设置宽度
                    if (el) {
                      const th = el.closest('th') as HTMLTableCellElement;
                      if (th) {
                        el.style.width = `${th.offsetWidth}px`;
                      }
                    }
                  }}
                  className="absolute top-full left-0 mt-1 p-2 neu-raised rounded-lg"
                  style={{ 
                    zIndex: 1000,
                    boxSizing: 'border-box',
                    minWidth: '200px'
                  }}
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={filterValue}
                      onChange={(e) => onFilterChange(column, e.target.value)}
                      placeholder={`搜索 ${column}...`}
                      className="w-full px-2.5 py-1.5 pl-7 neu-pressed rounded text-sm focus:outline-none transition-all"
                      style={{
                        color: "var(--neu-text)",
                      } as React.CSSProperties}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          onExpandSearch(null);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          onFilterSearch(column);
                        }
                      }}
                    />
                    <span
                      className="absolute left-2 top-1.5 text-xs"
                      style={{ color: "var(--neu-text-light)" }}
                    >
                      🔍
                    </span>
                    <div className="absolute right-2 top-1 flex items-center gap-1">
                      {filterValue && (
                        <button
                          onClick={() => onFilterSearch(column)}
                          disabled={isFiltering}
                          className="text-xs px-2 py-0.5 rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: "var(--neu-accent)" }}
                          title="搜索 (Enter)"
                        >
                          {isFiltering ? "⏳" : "搜索"}
                        </button>
                      )}
                      {filterValue && (
                        <button
                          onClick={() => {
                            onClearFilter(column);
                            onExpandSearch(null);
                          }}
                          disabled={isFiltering}
                          className="text-xs w-4 h-4 flex items-center justify-center rounded transition-all neu-flat hover:neu-hover disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: "var(--neu-text-light)" }}
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
  );
}

// 使用 memo 优化，避免不必要的重渲染
export default memo(TableHeader, (prevProps, nextProps) => {
  // 自定义比较函数，只在关键属性变化时重新渲染
  return (
    prevProps.columns === nextProps.columns &&
    JSON.stringify(prevProps.columnFilters) === JSON.stringify(nextProps.columnFilters) &&
    prevProps.expandedSearchColumn === nextProps.expandedSearchColumn &&
    prevProps.isFiltering === nextProps.isFiltering &&
    JSON.stringify(prevProps.sortConfig) === JSON.stringify(nextProps.sortConfig)
  );
});

