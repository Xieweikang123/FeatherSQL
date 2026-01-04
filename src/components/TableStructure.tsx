import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { describeTable, type ColumnInfo } from "../lib/commands";

interface TableStructureProps {
  tableName: string;
  onClose: () => void;
}

export default function TableStructure({ tableName, onClose }: TableStructureProps) {
  const {
    currentConnectionId,
    currentDatabase,
    connections,
  } = useConnectionStore();

  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const connectionType = currentConnection?.type;

  useEffect(() => {
    const loadStructure = async () => {
      if (!currentConnectionId) {
        setError("请先选择连接");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const dbParam = connectionType === "sqlite" ? "" : (currentDatabase || undefined);
        const structure = await describeTable(currentConnectionId, tableName, dbParam);
        setColumns(structure);
      } catch (err) {
        const errorMsg = String(err);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadStructure();
  }, [currentConnectionId, tableName, currentDatabase, connectionType]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text)' }}
              title="关闭"
            >
              ←
            </button>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
                表结构: {tableName}
              </h2>
              {currentConnection?.type === "sqlite" ? (
                <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>(SQLite)</span>
              ) : currentDatabase ? (
                <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>({currentDatabase})</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center text-sm py-12 flex flex-col items-center gap-3" style={{ color: 'var(--neu-text-light)' }}>
            <svg className="animate-spin h-6 w-6" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>加载中...</span>
          </div>
        ) : error ? (
          <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
            <div className="text-4xl mb-3 opacity-40">⚠️</div>
            <div className="font-medium">{error}</div>
          </div>
        ) : columns.length === 0 ? (
          <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
            <div className="text-4xl mb-3 opacity-40">📋</div>
            <div className="font-medium">暂无字段信息</div>
          </div>
        ) : (
          <div className="space-y-2">
            {columns.map((column, index) => (
              <div
                key={index}
                className="rounded-lg p-4 neu-flat"
                style={{ border: '1px solid var(--neu-dark)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
                        {column.name}
                      </span>
                      {column.primary_key && (
                        <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-accent)' }}>
                          PK
                        </span>
                      )}
                      {column.auto_increment && (
                        <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-accent)' }}>
                          AI
                        </span>
                      )}
                      {!column.nullable && (
                        <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-warning)' }}>
                          NOT NULL
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-xs" style={{ color: 'var(--neu-text-light)' }}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">类型:</span>
                        <span className="font-mono">{column.data_type}</span>
                      </div>
                      {column.default !== null && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">默认值:</span>
                          <span className="font-mono">{column.default}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium">可空:</span>
                        <span>{column.nullable ? "是" : "否"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

