import { useState, useMemo, useEffect, useRef } from "react";
import { type QueryResult } from "../lib/commands";

interface ResultTableProps {
  result: QueryResult;
  sql?: string | null;
}

export default function ResultTable({ result, sql }: ResultTableProps) {
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [expandedSearchColumn, setExpandedSearchColumn] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const hasActiveFilters = Object.values(columnFilters).some(v => v.trim() !== "");

  if (!result || result.columns.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        无数据返回
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
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
              filteredRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors duration-150 group"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-4 py-2.5 text-gray-300 max-w-xs truncate group-hover:text-gray-200"
                      title={String(cell ?? "")}
                    >
                      {cell === null || cell === undefined
                        ? (
                          <span className="text-gray-500 italic font-mono text-xs">NULL</span>
                        )
                        : typeof cell === "object"
                        ? <span className="font-mono text-xs text-gray-400">{JSON.stringify(cell)}</span>
                        : <span className="font-mono text-xs">{String(cell)}</span>}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

