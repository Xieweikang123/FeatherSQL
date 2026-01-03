import { useEffect, useState, useRef, useCallback } from "react";
import ConnectionManager from "./components/ConnectionManager";
import SqlEditor from "./components/SqlEditor";
import ResultTable from "./components/ResultTable";
import SqlHistory from "./components/SqlHistory";
import TableView from "./components/TableView";
import TabBar from "./components/TabBar";
import { useConnectionStore } from "./store/connectionStore";
import { getConnections } from "./lib/commands";

const EDITOR_HEIGHT_RATIO_KEY = "feathersql_editor_height_ratio";

function App() {
  const { 
    setConnections, 
    currentConnectionId, 
    currentDatabase, 
    getCurrentTab,
    logs, 
    clearLogs,
  } = useConnectionStore();
  
  // 获取当前标签页状态
  const currentTab = getCurrentTab();
  const selectedTable = currentTab?.selectedTable || null;
  const queryResult = currentTab?.queryResult || null;
  const error = currentTab?.error || null;
  const isQuerying = currentTab?.isQuerying || false;
  const savedSql = currentTab?.sql || null;
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const [editorHeightRatio, setEditorHeightRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);

  useEffect(() => {
    // Load connections on mount
    getConnections()
      .then((connections) => {
        setConnections(connections);
        // Auto-restore is disabled - user can manually restore from history if needed
      })
      .catch((err) => {
        console.error("Failed to load connections:", err);
      });
  }, [setConnections]);

  // Load saved editor height ratio from localStorage
  useEffect(() => {
    const savedRatio = localStorage.getItem(EDITOR_HEIGHT_RATIO_KEY);
    if (savedRatio) {
      const ratio = parseFloat(savedRatio);
      if (!isNaN(ratio) && ratio > 0 && ratio < 1) {
        setEditorHeightRatio(ratio);
      }
    }
  }, []);

  // Apply saved ratio when container is ready or window resizes
  useEffect(() => {
    const updateHeight = () => {
      // Don't update during dragging - user is manually adjusting
      if (isDragging) return;
      
      if (editorHeightRatio !== null && mainContentRef.current) {
        const containerHeight = mainContentRef.current.clientHeight;
        const height = containerHeight * editorHeightRatio;
        setEditorHeight(height);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [editorHeightRatio, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    if (mainContentRef.current) {
      const rect = mainContentRef.current.getBoundingClientRect();
      const currentEditorHeight = editorHeight ?? rect.height * 0.6;
      dragStartHeight.current = currentEditorHeight;
    }
  }, [editorHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !mainContentRef.current) return;

      const deltaY = e.clientY - dragStartY.current;
      const newHeight = dragStartHeight.current + deltaY;
      const containerHeight = mainContentRef.current.clientHeight;

      // Constrain height between 20% and 80% of container
      const minHeight = containerHeight * 0.2;
      const maxHeight = containerHeight * 0.8;
      const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

      setEditorHeight(constrainedHeight);

      // Save ratio in real-time during drag
      const ratio = constrainedHeight / containerHeight;
      setEditorHeightRatio(ratio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Calculate and save the ratio directly using current editorHeight
      if (mainContentRef.current && editorHeight !== null) {
        const containerHeight = mainContentRef.current.clientHeight;
        const ratio = editorHeight / containerHeight;
        localStorage.setItem(EDITOR_HEIGHT_RATIO_KEY, ratio.toString());
        setEditorHeightRatio(ratio);
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, editorHeight]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--neu-bg)', color: 'var(--neu-text)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 neu-raised" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <h1 className="text-xl font-bold" style={{ 
          background: 'linear-gradient(135deg, var(--neu-accent-light) 0%, var(--neu-accent) 50%, var(--neu-accent-dark) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: '0 0 20px rgba(91, 155, 213, 0.3)',
          filter: 'drop-shadow(0 0 2px rgba(91, 155, 213, 0.5))'
        }}>
          FeatherSQL
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 neu-hover neu-active ${
              historyExpanded
                ? "neu-pressed"
                : "neu-flat"
            }`}
            style={{ color: historyExpanded ? 'var(--neu-accent-dark)' : 'var(--neu-text)' }}
          >
            {historyExpanded ? "隐藏历史" : "显示历史"}
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 neu-flat rounded-lg">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                currentConnectionId 
                  ? "animate-pulse" 
                  : ""
              }`}
              style={{ 
                backgroundColor: currentConnectionId ? 'var(--neu-success)' : 'rgba(255, 255, 255, 0.1)',
                boxShadow: currentConnectionId 
                  ? '0 0 10px var(--neu-success), 0 0 20px rgba(102, 187, 106, 0.3)' 
                  : 'inset 0 0 4px rgba(0, 0, 0, 0.5)'
              }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--neu-text)' }}>
              {currentConnectionId ? "已连接" : "未连接"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Connections */}
        <aside className="w-64 neu-raised flex flex-col" style={{ borderRight: '1px solid var(--neu-dark)' }}>
          <ConnectionManager />
        </aside>

        {/* Main content */}
        <main ref={mainContentRef} className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar - 始终显示 */}
          <TabBar />
          
          {/* 始终显示 SQL 编辑器 */}
          <>
            {/* SQL Editor */}
            <div 
              className="flex flex-col min-h-0"
              style={{ 
                height: editorHeight !== null ? `${editorHeight}px` : undefined,
                flex: editorHeight === null ? 1 : undefined
              }}
            >
              <SqlEditor />
            </div>

            {/* Resizable divider */}
            <div
              onMouseDown={handleMouseDown}
              className={`h-1.5 cursor-row-resize transition-all duration-200 group neu-flat ${
                isDragging ? "" : ""
              }`}
              style={{ 
                flexShrink: 0,
                backgroundColor: isDragging ? 'var(--neu-accent)' : 'var(--neu-bg)'
              }}
            >
              <div className="h-full w-full flex items-center justify-center">
                <div className={`w-16 h-1 rounded-full transition-all duration-200 ${
                  isDragging 
                    ? "" 
                    : ""
                }`} 
                style={{ 
                  backgroundColor: isDragging ? 'var(--neu-accent-light)' : 'rgba(255, 255, 255, 0.1)',
                  boxShadow: isDragging ? '0 0 4px var(--neu-accent)' : 'none'
                }} />
              </div>
            </div>

            {/* Result Table or TableView */}
            <div 
              className="overflow-auto neu-flat"
              style={{ 
                flex: editorHeight !== null ? 1 : undefined,
                height: editorHeight !== null ? undefined : "256px",
                borderTop: '1px solid var(--neu-dark)'
              }}
            >
              {error ? (
                <div className="p-4 neu-pressed rounded-lg m-4" style={{ 
                  borderLeft: '4px solid var(--neu-error)',
                  color: 'var(--neu-error)'
                }}>
                  <div className="font-semibold mb-1">错误:</div>
                  <div className="text-sm">{error}</div>
                </div>
              ) : isQuerying ? (
                <div className="p-8 text-center" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="flex justify-center mb-3">
                    <svg className="animate-spin h-8 w-8" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <div className="text-sm">查询中...</div>
                </div>
              ) : queryResult ? (
                <ResultTable result={queryResult} sql={savedSql} />
              ) : currentConnectionId && currentDatabase !== null ? (
                // 选中数据库但未选中表时：显示数据表视图
                <TableView />
              ) : (
                <div className="p-8 text-center" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="text-4xl mb-3 opacity-50">📊</div>
                  <div className="text-sm">执行 SQL 查询以查看结果</div>
                  {!currentConnectionId && (
                    <div className="mt-4 text-xs opacity-70">请先选择一个连接和数据库</div>
                  )}
                </div>
              )}
            </div>
          </>
        </main>

        {/* Right sidebar - History */}
        {historyExpanded && (
          <aside className="w-80 neu-raised flex flex-col" style={{ borderLeft: '1px solid var(--neu-dark)' }}>
            <SqlHistory />
          </aside>
        )}
      </div>

      {/* Logs panel */}
      <div className="neu-raised" style={{ borderTop: '1px solid var(--neu-dark)' }}>
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          className="w-full px-4 py-2.5 neu-flat hover:neu-hover active:neu-active text-left text-sm flex items-center justify-between transition-all duration-200"
          style={{ color: 'var(--neu-text)' }}
        >
          <span className="font-medium">日志</span>
          <span className="text-xs transition-transform duration-200" style={{ color: 'var(--neu-text-light)' }}>{logsExpanded ? "▼" : "▶"}</span>
        </button>
        {logsExpanded && (
          <div className="h-32 neu-pressed overflow-auto p-3 text-xs font-mono">
            {logs.length === 0 ? (
              <div className="text-center py-4" style={{ color: 'var(--neu-text-light)' }}>暂无日志</div>
            ) : (
              <>
                <button
                  onClick={clearLogs}
                  className="mb-3 px-3 py-1.5 neu-flat hover:neu-hover active:neu-active rounded-lg text-xs transition-all duration-200"
                  style={{ color: 'var(--neu-text)' }}
                >
                  清空日志
                </button>
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <div key={index} className="py-0.5 px-1 rounded transition-colors duration-150" style={{ color: 'var(--neu-text-light)' }}>
                      {log}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

