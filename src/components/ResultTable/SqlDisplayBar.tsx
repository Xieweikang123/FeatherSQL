import { useState, useRef, useEffect } from "react";
import ViewStructureButton from "./ViewStructureButton";
import type { ExportFormat } from "../../utils/exportUtils";

interface SqlDisplayBarProps {
  sql: string | null;
  filteredSql: string | null;
  hasActiveFilters: boolean;
  isFiltering: boolean;
  rowCount: number;
  editMode: boolean;
  canViewStructure?: boolean;
  onEnterEditMode: () => void;
  onClearFilters: () => void;
  onViewStructure?: () => void;
  onExport?: (format: ExportFormat, exportSelected: boolean) => Promise<void>;
  hasSelectedRows?: boolean;
}

export default function SqlDisplayBar({
  sql,
  filteredSql,
  hasActiveFilters,
  isFiltering,
  rowCount,
  editMode,
  canViewStructure = false,
  onEnterEditMode,
  onClearFilters,
  onViewStructure,
  onExport,
  hasSelectedRows = false,
}: SqlDisplayBarProps) {
  const [copied, setCopied] = useState(false);
  
  // 调试：记录接收到的 SQL
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/201eadee-28d1-435d-93ff-d0c26bb03615',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SqlDisplayBar.tsx:38',message:'SqlDisplayBar received props',data:{sql,filteredSql,hasActiveFilters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.log('SqlDisplayBar received sql:', sql);
    console.log('SqlDisplayBar received filteredSql:', filteredSql);
  }, [sql, filteredSql]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const handleCopySql = async () => {
    // 复制实际执行的 SQL
    const sqlToCopy = filteredSql || sql;
    if (!sqlToCopy) return;
    try {
      await navigator.clipboard.writeText(sqlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy SQL:", error);
    }
  };

  // 处理导出菜单点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
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
      try {
        await onExport(format, exportSelected);
        // 显示成功提示
        const formatNames: Record<ExportFormat, string> = {
          csv: 'CSV',
          json: 'JSON',
          excel: 'Excel'
        };
        const exportType = exportSelected ? '选中行' : '全部数据';
        setExportSuccess(`已导出 ${formatNames[format]} (${exportType})`);
        setTimeout(() => setExportSuccess(null), 3000);
      } catch (error) {
        console.error('Export error:', error);
        // 错误信息已经在 onExport 中记录
      }
    } else {
      setShowExportMenu(false);
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
          title={filteredSql || sql}
        >
          {filteredSql || sql}
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
            {showExportMenu && (
              <div
                className="absolute right-0 mt-1 neu-raised rounded-lg shadow-lg py-1 z-50"
                style={{ minWidth: "180px" }}
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
                  </>
                )}
              </div>
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

