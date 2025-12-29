import { useEffect, useState } from "react";
import { getSqlHistory, deleteSqlHistory, type SqlHistory } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";

export default function SqlHistory() {
  const { currentConnectionId, loadSql } = useConnectionStore();
  const [history, setHistory] = useState<SqlHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SqlHistory | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await getSqlHistory(currentConnectionId || undefined, 100);
      setHistory(data);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [currentConnectionId]);

  const handleDelete = async (id?: string) => {
    try {
      await deleteSqlHistory(id);
      await loadHistory();
    } catch (error) {
      console.error("Failed to delete history:", error);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const truncateSql = (sql: string, maxLength: number = 100) => {
    if (sql.length <= maxLength) return sql;
    return sql.substring(0, maxLength) + "...";
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-sm font-medium">SQL 执行历史</span>
        <div className="flex gap-2">
          <button
            onClick={loadHistory}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
          >
            刷新
          </button>
          <button
            onClick={() => handleDelete()}
            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 rounded"
            title="清空所有历史记录"
          >
            清空
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            加载中...
          </div>
        ) : history.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            暂无历史记录
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {history.map((item) => (
              <div
                key={item.id}
                className={`p-3 hover:bg-gray-800 cursor-pointer transition-colors ${
                  selectedItem?.id === item.id ? "bg-gray-800" : ""
                }`}
                onClick={() => setSelectedItem(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          item.success ? "bg-green-500" : "bg-red-500"
                        }`}
                        title={item.success ? "成功" : "失败"}
                      />
                      <span className="text-xs text-gray-400">
                        {formatDate(item.executed_at)}
                      </span>
                      {item.rows_affected !== undefined && (
                        <span className="text-xs text-gray-500">
                          影响 {item.rows_affected} 行
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-300 font-mono">
                      {truncateSql(item.sql, 80)}
                    </div>
                    {item.error_message && (
                      <div className="text-xs text-red-400 mt-1">
                        {item.error_message}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="border-t border-gray-700 bg-gray-800 p-4 max-h-64 overflow-auto flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">SQL 详情</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  loadSql(selectedItem.sql);
                  setSelectedItem(null);
                }}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
                title="加载到编辑器"
              >
                加载
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-gray-400 hover:text-gray-300"
              >
                ×
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-words flex-1">
            {selectedItem.sql}
          </pre>
          {selectedItem.error_message && (
            <div className="mt-2 text-xs text-red-400">
              <strong>错误:</strong> {selectedItem.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

