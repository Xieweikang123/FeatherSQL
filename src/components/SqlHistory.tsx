import { useEffect, useState } from "react";
import { getSqlHistory, deleteSqlHistory, getSettings, updateSettings, type SqlHistory, type AppSettings } from "../lib/commands";
import { useConnectionStore } from "../store/connectionStore";

export default function SqlHistory() {
  const { currentConnectionId, loadSql } = useConnectionStore();
  const [history, setHistory] = useState<SqlHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SqlHistory | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ max_history_count: 1000 });
  const [maxHistoryInput, setMaxHistoryInput] = useState<string>("1000");
  const [savingSettings, setSavingSettings] = useState(false);

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
    loadSettings();
  }, [currentConnectionId]);

  const loadSettings = async () => {
    try {
      const currentSettings = await getSettings();
      setSettings(currentSettings);
      setMaxHistoryInput(currentSettings.max_history_count.toString());
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const handleSaveSettings = async () => {
    const count = parseInt(maxHistoryInput, 10);
    if (isNaN(count) || count < 1 || count > 100000) {
      alert("最大历史记录数必须在 1 到 100000 之间");
      return;
    }
    
    setSavingSettings(true);
    try {
      const updatedSettings = await updateSettings({ max_history_count: count });
      setSettings(updatedSettings);
      setShowSettings(false);
    } catch (error: any) {
      alert(error.message || "保存设置失败");
    } finally {
      setSavingSettings(false);
    }
  };

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
    <div className="flex flex-col h-full" style={{ color: 'var(--neu-text)' }}>
      <div className="flex items-center justify-between px-4 py-2 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <span className="text-sm font-medium">SQL 执行历史</span>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
            style={{ color: 'var(--neu-text)' }}
            title="设置"
          >
            ⚙️
          </button>
          <button
            onClick={loadHistory}
            className="px-3 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
            style={{ color: 'var(--neu-text)' }}
          >
            刷新
          </button>
          <button
            onClick={() => handleDelete()}
            className="px-3 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
            style={{ color: 'var(--neu-error)' }}
            title="清空所有历史记录"
          >
            清空
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="neu-pressed p-4" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <div className="mb-3">
            <label className="block text-xs mb-2" style={{ color: 'var(--neu-text)' }}>
              最大历史记录数 (1-100000)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="100000"
                value={maxHistoryInput}
                onChange={(e) => setMaxHistoryInput(e.target.value)}
                className="flex-1 px-2 py-1 text-sm rounded neu-flat"
                style={{ 
                  color: 'var(--neu-text)',
                  backgroundColor: 'var(--neu-bg)',
                  border: '1px solid var(--neu-dark)'
                }}
              />
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-3 py-1 text-xs rounded transition-all neu-raised hover:neu-hover active:neu-active disabled:opacity-50"
                style={{ color: 'var(--neu-accent-dark)' }}
              >
                {savingSettings ? "保存中..." : "保存"}
              </button>
              <button
                onClick={() => {
                  setMaxHistoryInput(settings.max_history_count.toString());
                  setShowSettings(false);
                }}
                className="px-3 py-1 text-xs rounded transition-all neu-flat hover:neu-hover active:neu-active"
                style={{ color: 'var(--neu-text)' }}
              >
                取消
              </button>
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--neu-text-light)' }}>
              当前设置: {settings.max_history_count} 条
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--neu-text-light)' }}>
            加载中...
          </div>
        ) : history.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--neu-text-light)' }}>
            暂无历史记录
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--neu-dark)' }}>
            {history.map((item) => (
              <div
                key={item.id}
                className={`p-3 cursor-pointer transition-all ${
                  selectedItem?.id === item.id ? "neu-raised" : "neu-flat hover:neu-hover"
                }`}
                style={{ borderBottom: '1px solid var(--neu-dark)' }}
                onClick={() => setSelectedItem(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          item.success ? "" : ""
                        }`}
                        style={{ 
                          backgroundColor: item.success ? 'var(--neu-success)' : 'var(--neu-error)'
                        }}
                        title={item.success ? "成功" : "失败"}
                      />
                      <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>
                        {formatDate(item.executed_at)}
                      </span>
                      {item.rows_affected !== undefined && (
                        <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>
                          影响 {item.rows_affected} 行
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-mono" style={{ color: 'var(--neu-text)' }}>
                      {truncateSql(item.sql, 80)}
                    </div>
                    {item.error_message && (
                      <div className="text-xs mt-1" style={{ color: 'var(--neu-error)' }}>
                        {item.error_message}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="px-2 py-1 text-xs rounded transition-all neu-flat hover:neu-hover"
                    style={{ color: 'var(--neu-error)' }}
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
        <div className="neu-pressed p-4 max-h-64 overflow-auto flex flex-col" style={{ borderTop: '1px solid var(--neu-dark)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--neu-text)' }}>SQL 详情</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  loadSql(selectedItem.sql);
                  setSelectedItem(null);
                }}
                className="px-2 py-1 text-xs rounded transition-all neu-raised hover:neu-hover active:neu-active"
                style={{ color: 'var(--neu-accent-dark)' }}
                title="加载到编辑器"
              >
                加载
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className="transition-all"
                style={{ color: 'var(--neu-text-light)' }}
              >
                ×
              </button>
            </div>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-words flex-1" style={{ color: 'var(--neu-text)' }}>
            {selectedItem.sql}
          </pre>
          {selectedItem.error_message && (
            <div className="mt-2 text-xs" style={{ color: 'var(--neu-error)' }}>
              <strong>错误:</strong> {selectedItem.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

