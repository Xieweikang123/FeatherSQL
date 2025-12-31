import React from "react";

interface EditToolbarProps {
  modificationsCount: number;
  selection: { start: { row: number; col: number }; end: { row: number; col: number } } | null;
  canUndo: boolean;
  canRedo: boolean;
  isSaving: boolean;
  hasConnection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearSelection: () => void;
  onSave: () => void;
  onExit: () => void;
}

export default function EditToolbar({
  modificationsCount,
  selection,
  canUndo,
  canRedo,
  isSaving,
  hasConnection,
  onUndo,
  onRedo,
  onClearSelection,
  onSave,
  onExit,
}: EditToolbarProps) {
  return (
    <div
      className="px-4 py-2 neu-flat flex items-center gap-3"
      style={{ borderBottom: "1px solid var(--neu-dark)" }}
    >
      <div className="flex items-center gap-2 flex-1">
        <span className="text-xs font-semibold" style={{ color: "var(--neu-accent)" }}>
          编辑模式
        </span>
        {modificationsCount > 0 && (
          <span className="text-xs" style={{ color: "var(--neu-warning)" }}>
            ({modificationsCount} 个未保存的修改)
          </span>
        )}
        {selection && (
          <span className="text-xs" style={{ color: "var(--neu-accent-light)" }}>
            (已选择: {Math.abs(selection.end.row - selection.start.row) + 1} 行 ×{" "}
            {Math.abs(selection.end.col - selection.start.col) + 1} 列)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:hover:neu-flat"
          style={{ color: "var(--neu-text)" }}
          title="撤销 (Ctrl+Z)"
        >
          ↶ 撤销
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-flat hover:neu-hover active:neu-active disabled:hover:neu-flat"
          style={{ color: "var(--neu-text)" }}
          title="重做 (Ctrl+Y 或 Ctrl+Shift+Z)"
        >
          ↷ 重做
        </button>
        {selection && (
          <button
            onClick={onClearSelection}
            className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
            style={{ color: "var(--neu-text)" }}
            title="清除选择"
          >
            ✕
          </button>
        )}
        {modificationsCount > 0 && (
          <button
            onClick={onSave}
            disabled={isSaving || !hasConnection}
            className="px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed rounded transition-all neu-raised hover:neu-hover active:neu-active disabled:hover:neu-raised font-medium"
            style={{ color: "var(--neu-success)" }}
            title="保存所有修改到数据库"
          >
            {isSaving ? "保存中..." : `💾 保存 (${modificationsCount})`}
          </button>
        )}
        <button
          onClick={onExit}
          className="px-3 py-1.5 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
          style={{ color: "var(--neu-text)" }}
          title="退出编辑模式"
        >
          退出编辑
        </button>
      </div>
    </div>
  );
}

