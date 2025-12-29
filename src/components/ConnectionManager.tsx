import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import {
  getConnections,
  deleteConnection,
  disconnectConnection,
  listDatabases,
  listTables,
  executeSql,
  type Connection,
} from "../lib/commands";
import ConnectionForm from "./ConnectionForm";

export default function ConnectionManager() {
  const {
    connections,
    currentConnectionId,
    setConnections,
    setCurrentConnection,
    setCurrentDatabase,
    setQueryResult,
    setError,
    addLog,
    loadSql,
  } = useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [tables, setTables] = useState<Map<string, string[]>>(new Map());
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());
  const [connectingConnections, setConnectingConnections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const conns = await getConnections();
      setConnections(conns);
      addLog(`已加载 ${conns.length} 个连接`);
    } catch (error) {
      addLog(`加载连接失败: ${error}`);
    }
  };

  const handleConnectionClick = async (connection: Connection) => {
    // 如果已经在连接中，不重复连接
    if (connectingConnections.has(connection.id)) {
      return;
    }

    // 如果已经是当前连接，直接返回
    if (currentConnectionId === connection.id) {
      return;
    }

    // 设置连接状态
    setConnectingConnections(prev => new Set(prev).add(connection.id));
    addLog(`正在连接: ${connection.name}...`);

    try {
      // 尝试建立连接（通过列出数据库或表来测试连接）
      if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
        // 对于 MySQL/PostgreSQL/MSSQL，尝试列出数据库来测试连接
        await listDatabases(connection.id);
      } else if (connection.type === "sqlite") {
        // 对于 SQLite，尝试列出表来测试连接
        await listTables(connection.id, "");
      }

      // 连接成功，设置当前连接
      setCurrentConnection(connection.id);
      setCurrentDatabase(null);
      addLog(`已连接到: ${connection.name}`);

      // Reset databases and tables when switching connections
      setDatabases([]);
      setTables(new Map());
      setExpandedDatabases(new Set());
      
      // Load databases for MySQL/PostgreSQL/MSSQL connections if expanded
      if (expandedConnections.has(connection.id) && 
          (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql")) {
        loadDatabases(connection.id);
      }
      // For SQLite, load tables directly
      if (connection.type === "sqlite" && expandedConnections.has(connection.id)) {
        loadTables(connection.id, "");
      }
    } catch (error) {
      const errorMsg = String(error);
      addLog(`连接失败: ${connection.name} - ${errorMsg}`);
      setError(errorMsg);
    } finally {
      // 清除连接状态
      setConnectingConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(connection.id);
        return newSet;
      });
    }
  };

  const loadDatabases = async (connectionId: string) => {
    setLoadingDatabases(true);
    try {
      const dbList = await listDatabases(connectionId);
      setDatabases(dbList);
      addLog(`已加载 ${dbList.length} 个数据库`);
    } catch (error) {
      addLog(`加载数据库列表失败: ${error}`);
      setDatabases([]);
    } finally {
      setLoadingDatabases(false);
    }
  };

  const loadTables = async (connectionId: string, database: string) => {
    const key = `${connectionId}:${database}`;
    setLoadingTables(prev => new Set(prev).add(key));
    try {
      const tableList = await listTables(connectionId, database);
      setTables(prev => {
        const newMap = new Map(prev);
        newMap.set(key, tableList);
        return newMap;
      });
      addLog(`已加载数据库 "${database}" 的 ${tableList.length} 个表`);
    } catch (error) {
      addLog(`加载表列表失败: ${error}`);
      setTables(prev => {
        const newMap = new Map(prev);
        newMap.set(key, []);
        return newMap;
      });
    } finally {
      setLoadingTables(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  const toggleTableList = (e: React.MouseEvent, connectionId: string, database: string) => {
    e.stopPropagation();
    const key = `${connectionId}:${database}`;
    const newExpanded = new Set(expandedDatabases);

    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
      // Set current database when expanding
      setCurrentDatabase(database);
      // Load tables if not already loaded
      if (!tables.has(key)) {
        loadTables(connectionId, database);
      }
    }
    setExpandedDatabases(newExpanded);
  };

  const toggleDatabaseList = (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation();
    const connectionId = connection.id;
    
    // If clicking on a different connection, switch to it first
    if (currentConnectionId !== connectionId) {
      handleConnectionClick(connection);
    }
    
    const newExpanded = new Set(expandedConnections);
    if (newExpanded.has(connectionId)) {
      newExpanded.delete(connectionId);
      // Clear tables when collapsing
      setTables(new Map());
      setExpandedDatabases(new Set());
    } else {
      newExpanded.add(connectionId);
      // Load databases if not already loaded
      if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
        loadDatabases(connectionId);
      } else if (connection.type === "sqlite") {
        // For SQLite, load tables directly
        loadTables(connectionId, "");
      }
    }
    setExpandedConnections(newExpanded);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("确定要删除此连接吗？")) {
      try {
        await deleteConnection(id);
        addLog("连接已删除");
        if (currentConnectionId === id) {
          setCurrentConnection(null);
          setDatabases([]);
        }
        // Remove from expanded connections
        const newExpanded = new Set(expandedConnections);
        newExpanded.delete(id);
        setExpandedConnections(newExpanded);
        loadConnections();
      } catch (error) {
        addLog(`删除连接失败: ${error}`);
      }
    }
  };

  const handleEdit = (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation();
    setEditingConnection(connection);
    setShowForm(true);
  };

  const handleDisconnect = async (e: React.MouseEvent, connection: Connection) => {
    e.stopPropagation();
    try {
      await disconnectConnection(connection.id);
      // 如果断开的是当前连接，清除当前连接状态
      if (currentConnectionId === connection.id) {
        setCurrentConnection(null);
        setDatabases([]);
        setTables(new Map());
        setExpandedDatabases(new Set());
        setExpandedConnections(prev => {
          const newSet = new Set(prev);
          newSet.delete(connection.id);
          return newSet;
        });
      }
      addLog(`已断开连接: ${connection.name}`);
    } catch (error) {
      const errorMsg = String(error);
      addLog(`断开连接失败: ${connection.name} - ${errorMsg}`);
      setError(errorMsg);
    }
  };

  const handleTableClick = async (
    e: React.MouseEvent,
    connectionId: string,
    tableName: string,
    database?: string
  ) => {
    e.stopPropagation();

    if (!currentConnectionId || currentConnectionId !== connectionId) {
      addLog("请先选择该连接");
      return;
    }

    const connection = connections.find((c) => c.id === connectionId);

    if (!connection) {
      addLog("连接不存在");
      return;
    }

    // Set current database when clicking a table
    if (database) {
      setCurrentDatabase(database);
    }

    // Escape table name if needed (for MySQL/PostgreSQL with special characters)
    let escapedTableName = tableName;
    if (connection.type === "mysql") {
      // Use backticks for MySQL
      escapedTableName = `\`${tableName.replace(/`/g, "``")}\``;
      // If database is specified, use database.table format to ensure correct database context
      if (database) {
        const escapedDb = `\`${database.replace(/`/g, "``")}\``;
        escapedTableName = `${escapedDb}.${escapedTableName}`;
      }
    } else if (connection.type === "postgres") {
      // Use double quotes for PostgreSQL
      escapedTableName = `"${tableName.replace(/"/g, '""')}"`;
      // If database is specified, use database.table format
      if (database) {
        const escapedDb = `"${database.replace(/"/g, '""')}"`;
        escapedTableName = `${escapedDb}.${escapedTableName}`;
      }
    } else if (connection.type === "mssql") {
      // Use square brackets for MSSQL
      escapedTableName = `[${tableName.replace(/\]/g, "]]")}]`;
      // If database is specified, use database.table format
      if (database) {
        const escapedDb = `[${database.replace(/\]/g, "]]")}]`;
        escapedTableName = `${escapedDb}.${escapedTableName}`;
      }
    }

    const sql = `SELECT * FROM ${escapedTableName} LIMIT 100`;

    // Load SQL into editor
    loadSql(sql);
    addLog(`查询表: ${tableName}${database ? ` (数据库: ${database})` : ""}`);

    // Execute query
    setError(null);
    try {
      const result = await executeSql(connectionId, sql, database);
      setQueryResult(result);
      addLog(`查询成功，返回 ${result.rows.length} 行`);
    } catch (error) {
      const errorMsg = String(error);
      setError(errorMsg);
      addLog(`查询失败: ${errorMsg}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={() => {
            setEditingConnection(null);
            setShowForm(true);
          }}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg text-sm font-medium text-white transition-colors shadow-sm hover:shadow-md"
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-base">+</span>
            <span>新建连接</span>
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {connections.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-gray-500 text-sm mb-1">暂无连接</div>
            <div className="text-gray-600 text-xs">点击上方按钮创建新连接</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {connections.map((connection) => {
              const isExpanded = expandedConnections.has(connection.id);
              const showDatabases = connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql";
              const isCurrentConnection = currentConnectionId === connection.id;
              const isConnecting = connectingConnections.has(connection.id);
              
              return (
                <div key={connection.id}>
                  <div
                    className={`group relative p-3 transition-colors ${
                      isConnecting
                        ? "bg-gray-700/60 border-l-2 border-yellow-500 cursor-wait"
                        : isCurrentConnection
                        ? "bg-gray-700/80 border-l-2 border-blue-500 cursor-pointer"
                        : "hover:bg-gray-700/50 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 展开/收起按钮 - 移到左侧 */}
                      <button
                        onClick={(e) => toggleDatabaseList(e, connection)}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-gray-600 rounded transition-colors"
                        title={isExpanded ? "收起" : "展开"}
                        disabled={isConnecting}
                      >
                        <span className="text-xs text-gray-400 group-hover:text-gray-300">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                      </button>
                      
                      {/* 连接状态指示器 */}
                      <div className="flex-shrink-0 w-2.5 h-2.5 flex items-center justify-center">
                        {isConnecting ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse shadow-sm shadow-yellow-500/50" title="正在连接..."></div>
                        ) : isCurrentConnection ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm shadow-green-500/30" title="已连接"></div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-500" title="未连接"></div>
                        )}
                      </div>
                      
                      {/* 连接信息 */}
                      <div 
                        className="flex-1 min-w-0"
                        onClick={() => !isConnecting && handleConnectionClick(connection)}
                      >
                        <div className="font-medium text-sm text-white truncate flex items-center gap-1.5">
                          {connection.name}
                          {isConnecting && (
                            <span className="text-xs text-yellow-400 animate-pulse">连接中...</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {connection.type}
                        </div>
                      </div>
                      
                      {/* 操作按钮组 */}
                      <div className={`flex items-center gap-1 transition-opacity ${
                        isConnecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}>
                        {/* 连接/断开按钮 */}
                        {isCurrentConnection ? (
                          // 已连接时显示断开按钮
                          <button
                            onClick={(e) => handleDisconnect(e, connection)}
                            disabled={isConnecting}
                            className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-orange-600 hover:bg-orange-700 rounded transition-colors text-white"
                            title="断开连接"
                          >
                            <span className="text-xs">⏸</span>
                          </button>
                        ) : (
                          // 未连接时显示连接按钮
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isConnecting) {
                                handleConnectionClick(connection);
                              }
                            }}
                            disabled={isConnecting}
                            className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                              isConnecting
                                ? "bg-yellow-600 text-white cursor-wait"
                                : "bg-gray-600 hover:bg-gray-500 text-gray-300"
                            }`}
                            title={isConnecting ? "正在连接..." : "连接"}
                          >
                            {isConnecting ? (
                              <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <span className="text-xs">▶</span>
                            )}
                          </button>
                        )}
                        
                        {/* 编辑按钮 */}
                        <button
                          onClick={(e) => handleEdit(e, connection)}
                          className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded transition-colors text-gray-300"
                          title="编辑"
                        >
                          <span className="text-xs">✏️</span>
                        </button>
                        
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => handleDelete(e, connection.id)}
                          className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-600 hover:bg-red-600 rounded transition-colors text-gray-300 hover:text-white"
                          title="删除"
                        >
                          <span className="text-xs">🗑️</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && isCurrentConnection && (
                    <div className="bg-gray-800/40 border-l-2 border-gray-700/50 pl-4 pr-3 py-2">
                      {showDatabases ? (
                        // MySQL/PostgreSQL: Show databases
                        <>
                          {loadingDatabases ? (
                            <div className="text-xs text-gray-500 py-2 px-2">加载中...</div>
                          ) : databases.length === 0 ? (
                            <div className="text-xs text-gray-500 py-2 px-2">暂无数据库</div>
                          ) : (
                            <div className="space-y-0.5">
                              {databases.map((db) => {
                                const dbKey = `${connection.id}:${db}`;
                                const isDbExpanded = expandedDatabases.has(dbKey);
                                const dbTables = tables.get(dbKey) || [];
                                const isLoadingTables = loadingTables.has(dbKey);
                                
                                return (
                                  <div key={db} className="group/db">
                                    <div
                                      className="text-xs text-gray-400 py-1.5 px-2 hover:bg-gray-700/60 rounded cursor-pointer flex items-center gap-1.5 transition-colors"
                                      onClick={(e) => toggleTableList(e, connection.id, db)}
                                      title={db}
                                    >
                                      <span className="text-[10px] w-3 text-center">{isDbExpanded ? "▼" : "▶"}</span>
                                      <span className="flex-1 truncate">📁 {db}</span>
                                    </div>
                                    {isDbExpanded && (
                                      <div className="pl-5 mt-0.5">
                                        {isLoadingTables ? (
                                          <div className="text-xs text-gray-500 py-1 px-2">加载中...</div>
                                        ) : dbTables.length === 0 ? (
                                          <div className="text-xs text-gray-500 py-1 px-2">暂无表</div>
                                        ) : (
                                          <div className="space-y-0.5">
                                            {dbTables.map((table) => (
                                              <div
                                                key={table}
                                                onClick={(e) => handleTableClick(e, connection.id, table, db)}
                                                className="text-xs text-gray-500 py-1 px-2 hover:bg-gray-700/60 rounded cursor-pointer transition-colors truncate"
                                                title={`点击查询表: ${table}`}
                                              >
                                                📄 {table}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        // SQLite: Show tables directly
                        <>
                          {(() => {
                            const key = `${connection.id}:`;
                            // For SQLite, auto-expand when connection is expanded
                            const shouldShowTables = isExpanded;
                            const connectionTables = tables.get(key) || [];
                            const isLoadingTables = loadingTables.has(key);
                            
                            // Auto-load tables if connection is expanded and tables not loaded
                            if (shouldShowTables && !tables.has(key) && !isLoadingTables) {
                              loadTables(connection.id, "");
                            }
                            
                            if (!shouldShowTables) {
                              return null;
                            }
                            
                            return (
                              <div>
                                <div className="text-xs text-gray-400 py-1.5 px-2">
                                  <span>📁 表</span>
                                </div>
                                <div className="pl-4 mt-0.5">
                                  {isLoadingTables ? (
                                    <div className="text-xs text-gray-500 py-1 px-2">加载中...</div>
                                  ) : connectionTables.length === 0 ? (
                                    <div className="text-xs text-gray-500 py-1 px-2">暂无表</div>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {connectionTables.map((table) => (
                                        <div
                                          key={table}
                                          onClick={(e) => handleTableClick(e, connection.id, table)}
                                          className="text-xs text-gray-500 py-1 px-2 hover:bg-gray-700/60 rounded cursor-pointer transition-colors truncate"
                                          title={`点击查询表: ${table}`}
                                        >
                                          📄 {table}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <ConnectionForm
          connection={editingConnection}
          onClose={() => {
            setShowForm(false);
            setEditingConnection(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingConnection(null);
            loadConnections();
          }}
        />
      )}
    </div>
  );
}

