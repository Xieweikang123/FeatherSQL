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
    setIsQuerying,
  } = useConnectionStore();
  
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>("");

  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const connectionType = currentConnection?.type;

  useEffect(() => {
    const loadTables = async () => {
      if (!currentConnectionId) return;
      
      setLoading(true);
      try {
        // For SQLite, pass empty string; for others, pass currentDatabase or undefined
        const dbParam = connectionType === "sqlite" ? "" : (currentDatabase || undefined);
        const tableList = await listTables(currentConnectionId, dbParam);
        setTables(tableList);
        const dbName = connectionType === "sqlite" ? "SQLite" : currentDatabase;
        addLog(`已加载数据库 "${dbName}" 的 ${tableList.length} 个表`);
      } catch (error) {
        addLog(`加载表列表失败: ${error}`);
        setTables([]);
      } finally {
        setLoading(false);
      }
    };

    if (currentConnectionId) {
      // For SQLite, currentDatabase can be empty string
      // For other DBs, currentDatabase must be set
      if (connectionType === "sqlite" || currentDatabase) {
        loadTables();
      } else {
        setTables([]);
      }
    } else {
      setTables([]);
    }
  }, [currentConnectionId, currentDatabase, connectionType]);

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
    setIsQuerying(true);
    try {
      const dbParam = currentConnection.type === "sqlite" ? "" : (currentDatabase || undefined);
      const result = await executeSql(currentConnectionId, sql, dbParam);
      setQueryResult(result);
      addLog(`查询成功，返回 ${result.rows.length} 行`);
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`查询失败: ${errorMsg}`);
    } finally {
      setIsQuerying(false);
    }
  };

  if (!currentConnectionId) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-gray-800/80 bg-gray-900/50">
          <h2 className="text-sm font-semibold text-gray-300">数据表</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 text-sm">
            <div className="mb-3 text-4xl opacity-50">📁</div>
            <div className="font-medium">请先选择一个连接</div>
          </div>
        </div>
      </div>
    );
  }

  if (currentConnection?.type !== "sqlite" && !currentDatabase) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-gray-800/80 bg-gray-900/50">
          <h2 className="text-sm font-semibold text-gray-300">数据表</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400 text-sm">
            <div className="mb-3 text-4xl opacity-50">📁</div>
            <div className="font-medium">请先选择一个数据库</div>
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
      <div className="p-4 border-b border-gray-800/80 space-y-3 bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">
            数据表 {currentConnection?.type === "sqlite" ? (
              <span className="text-blue-400 font-normal">(SQLite)</span>
            ) : currentDatabase ? (
              <span className="text-blue-400 font-normal">({currentDatabase})</span>
            ) : null}
          </h2>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center hover:bg-gray-800/80 rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-200 hover:scale-110 active:scale-95 border border-gray-700/50"
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
            className="w-full px-3.5 py-2.5 pl-9 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
          />
          <span className="absolute left-3 top-3 text-gray-400 text-sm">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-white text-sm w-5 h-5 flex items-center justify-center hover:bg-gray-700/60 rounded transition-colors duration-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center text-gray-400 text-sm py-12 flex flex-col items-center gap-3">
            <svg className="animate-spin h-6 w-6 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>加载中...</span>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-12">
            <div className="text-4xl mb-3 opacity-40">📋</div>
            <div className="font-medium">
              {tables.length === 0 ? "暂无表" : "无匹配的表"}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredTables.map((table) => (
              <div
                key={table}
                onClick={() => handleTableClick(table)}
                className="group relative bg-gray-800/60 hover:bg-gray-800/90 border border-gray-700/50 hover:border-blue-500/60 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]"
                title={`点击查询表: ${table}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl transition-transform duration-200 group-hover:scale-110">📄</span>
                  <span className="text-sm text-gray-200 font-semibold truncate flex-1">
                    {table}
                  </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-blue-500/10 rounded-lg transition-all duration-200 pointer-events-none"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTables.map((table) => (
              <div
                key={table}
                onClick={() => handleTableClick(table)}
                className="text-sm text-gray-300 py-2.5 px-3.5 hover:bg-gray-800/80 rounded-lg cursor-pointer transition-all duration-200 truncate flex items-center gap-2.5 hover:scale-[1.01] border border-transparent hover:border-gray-700/50"
                title={`点击查询表: ${table}`}
              >
                <span className="text-base">📄</span>
                <span className="font-medium">{table}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

