import React, { useRef, useEffect } from "react";

interface TableHeaderProps {
  columns: string[];
  columnFilters: Record<string, string>;
  expandedSearchColumn: string | null;
  isFiltering: boolean;
  onFilterChange: (columnName: string, value: string) => void;
  onFilterSearch: (columnName: string) => void;
  onClearFilter: (columnName: string) => void;
  onExpandSearch: (columnName: string | null) => void;
}

export default function TableHeader({
  columns,
  columnFilters,
  expandedSearchColumn,
  isFiltering,
  onFilterChange,
  onFilterSearch,
  onClearFilter,
  onExpandSearch,
}: TableHeaderProps) {
  const searchBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  return (
    <thead className="neu-raised sticky top-0 z-10">
      <tr>
        {columns.map((column, index) => {
          const filterValue = columnFilters[column] || "";
          const hasFilter = filterValue.trim() !== "";
          const isExpanded = expandedSearchColumn === column;

          return (
            <th
              key={index}
              className="px-4 py-3 text-left font-semibold uppercase text-xs tracking-wider relative group"
              style={{
                minWidth: "120px",
                borderBottom: "1px solid var(--neu-dark)",
                color: "var(--neu-text)",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate">{column}</span>
                {hasFilter && (
                  <span
                    className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"
                    title="已应用过滤"
                  ></span>
                )}
                <button
                  onClick={() => onExpandSearch(isExpanded ? null : column)}
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
                  }}
                  className="absolute top-full left-0 right-0 mt-1 p-2 neu-raised rounded-lg z-20"
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

