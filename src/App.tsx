import { useEffect, useState, useRef, useCallback } from "react";
import ConnectionManager from "./components/ConnectionManager";
import SqlEditor from "./components/SqlEditor";
import ResultTable from "./components/ResultTable";
import SqlHistory from "./components/SqlHistory";
import TableView from "./components/TableView";
import { useConnectionStore } from "./store/connectionStore";
import { getConnections } from "./lib/commands";

const EDITOR_HEIGHT_RATIO_KEY = "feathersql_editor_height_ratio";

function App() {
  const { setConnections, currentConnectionId, currentDatabase, selectedTable, queryResult, error, logs, clearLogs } =
    useConnectionStore();
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
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold">FeatherSQL</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className={`px-3 py-1 text-sm rounded ${
              historyExpanded
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            {historyExpanded ? "隐藏历史" : "显示历史"}
          </button>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                currentConnectionId ? "bg-green-500" : "bg-gray-500"
              }`}
            />
            <span className="text-sm text-gray-400">
              {currentConnectionId ? "已连接" : "未连接"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Connections */}
        <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
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
                className={`h-1 bg-gray-700 hover:bg-blue-600 cursor-row-resize transition-colors ${
                  isDragging ? "bg-blue-600" : ""
                }`}
                style={{ flexShrink: 0 }}
              >
                <div className="h-full w-full flex items-center justify-center">
                  <div className="w-12 h-0.5 bg-gray-500 rounded" />
                </div>
              </div>

              {/* Result Table */}
              <div 
                className="border-t border-gray-700 overflow-auto"
                style={{ 
                  flex: editorHeight !== null ? 1 : undefined,
                  height: editorHeight !== null ? undefined : "256px"
                }}
              >
                {error ? (
                  <div className="p-4 bg-red-900/20 text-red-400">
                    <div className="font-semibold">错误:</div>
                    <div>{error}</div>
                  </div>
                ) : queryResult ? (
                  <ResultTable result={queryResult} />
                ) : (
                  <div className="p-4 text-gray-400 text-center">
                    执行 SQL 查询以查看结果
                  </div>
                )}
              </div>
            </>
          ) : currentConnectionId && currentDatabase !== null ? (
            // 选中数据库但未选中表时：只显示数据表视图（不显示 SQL 编辑器）
            <div className="flex-1 flex overflow-hidden">
              {/* Tables View - 占据整个主内容区域 */}
              <div className="flex-1 bg-gray-800 flex flex-col">
                <TableView />
              </div>
              
              {/* History - 可选的侧边栏 */}
              {historyExpanded && (
                <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
                  <SqlHistory />
                </aside>
              )}
            </div>
          ) : (
            // 未选中数据库时：显示提示信息
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-4">📁</div>
                <div className="text-lg mb-2">请先选择一个数据库</div>
                <div className="text-sm text-gray-600">在左侧连接列表中选择一个数据库以查看数据表</div>
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar - History (only when table is selected) */}
        {selectedTable && historyExpanded && (
          <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <SqlHistory />
          </aside>
        )}
      </div>

      {/* Logs panel */}
      <div className="border-t border-gray-700">
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-left text-sm flex items-center justify-between"
        >
          <span>日志</span>
          <span>{logsExpanded ? "▼" : "▶"}</span>
        </button>
        {logsExpanded && (
          <div className="h-32 bg-gray-900 overflow-auto p-2 text-xs font-mono">
            {logs.length === 0 ? (
              <div className="text-gray-500">暂无日志</div>
            ) : (
              <>
                <button
                  onClick={clearLogs}
                  className="mb-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  清空日志
                </button>
                {logs.map((log, index) => (
                  <div key={index} className="text-gray-400 mb-1">
                    {log}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

