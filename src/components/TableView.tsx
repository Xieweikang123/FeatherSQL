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
        <div className="p-4 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>数据表</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-sm" style={{ color: 'var(--neu-text-light)' }}>
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
        <div className="p-4 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>数据表</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-sm" style={{ color: 'var(--neu-text-light)' }}>
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
      <div className="p-4 space-y-3 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
            数据表 {currentConnection?.type === "sqlite" ? (
              <span className="font-normal" style={{ color: 'var(--neu-accent)' }}>(SQLite)</span>
            ) : currentDatabase ? (
              <span className="font-normal" style={{ color: 'var(--neu-accent)' }}>({currentDatabase})</span>
            ) : null}
          </h2>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
            style={{ color: 'var(--neu-text)' }}
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
            className="w-full px-3.5 py-2.5 pl-9 neu-pressed rounded-lg text-sm focus:outline-none transition-all duration-200"
            style={{ color: 'var(--neu-text)' }}
          />
          <span className="absolute left-3 top-3 text-sm" style={{ color: 'var(--neu-text-light)' }}>🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-sm w-5 h-5 flex items-center justify-center rounded transition-all neu-flat hover:neu-hover"
              style={{ color: 'var(--neu-text-light)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center text-sm py-12 flex flex-col items-center gap-3" style={{ color: 'var(--neu-text-light)' }}>
            <svg className="animate-spin h-6 w-6" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>加载中...</span>
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
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
                className="group relative rounded-lg p-4 cursor-pointer transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                title={`点击查询表: ${table}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl transition-transform duration-200 group-hover:scale-110">📄</span>
                  <span className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--neu-text)' }}>
                    {table}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTables.map((table) => (
              <div
                key={table}
                onClick={() => handleTableClick(table)}
                className="text-sm py-2.5 px-3.5 rounded-lg cursor-pointer transition-all duration-200 truncate flex items-center gap-2.5 neu-flat hover:neu-hover active:neu-active"
                style={{ color: 'var(--neu-text)' }}
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

