import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { listTables, executeSql } from "../lib/commands";
import { buildTableName } from "../lib/utils";

export default function TableView() {
  const {
    connections,
    currentConnectionId,
    currentDatabase,
    setSelectedTable,
    setQueryResult,
    setError,
    addLog,
    loadSql,
  } = useConnectionStore();
  
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>("");

  const currentConnection = connections.find(c => c.id === currentConnectionId);

  useEffect(() => {
    if (currentConnectionId) {
      // For SQLite, currentDatabase can be empty string
      // For other DBs, currentDatabase must be set
      if (currentConnection?.type === "sqlite" || currentDatabase) {
        loadTables();
      } else {
        setTables([]);
      }
    } else {
      setTables([]);
    }
  }, [currentConnectionId, currentDatabase, currentConnection]);

  const loadTables = async () => {
    if (!currentConnectionId) return;
    
    setLoading(true);
    try {
      // For SQLite, pass empty string; for others, pass currentDatabase or undefined
      const dbParam = currentConnection?.type === "sqlite" ? "" : (currentDatabase || undefined);
      const tableList = await listTables(currentConnectionId, dbParam);
      setTables(tableList);
      const dbName = currentConnection?.type === "sqlite" ? "SQLite" : currentDatabase;
      addLog(`已加载数据库 "${dbName}" 的 ${tableList.length} 个表`);
    } catch (error) {
      addLog(`加载表列表失败: ${error}`);
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTableClick = async (tableName: string) => {
    if (!currentConnectionId || !currentConnection) {
      addLog("请先选择连接");
      return;
    }

    // Set selected table - this will switch to SQL editor view
    setSelectedTable(tableName);

    // Build escaped table name with database prefix if needed
    const escapedTableName = buildTableName(tableName, currentConnection.type, currentDatabase);
    const sql = `SELECT * FROM ${escapedTableName} LIMIT 100`;

    // Load SQL into editor
    loadSql(sql);
    const dbName = currentConnection.type === "sqlite" ? "SQLite" : currentDatabase;
    addLog(`查询表: ${tableName}${dbName ? ` (数据库: ${dbName})` : ""}`);

    // Execute query
    setError(null);
    try {
      const dbParam = currentConnection.type === "sqlite" ? "" : (currentDatabase || undefined);
      const result = await executeSql(currentConnectionId, sql, dbParam);
      setQueryResult(result);
      addLog(`查询成功，返回 ${result.rows.length} 行`);
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`查询失败: ${errorMsg}`);
    }
  };

  if (!currentConnectionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-300">数据表</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 text-sm">
            <div className="mb-2">📁</div>
            <div>请先选择一个连接</div>
          </div>
        </div>
      </div>
    );
  }

  if (currentConnection?.type !== "sqlite" && !currentDatabase) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-300">数据表</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 text-sm">
            <div className="mb-2">📁</div>
            <div>请先选择一个数据库</div>
          </div>
        </div>
      </div>
    );
  }

  const filteredTables = tables.filter(table =>
    table.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">
            数据表 {currentConnection?.type === "sqlite" ? (
              <span className="text-blue-400">(SQLite)</span>
            ) : currentDatabase ? (
              <span className="text-blue-400">({currentDatabase})</span>
            ) : null}
          </h2>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center hover:bg-gray-700/60 rounded transition-colors text-gray-400 hover:text-gray-300"
            title={viewMode === 'list' ? '切换到网格视图' : '切换到列表视图'}
          >
            <span className="text-sm">{viewMode === 'list' ? '⊞' : '☰'}</span>
          </button>
        </div>
        
        {/* Search box */}
        <div className="relative">
          <input
            type="text"
            placeholder="搜索表..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 pl-8 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="absolute left-2.5 top-2.5 text-gray-400 text-sm">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-2 text-gray-400 hover:text-white text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-8">加载中...</div>
        ) : filteredTables.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            {tables.length === 0 ? "暂无表" : "无匹配的表"}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredTables.map((table) => (
              <div
                key={table}
                onClick={() => handleTableClick(table)}
                className="group relative bg-gray-700/40 hover:bg-gray-700/80 border border-gray-600/50 hover:border-blue-500/50 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-blue-500/20"
                title={`点击查询表: ${table}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <span className="text-sm text-gray-300 font-medium truncate flex-1">
                    {table}
                  </span>
                </div>
                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 rounded-lg transition-colors pointer-events-none"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTables.map((table) => (
              <div
                key={table}
                onClick={() => handleTableClick(table)}
                className="text-sm text-gray-400 py-2 px-3 hover:bg-gray-700/60 rounded cursor-pointer transition-colors truncate flex items-center gap-2"
                title={`点击查询表: ${table}`}
              >
                <span>📄</span>
                <span>{table}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

