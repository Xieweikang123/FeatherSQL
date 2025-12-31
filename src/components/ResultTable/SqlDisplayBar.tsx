import React, { useState } from "react";

interface SqlDisplayBarProps {
  sql: string | null;
  filteredSql: string | null;
  hasActiveFilters: boolean;
  isFiltering: boolean;
  rowCount: number;
  editMode: boolean;
  onEnterEditMode: () => void;
  onClearFilters: () => void;
}

export default function SqlDisplayBar({
  sql,
  filteredSql,
  hasActiveFilters,
  isFiltering,
  rowCount,
  editMode,
  onEnterEditMode,
  onClearFilters,
}: SqlDisplayBarProps) {
  const [copied, setCopied] = useState(false);

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

  if (!sql) return null;

  return (
    <div
      className="px-4 py-2.5 neu-flat flex items-center justify-between gap-3"
      style={{ borderBottom: "1px solid var(--neu-dark)" }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span
          className="text-xs font-semibold flex-shrink-0"
          style={{ color: "var(--neu-text-light)" }}
        >
          SQL:
        </span>
        <code
          className="text-xs font-mono flex-1 break-all whitespace-pre-wrap"
          style={{
            color: "var(--neu-text)",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
          title={hasActiveFilters ? filteredSql || sql : sql}
        >
          {hasActiveFilters ? filteredSql || sql : sql}
        </code>
        {hasActiveFilters && (
          <span className="text-xs flex-shrink-0" style={{ color: "var(--neu-accent)" }}>
            {isFiltering ? "(过滤中...)" : `(已过滤: ${rowCount} 条)`}
          </span>
        )}
        {!hasActiveFilters && (
          <span className="text-xs flex-shrink-0" style={{ color: "var(--neu-text-light)" }}>
            (共 {rowCount} 条)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!editMode && (
          <button
            onClick={onEnterEditMode}
            className="px-3 py-1.5 text-xs rounded transition-all neu-raised hover:neu-hover active:neu-active font-medium"
            style={{ color: "var(--neu-success)" }}
            title="进入编辑模式（双击单元格可编辑）"
          >
            ✏️ 编辑模式
          </button>
        )}
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            disabled={isFiltering}
            className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: "var(--neu-accent)" }}
            title="清除所有过滤"
          >
            {isFiltering ? "过滤中..." : "清除过滤"}
          </button>
        )}
        <button
          onClick={handleCopySql}
          className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
          style={{ color: "var(--neu-text-light)" }}
          title="复制 SQL"
        >
          {copied ? "✓ 已复制" : "📋 复制"}
        </button>
      </div>
    </div>
  );
}

