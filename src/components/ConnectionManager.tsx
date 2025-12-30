import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import {
  getConnections,
  deleteConnection,
  disconnectConnection,
  listDatabases,
  type Connection,
} from "../lib/commands";
import ConnectionForm from "./ConnectionForm";

export default function ConnectionManager() {
  const {
    connections,
    currentConnectionId,
    currentDatabase,
    setConnections,
    setCurrentConnection,
    setCurrentDatabase,
    setSelectedTable,
    restoreWorkspaceState,
    saveWorkspaceHistory,
    getWorkspaceHistory,
    restoreWorkspaceHistory,
    deleteWorkspaceHistory,
    loadSql,
    addLog,
  } = useConnectionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [connectingConnections, setConnectingConnections] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

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
        // 对于 SQLite，直接设置当前数据库为空字符串（SQLite 没有数据库概念）
        setCurrentDatabase("");
      }

      // 连接成功，设置当前连接
      setCurrentConnection(connection.id);
      setCurrentDatabase(null);
      addLog(`已连接到: ${connection.name}`);

      // Reset databases when switching connections
      setDatabases([]);
      
      // 收起之前的连接，然后展开新连接
      setExpandedConnections(new Set([connection.id]));
      
      // 自动加载数据库列表（MySQL/PostgreSQL/MSSQL）
      if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
        loadDatabases(connection.id);
      }
    } catch (error) {
      const errorMsg = String(error);
      addLog(`连接失败: ${connection.name} - ${errorMsg}`);
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


  const handleDatabaseClick = (e: React.MouseEvent, database: string) => {
    e.stopPropagation();
    // Set current database - this will trigger TableView to load tables
    setCurrentDatabase(database);
    addLog(`已选择数据库: ${database}`);
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
      // Clear current database when collapsing
      setCurrentDatabase(null);
    } else {
      newExpanded.add(connectionId);
      // Load databases if not already loaded
      if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
        loadDatabases(connectionId);
      }
      // SQLite tables will be loaded by TableView component
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
        setCurrentDatabase(null);
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
    }
  };

  const handleSaveWorkspace = () => {
    if (!currentConnectionId) {
      addLog("请先选择一个连接");
      return;
    }
    const historyId = saveWorkspaceHistory();
    if (historyId) {
      addLog("工作状态已保存");
      // Force re-render by toggling showHistory if it's open
      if (showHistory) {
        setShowHistory(false);
        setTimeout(() => setShowHistory(true), 10);
      }
    } else {
      addLog("保存工作状态失败");
    }
  };

  const handleRestoreWorkspace = async (historyId?: string) => {
    let savedState;
    let historyName = "工作状态";
    
    if (historyId) {
      const history = restoreWorkspaceHistory(historyId);
      if (!history) {
        addLog("找不到指定的工作历史");
        return;
      }
      historyName = history.name;
      savedState = {
        connectionId: history.connectionId,
        database: history.database,
        table: history.table,
        sql: history.sql,
      };
    } else {
      // Restore latest auto-save
      savedState = restoreWorkspaceState();
    }

    if (!savedState || !savedState.connectionId) {
      addLog("没有保存的工作状态");
      return;
    }

    // Find the connection
    const connection = connections.find(c => c.id === savedState.connectionId);
    if (!connection) {
      addLog(`无法恢复：连接配置不存在，可能已被删除`);
      return;
    }

    addLog(`正在恢复工作状态: ${historyName}...`);

    try {
      // Connect to the saved connection (even if not currently connected)
      if (currentConnectionId !== connection.id) {
        addLog(`正在连接到: ${connection.name}...`);
        await handleConnectionClick(connection);
        // Wait for connection to establish
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Verify connection was established
        if (currentConnectionId !== connection.id) {
          throw new Error(`连接失败: ${connection.name}`);
        }
      }

      // Restore database
      if (savedState.database !== null) {
        if (connection.type === "sqlite") {
          setCurrentDatabase("");
        } else {
          setCurrentDatabase(savedState.database);
          // Expand connection to show databases
          setExpandedConnections(new Set([connection.id]));
          // Load databases if needed
          if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
            await loadDatabases(connection.id);
          }
        }
        // Wait a bit for database to be set
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Restore table
      if (savedState.table) {
        setSelectedTable(savedState.table);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Restore SQL
      if (savedState.sql) {
        loadSql(savedState.sql);
      }

      addLog(`工作状态已恢复: ${historyName}`);
      setShowHistory(false); // Close history panel after restoring
    } catch (error) {
      const errorMsg = String(error);
      addLog(`恢复工作状态失败: ${errorMsg}`);
      // Don't close history panel on error so user can try again
    }
  };

  const handleDeleteHistory = (e: React.MouseEvent, historyId: string) => {
    e.stopPropagation();
    if (confirm("确定要删除这个工作历史吗？")) {
      deleteWorkspaceHistory(historyId);
      addLog("工作历史已删除");
      // Force re-render by toggling showHistory
      setShowHistory(false);
      setTimeout(() => setShowHistory(true), 10);
    }
  };


  const workspaceHistory = getWorkspaceHistory();
  const manualHistory = workspaceHistory.filter(h => !h.id.startsWith("auto-"));
  const latestAutoSave = workspaceHistory.find(h => h.id.startsWith("auto-"));

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800/80 space-y-3 bg-gray-900/50">
        <button
          onClick={() => {
            setEditingConnection(null);
            setShowForm(true);
          }}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:from-blue-800 active:to-blue-900 rounded-lg text-sm font-medium text-white transition-all duration-200 shadow-md shadow-blue-600/30 hover:shadow-lg hover:shadow-blue-600/40 hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-base font-bold">+</span>
            <span>新建连接</span>
          </span>
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleSaveWorkspace}
            disabled={!currentConnectionId}
            className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-700 disabled:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-all duration-200 shadow-md shadow-purple-600/30 hover:shadow-lg hover:shadow-purple-600/40 hover:scale-[1.02] active:scale-[0.98]"
            title="保存当前工作状态"
          >
            <span className="inline-flex items-center gap-1.5">
              <span>💾</span>
              <span>保存</span>
            </span>
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex-1 px-3 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 rounded-lg text-xs font-medium text-white transition-all duration-200 shadow-md shadow-cyan-600/30 hover:shadow-lg hover:shadow-cyan-600/40 hover:scale-[1.02] active:scale-[0.98]"
            title="查看工作历史"
          >
            <span className="inline-flex items-center gap-1.5">
              <span>📚</span>
              <span>历史</span>
              {workspaceHistory.length > 0 && (
                <span className="bg-cyan-500/30 px-1.5 py-0.5 rounded text-xs">
                  {workspaceHistory.length}
                </span>
              )}
            </span>
          </button>
        </div>

        {showHistory && (
          <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 max-h-96 overflow-auto">
            <div className="p-2 space-y-1">
              {latestAutoSave && (
                <div className="mb-2 pb-2 border-b border-gray-700/50">
                  <div className="text-xs text-gray-400 mb-1.5 px-2 font-medium">最近自动保存</div>
                  <button
                    onClick={() => handleRestoreWorkspace(latestAutoSave.id)}
                    className="w-full text-left px-3 py-2 bg-gray-700/40 hover:bg-gray-700/60 rounded-md text-xs transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-200 font-medium truncate">{latestAutoSave.name}</div>
                        <div className="text-gray-400 text-xs mt-0.5 truncate">
                          {new Date(latestAutoSave.savedAt).toLocaleString("zh-CN")}
                        </div>
                      </div>
                      <span className="text-gray-500 group-hover:text-green-400 transition-colors">⚡</span>
                    </div>
                  </button>
                </div>
              )}

              {manualHistory.length > 0 ? (
                <>
                  <div className="text-xs text-gray-400 mb-1.5 px-2 font-medium">已保存的工作</div>
                  {manualHistory.map((history) => {
                    const historyConnection = connections.find(c => c.id === history.connectionId);
                    return (
                      <div
                        key={history.id}
                        className="group relative px-3 py-2 bg-gray-700/40 hover:bg-gray-700/60 rounded-md transition-all duration-200"
                      >
                        <button
                          onClick={() => handleRestoreWorkspace(history.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-gray-200 font-medium text-xs truncate">{history.name}</div>
                              <div className="text-gray-400 text-xs mt-0.5 truncate">
                                {historyConnection?.name || "未知连接"}
                                {history.database && history.database !== "" && ` → ${history.database}`}
                                {history.table && ` → ${history.table}`}
                              </div>
                              <div className="text-gray-500 text-xs mt-0.5">
                                {new Date(history.savedAt).toLocaleString("zh-CN")}
                              </div>
                            </div>
                            <span className="text-gray-500 group-hover:text-green-400 transition-colors text-sm">⚡</span>
                          </div>
                        </button>
                        <button
                          onClick={(e) => handleDeleteHistory(e, history.id)}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition-all duration-200"
                          title="删除"
                        >
                          <span className="text-xs">🗑️</span>
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="text-center text-gray-500 text-xs py-4">
                  暂无保存的工作历史
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      <div className="flex-1 overflow-auto">
        {connections.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3 opacity-40">🔌</div>
            <div className="text-gray-400 text-sm mb-1 font-medium">暂无连接</div>
            <div className="text-gray-500 text-xs">点击上方按钮创建新连接</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {connections.map((connection) => {
              const isExpanded = expandedConnections.has(connection.id);
              const showDatabases = connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql";
              const isCurrentConnection = currentConnectionId === connection.id;
              const isConnecting = connectingConnections.has(connection.id);
              
              return (
                <div key={connection.id}>
                  <div
                    className={`group relative p-3.5 transition-all duration-200 ${
                      isConnecting
                        ? "bg-yellow-500/10 border-l-4 border-yellow-500 cursor-wait shadow-sm shadow-yellow-500/20"
                        : isCurrentConnection
                        ? "bg-blue-500/15 border-l-4 border-blue-500 cursor-pointer shadow-sm shadow-blue-500/20"
                        : "hover:bg-gray-800/60 cursor-pointer border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 展开/收起按钮 - 移到左侧 */}
                      <button
                        onClick={(e) => toggleDatabaseList(e, connection)}
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center hover:bg-gray-700/80 rounded-md transition-all duration-200 hover:scale-110"
                        title={isExpanded ? "收起" : "展开"}
                        disabled={isConnecting}
                      >
                        <span className={`text-xs transition-transform duration-200 ${
                          isExpanded ? "text-blue-400" : "text-gray-400 group-hover:text-gray-300"
                        }`}>
                          {isExpanded ? "▼" : "▶"}
                        </span>
                      </button>
                      
                      {/* 连接状态指示器 */}
                      <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
                        {isConnecting ? (
                          <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse shadow-md shadow-yellow-400/60 ring-2 ring-yellow-500/30" title="正在连接..."></div>
                        ) : isCurrentConnection ? (
                          <div className="w-3 h-3 rounded-full bg-green-400 shadow-md shadow-green-400/50 ring-2 ring-green-500/30" title="已连接"></div>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-500/60 ring-1 ring-gray-600/50" title="未连接"></div>
                        )}
                      </div>
                      
                      {/* 连接信息 */}
                      <div 
                        className="flex-1 min-w-0"
                        onClick={() => !isConnecting && handleConnectionClick(connection)}
                      >
                        <div className="font-semibold text-sm text-gray-100 truncate flex items-center gap-1.5">
                          {connection.name}
                          {isConnecting && (
                            <span className="text-xs text-yellow-400 animate-pulse font-normal">连接中...</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">
                          {connection.type}
                        </div>
                      </div>
                      
                      {/* 操作按钮组 */}
                      <div className={`flex items-center gap-1.5 transition-all duration-200 ${
                        isConnecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}>
                        {/* 连接/断开按钮 */}
                        {isCurrentConnection ? (
                          // 已连接时显示断开按钮
                          <button
                            onClick={(e) => handleDisconnect(e, connection)}
                            disabled={isConnecting}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-orange-600/80 hover:bg-orange-600 rounded-md transition-all duration-200 text-white hover:scale-110 active:scale-95 shadow-sm shadow-orange-600/30"
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
                            className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200 ${
                              isConnecting
                                ? "bg-yellow-600/80 text-white cursor-wait"
                                : "bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:scale-110 active:scale-95"
                            }`}
                            title={isConnecting ? "正在连接..." : "连接"}
                          >
                            {isConnecting ? (
                              <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gray-700/80 hover:bg-gray-600 rounded-md transition-all duration-200 text-gray-300 hover:text-white hover:scale-110 active:scale-95"
                          title="编辑"
                        >
                          <span className="text-xs">✏️</span>
                        </button>
                        
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => handleDelete(e, connection.id)}
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-gray-700/80 hover:bg-red-600/80 rounded-md transition-all duration-200 text-gray-300 hover:text-white hover:scale-110 active:scale-95"
                          title="删除"
                        >
                          <span className="text-xs">🗑️</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && isCurrentConnection && (
                    <div className="bg-gray-900/60 border-l-4 border-blue-500/30 pl-5 pr-3 py-2.5 backdrop-blur-sm">
                      {showDatabases ? (
                        // MySQL/PostgreSQL/MSSQL: Show databases
                        <>
                          {loadingDatabases ? (
                            <div className="text-xs text-gray-400 py-2.5 px-2 flex items-center gap-2">
                              <svg className="animate-spin h-3 w-3 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>加载中...</span>
                            </div>
                          ) : databases.length === 0 ? (
                            <div className="text-xs text-gray-500 py-2.5 px-2">暂无数据库</div>
                          ) : (
                            <div className="space-y-1">
                              {databases.map((db) => {
                                const isSelected = currentDatabase === db;
                                
                                return (
                                  <div
                                    key={db}
                                    onClick={(e) => handleDatabaseClick(e, db)}
                                    className={`text-xs py-2 px-2.5 rounded-md cursor-pointer transition-all duration-200 truncate flex items-center gap-2 group ${
                                      isSelected
                                        ? "bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40 shadow-sm shadow-blue-500/20"
                                        : "text-gray-400 hover:bg-gray-800/80 hover:text-gray-300 border border-transparent"
                                    }`}
                                    title={db}
                                  >
                                    <span className={`text-base transition-transform duration-200 ${
                                      isSelected ? "scale-110" : "group-hover:scale-110"
                                    }`}>📁</span>
                                    <span className="flex-1 truncate">{db}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        // SQLite: No database selection needed, tables will show in TableView
                        <div className="text-xs text-gray-400 py-2.5 px-2 flex items-center gap-2">
                          <span>✓</span>
                          <span>SQLite 数据库已连接，表将在右侧显示</span>
                        </div>
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

