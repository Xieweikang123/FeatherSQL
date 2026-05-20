import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ViewStructureButton from "./ViewStructureButton";
import { IconRefresh, IconSpinner, IconOpenInNewTab } from "../ConnectionManager/SidebarIcons";
import type { ExportFormat } from "../../utils/exportUtils";

interface SqlDisplayBarProps {
  sql: string | null;
  filteredSql: string | null;
  hasActiveFilters: boolean;
  hasActiveSort?: boolean;
  isFiltering: boolean;
  rowCount: number;
  editMode: boolean;
  canViewStructure?: boolean;
  onEnterEditMode: () => void;
  onClearFilters: () => void;
  onClearSort?: () => void;
  onViewStructure?: () => void;
  onExport?: (format: ExportFormat, exportSelected: boolean) => Promise<void>;
  hasSelectedRows?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenInNewTab?: () => void;
}

export default function SqlDisplayBar({
  sql,
  filteredSql,
  hasActiveFilters,
  hasActiveSort = false,
  isFiltering,
  rowCount,
  editMode,
  canViewStructure = false,
  onEnterEditMode,
  onClearFilters,
  onClearSort,
  onViewStructure,
  onExport,
  hasSelectedRows = false,
  onRefresh,
  isRefreshing = false,
  onOpenInNewTab,
}: SqlDisplayBarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // 打开菜单时计算位置并更新（用于 Portal 定位）
  useEffect(() => {
    if (showExportMenu && exportButtonRef.current) {
      const rect = exportButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.right - 180 });
    } else {
      setMenuPosition(null);
    }
  }, [showExportMenu]);

  // 处理导出菜单点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        const portalMenu = document.getElementById('export-menu-portal');
        if (!portalMenu?.contains(target)) {
          setShowExportMenu(false);
        }
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showExportMenu]);

  const handleExport = async (format: ExportFormat, exportSelected: boolean) => {
    if (onExport) {
      setShowExportMenu(false);
      setExportError(null);
      try {
        await onExport(format, exportSelected);
        // 显示成功提示
        const formatNames: Record<ExportFormat, string> = {
          csv: 'CSV',
          json: 'JSON',
          excel: 'Excel',
          sql: 'SQL'
        };
        const exportType = exportSelected ? '选中行' : '全部数据';
        setExportSuccess(`已导出 ${formatNames[format]} (${exportType})`);
        setTimeout(() => setExportSuccess(null), 3000);
      } catch (error) {
        console.error('Export error:', error);
        const message = error instanceof Error ? error.message : '导出失败';
        setExportError(message);
        setTimeout(() => setExportError(null), 3000);
      }
    } else {
      setShowExportMenu(false);
    }
  };

  if (!sql) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 flex-1 min-w-0"
      style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex" }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0" style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex" }}>
        <span
          className="text-xs font-semibold flex-shrink-0"
          style={{ color: "var(--neu-text-light)" }}
        >
          SQL:
        </span>
        <code
          className="text-xs font-mono"
          style={{
            color: "var(--neu-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
          title={filteredSql || sql}
        >
          {filteredSql || sql}
        </code>
        {onOpenInNewTab && (
          <button
            type="button"
            onClick={onOpenInNewTab}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
            style={{ color: "var(--neu-accent)" }}
            title="在新标签页打开"
          >
            <IconOpenInNewTab size={13} />
          </button>
        )}
        {hasActiveFilters && (
          <span className="text-xs flex-shrink-0" style={{ color: "var(--neu-accent)" }}>
            {isFiltering ? "(过滤中...)" : `(已过滤: ${rowCount} 条)`}
          </span>
        )}
        {!hasActiveFilters && (
          <span className="text-xs flex-shrink-0" style={{ color: "var(--neu-text-light)" }}>
            {isFiltering ? "(排序中...)" : `(共 ${rowCount} 条)`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRefresh && (
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={isRefreshing || isFiltering}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: "var(--neu-text)" }}
            title="刷新数据"
          >
            {isRefreshing ? <IconSpinner size={14} /> : <IconRefresh size={14} />}
          </button>
        )}
        {canViewStructure && onViewStructure && (
          <ViewStructureButton onClick={onViewStructure} />
        )}
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
        {onExport && (
          <div className="relative" ref={exportMenuRef}>
            <button
              ref={exportButtonRef}
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
              style={{ color: "var(--neu-text-light)" }}
              title="导出数据"
            >
              {exportSuccess ? "✓ 已导出" : "📥 导出"}
            </button>
            {exportSuccess && (
              <div
                className="absolute right-0 mt-1 px-3 py-2 text-xs rounded-lg shadow-lg z-50 neu-raised"
                style={{
                  backgroundColor: 'var(--neu-success)',
                  color: '#fff',
                  minWidth: '150px',
                  whiteSpace: 'nowrap',
                  animation: 'fadeIn 0.3s ease-in',
                  fontWeight: '500'
                }}
              >
                ✓ {exportSuccess}
              </div>
            )}
            {exportError && (
              <div
                className="absolute right-0 mt-1 px-3 py-2 text-xs rounded-lg shadow-lg z-50 neu-raised"
                style={{
                  backgroundColor: 'var(--neu-warning)',
                  color: '#fff',
                  minWidth: '150px',
                  whiteSpace: 'nowrap',
                  animation: 'fadeIn 0.3s ease-in',
                  fontWeight: '500'
                }}
              >
                ⚠ {exportError}
              </div>
            )}
            {showExportMenu && menuPosition && createPortal(
              <div
                id="export-menu-portal"
                className="neu-raised rounded-lg shadow-lg py-1"
                style={{
                  position: 'fixed',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  minWidth: "180px",
                  zIndex: 9999,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-xs font-semibold" style={{ color: "var(--neu-text-light)", borderBottom: "1px solid var(--neu-dark)" }}>
                  导出全部数据
                </div>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                  style={{ color: "var(--neu-text)" }}
                  onClick={() => handleExport('csv', false)}
                >
                  📄 CSV
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                  style={{ color: "var(--neu-text)" }}
                  onClick={() => handleExport('json', false)}
                >
                  📋 JSON
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                  style={{ color: "var(--neu-text)" }}
                  onClick={() => handleExport('excel', false)}
                >
                  📊 Excel
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                  style={{ color: "var(--neu-text)" }}
                  onClick={() => handleExport('sql', false)}
                >
                  📝 SQL (INSERT)
                </button>
                {hasSelectedRows && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold mt-1" style={{ color: "var(--neu-text-light)", borderTop: "1px solid var(--neu-dark)", borderBottom: "1px solid var(--neu-dark)" }}>
                      导出选中行
                    </div>
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                      style={{ color: "var(--neu-text)" }}
                      onClick={() => handleExport('csv', true)}
                    >
                      📄 CSV
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                      style={{ color: "var(--neu-text)" }}
                      onClick={() => handleExport('json', true)}
                    >
                      📋 JSON
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                      style={{ color: "var(--neu-text)" }}
                      onClick={() => handleExport('excel', true)}
                    >
                      📊 Excel
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm hover:neu-hover transition-colors"
                      style={{ color: "var(--neu-text)" }}
                      onClick={() => handleExport('sql', true)}
                    >
                      📝 SQL (INSERT)
                    </button>
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
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
        {hasActiveSort && onClearSort && (
          <button
            onClick={onClearSort}
            disabled={isFiltering}
            className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: "var(--neu-accent)" }}
            title="清除排序"
          >
            {isFiltering ? "排序中..." : "清除排序"}
          </button>
        )}
      </div>
    </div>
  );
}

