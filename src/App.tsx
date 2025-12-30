import { useEffect, useState, useRef, useCallback } from "react";
import ConnectionManager from "./components/ConnectionManager";
import SqlEditor from "./components/SqlEditor";
import ResultTable from "./components/ResultTable";
import SqlHistory from "./components/SqlHistory";
import TableView from "./components/TableView";
import { useConnectionStore } from "./store/connectionStore";
import { getConnections, listDatabases } from "./lib/commands";

const EDITOR_HEIGHT_RATIO_KEY = "feathersql_editor_height_ratio";

function App() {
  const { 
    setConnections, 
    currentConnectionId, 
    currentDatabase, 
    selectedTable, 
    queryResult, 
    error, 
    logs, 
    clearLogs,
    setCurrentConnection,
    setCurrentDatabase,
    setSelectedTable,
    restoreWorkspaceState,
    loadSql,
    addLog,
    isQuerying,
  } = useConnectionStore();
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number | null>(null);
  const [editorHeightRatio, setEditorHeightRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [workspaceRestored, setWorkspaceRestored] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(0);

  useEffect(() => {
    // Load connections on mount
    getConnections()
      .then(async (connections) => {
        setConnections(connections);
        
        // Restore workspace state after connections are loaded
        if (!workspaceRestored) {
          const savedState = restoreWorkspaceState();
          if (savedState && savedState.connectionId) {
            // Find the connection in the loaded connections
            const connection = connections.find(c => c.id === savedState.connectionId);
            if (connection) {
              addLog("正在恢复上次的工作状态...");
              
              try {
                // Establish connection by testing it
                if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
                  await listDatabases(savedState.connectionId);
                } else if (connection.type === "sqlite") {
                  // SQLite connection is established when we set the database
                  setCurrentDatabase("");
                }
                
                // Set current connection
                setCurrentConnection(savedState.connectionId);
                
                // Restore database
                if (savedState.database !== null) {
                  if (connection.type !== "sqlite") {
                    setCurrentDatabase(savedState.database);
                  }
                }
                
                // Restore table and SQL after a short delay to allow connection to establish
                setTimeout(() => {
                  if (savedState.table) {
                    setSelectedTable(savedState.table);
                  }
                  if (savedState.sql) {
                    loadSql(savedState.sql);
                  }
                  addLog("已恢复上次的工作状态");
                }, 500);
              } catch (error) {
                const errorMsg = String(error);
                addLog(`恢复工作状态失败: ${errorMsg}`);
              }
            }
          }
          setWorkspaceRestored(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load connections:", err);
      });
  }, [setConnections, restoreWorkspaceState, setCurrentConnection, setCurrentDatabase, setSelectedTable, loadSql, addLog, workspaceRestored]);

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
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 bg-gray-900/95 border-b border-gray-800/80 backdrop-blur-sm shadow-sm">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          FeatherSQL
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 ${
              historyExpanded
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30"
                : "bg-gray-800/60 hover:bg-gray-700/80 text-gray-300 border border-gray-700/50"
            }`}
          >
            {historyExpanded ? "隐藏历史" : "显示历史"}
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                currentConnectionId 
                  ? "bg-green-400 shadow-sm shadow-green-400/50 animate-pulse" 
                  : "bg-gray-500"
              }`}
            />
            <span className="text-sm text-gray-300 font-medium">
              {currentConnectionId ? "已连接" : "未连接"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Connections */}
        <aside className="w-64 bg-gray-900/95 border-r border-gray-800/80 flex flex-col backdrop-blur-sm">
          <ConnectionManager />
        </aside>

        {/* Main content */}
        <main ref={mainContentRef} className="flex-1 flex flex-col overflow-hidden">
          {selectedTable ? (
            // 选中表时：只显示 SQL 编辑器（不显示数据表视图）
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
                className={`h-1.5 bg-gray-800/60 hover:bg-blue-600/80 cursor-row-resize transition-all duration-200 group ${
                  isDragging ? "bg-blue-600" : ""
                }`}
                style={{ flexShrink: 0 }}
              >
                <div className="h-full w-full flex items-center justify-center">
                  <div className={`w-16 h-1 rounded-full transition-all duration-200 ${
                    isDragging 
                      ? "bg-blue-400" 
                      : "bg-gray-600/60 group-hover:bg-blue-500/60"
                  }`} />
                </div>
              </div>

              {/* Result Table */}
              <div 
                className="border-t border-gray-800/80 overflow-auto bg-gray-900/50"
                style={{ 
                  flex: editorHeight !== null ? 1 : undefined,
                  height: editorHeight !== null ? undefined : "256px"
                }}
              >
                {error ? (
                  <div className="p-4 bg-red-950/40 border-l-4 border-red-500/60 text-red-300 rounded-r-lg m-4">
                    <div className="font-semibold text-red-200 mb-1">错误:</div>
                    <div className="text-sm">{error}</div>
                  </div>
                ) : isQuerying ? (
                  <div className="p-8 text-gray-400 text-center">
                    <div className="flex justify-center mb-3">
                      <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    <div className="text-sm">查询中...</div>
                  </div>
                ) : queryResult ? (
                  <ResultTable result={queryResult} />
                ) : (
                  <div className="p-8 text-gray-400 text-center">
                    <div className="text-4xl mb-3 opacity-50">📊</div>
                    <div className="text-sm">执行 SQL 查询以查看结果</div>
                  </div>
                )}
              </div>
            </>
          ) : currentConnectionId && currentDatabase !== null ? (
            // 选中数据库但未选中表时：只显示数据表视图（不显示 SQL 编辑器）
            <div className="flex-1 flex overflow-hidden">
              {/* Tables View - 占据整个主内容区域 */}
              <div className="flex-1 bg-gray-900/50 flex flex-col">
                <TableView />
              </div>
              
              {/* History - 可选的侧边栏 */}
              {historyExpanded && (
                <aside className="w-80 bg-gray-900/95 border-l border-gray-800/80 flex flex-col backdrop-blur-sm">
                  <SqlHistory />
                </aside>
              )}
            </div>
          ) : (
            // 未选中数据库时：显示提示信息
            <div className="flex-1 flex items-center justify-center bg-gray-900/30">
              <div className="text-center text-gray-400">
                <div className="text-5xl mb-5 opacity-60">📁</div>
                <div className="text-lg mb-2 text-gray-300 font-medium">请先选择一个数据库</div>
                <div className="text-sm text-gray-500">在左侧连接列表中选择一个数据库以查看数据表</div>
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar - History (only when table is selected) */}
        {selectedTable && historyExpanded && (
          <aside className="w-80 bg-gray-900/95 border-l border-gray-800/80 flex flex-col backdrop-blur-sm">
            <SqlHistory />
          </aside>
        )}
      </div>

      {/* Logs panel */}
      <div className="border-t border-gray-800/80 bg-gray-900/95 backdrop-blur-sm">
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          className="w-full px-4 py-2.5 bg-gray-900/60 hover:bg-gray-800/80 text-left text-sm flex items-center justify-between transition-colors duration-200 border-b border-gray-800/50"
        >
          <span className="font-medium text-gray-300">日志</span>
          <span className="text-gray-400 text-xs transition-transform duration-200">{logsExpanded ? "▼" : "▶"}</span>
        </button>
        {logsExpanded && (
          <div className="h-32 bg-gray-950/80 overflow-auto p-3 text-xs font-mono">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-4">暂无日志</div>
            ) : (
              <>
                <button
                  onClick={clearLogs}
                  className="mb-3 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-700/80 rounded-lg text-xs text-gray-300 hover:text-white transition-colors duration-200 border border-gray-700/50"
                >
                  清空日志
                </button>
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <div key={index} className="text-gray-400 hover:text-gray-300 transition-colors duration-150 py-0.5 px-1 rounded">
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

