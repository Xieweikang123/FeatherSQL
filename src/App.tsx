import { useEffect, useState } from "react";
import ConnectionManager from "./components/ConnectionManager";
import SqlEditor from "./components/SqlEditor";
import ResultTable from "./components/ResultTable";
import SqlHistory from "./components/SqlHistory";
import { useConnectionStore } from "./store/connectionStore";
import { getConnections } from "./lib/commands";

function App() {
  const { setConnections, currentConnectionId, queryResult, error, logs, clearLogs } =
    useConnectionStore();
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

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
        {/* Left sidebar */}
        <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
          <ConnectionManager />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* SQL Editor */}
          <div className="flex-1 flex flex-col min-h-0">
            <SqlEditor />
          </div>

          {/* Result Table */}
          <div className="h-64 border-t border-gray-700 overflow-auto">
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
        </main>

        {/* Right sidebar - History */}
        {historyExpanded && (
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

