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
        addLog(`🔌 正在连接到数据库: ${connection.name}...`);
        // Ensure connection is expanded
        setExpandedConnections(new Set([connection.id]));
        await handleConnectionClick(connection);
        
        // Wait for connection to be established (check store state)
        // Use a polling approach to check if connection is established
        addLog(`⏳ 等待连接建立...`);
        let attempts = 0;
        while (attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const store = useConnectionStore.getState();
          if (store.currentConnectionId === connection.id) {
            addLog(`✅ 连接已建立: ${connection.name}`);
            break;
          }
          attempts++;
          if (attempts % 5 === 0) {
            addLog(`⏳ 连接中... (${attempts * 100}ms)`);
          }
        }
        
        // Final check
        const finalStore = useConnectionStore.getState();
        if (finalStore.currentConnectionId !== connection.id) {
          throw new Error(`连接失败: ${connection.name}`);
        }
      } else {
        addLog(`✅ 已连接到: ${connection.name}`);
        // Ensure connection is expanded even if already connected
        setExpandedConnections(new Set([connection.id]));
      }

      // Restore database
      if (savedState.database !== null) {
        if (connection.type === "sqlite") {
          addLog(`📁 设置 SQLite 数据库...`);
          setCurrentDatabase("");
        } else {
          addLog(`📁 正在切换到数据库: ${savedState.database}...`);
          setCurrentDatabase(savedState.database);
          // Expand connection to show databases
          setExpandedConnections(new Set([connection.id]));
          // Load databases if needed
          if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
            addLog(`📋 正在加载数据库列表...`);
            await loadDatabases(connection.id);
          }
        }
        // Wait for database to be set
        addLog(`⏳ 等待数据库切换完成...`);
        let dbAttempts = 0;
        while (dbAttempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const store = useConnectionStore.getState();
          if (store.currentDatabase === savedState.database) {
            addLog(`✅ 已切换到数据库: ${savedState.database}`);
            // Scroll to the selected database after a short delay to ensure DOM is updated
            setTimeout(() => {
              const dbElement = document.querySelector(`[data-database="${savedState.database}"]`);
              if (dbElement) {
                dbElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                // Highlight the database briefly
                dbElement.classList.add('ring-2', 'ring-blue-400');
                setTimeout(() => {
                  dbElement.classList.remove('ring-2', 'ring-blue-400');
                }, 1000);
              }
            }, 200);
            break;
          }
          dbAttempts++;
        }
      }

      // Restore table
      if (savedState.table) {
        addLog(`📄 正在打开数据表: ${savedState.table}...`);
        setSelectedTable(savedState.table);
        // Wait for table to be set
        let tableAttempts = 0;
        while (tableAttempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const store = useConnectionStore.getState();
          if (store.selectedTable === savedState.table) {
            addLog(`✅ 已打开数据表: ${savedState.table}`);
            break;
          }
          tableAttempts++;
        }
      }

      // Restore SQL
      if (savedState.sql) {
        addLog(`📝 正在加载 SQL 查询...`);
        loadSql(savedState.sql);
        addLog(`✅ SQL 查询已加载`);
      }

      addLog(`🎉 工作状态已恢复: ${historyName}`);
      setShowHistory(false); // Close history panel after restoring
    } catch (error) {
      const errorMsg = String(error);
      addLog(`❌ 恢复工作状态失败: ${errorMsg}`);
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
  const autoHistory = workspaceHistory.filter(h => h.id.startsWith("auto-"));
  const manualHistory = workspaceHistory.filter(h => !h.id.startsWith("auto-"));

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-3 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <button
          onClick={() => {
            setEditingConnection(null);
            setShowForm(true);
          }}
          className="w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 neu-raised hover:neu-hover active:neu-active group"
          style={{ 
            color: 'var(--neu-accent)',
            letterSpacing: '0.01em',
          }}
        >
          <span className="inline-flex items-center w-full gap-2.5">
            <span 
              className="relative flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 group-hover:scale-110 group-active:scale-95 flex-shrink-0"
              style={{ 
                background: 'linear-gradient(135deg, rgba(91, 155, 213, 0.15) 0%, rgba(91, 155, 213, 0.05) 100%)',
                border: '1px solid rgba(91, 155, 213, 0.2)',
              }}
            >
              <span 
                className="text-base font-light leading-none"
                style={{ 
                  color: 'var(--neu-accent)',
                  transform: 'translateY(-0.5px)',
                }}
              >
                +
              </span>
            </span>
            <span className="transition-all duration-200 group-hover:translate-x-0.5 flex-shrink-0" style={{ fontWeight: 500 }}>新建连接</span>
          </span>
        </button>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 neu-raised hover:neu-hover active:neu-active group ${
            showHistory ? 'neu-pressed' : ''
          }`}
          style={{ 
            color: 'var(--neu-text)',
            letterSpacing: '0.01em',
          }}
          title="查看工作历史"
        >
          <span className="inline-flex items-center w-full gap-2.5">
            <span 
              className="relative flex items-center justify-center w-6 h-6 rounded transition-all duration-200 group-hover:scale-110 flex-shrink-0"
              style={{ 
                width: '24px',
                height: '24px',
              }}
            >
              {/* 三个重叠方块的图标 */}
              <span 
                className="absolute rounded transition-all duration-200"
                style={{ 
                  width: '11px',
                  height: '11px',
                  backgroundColor: '#66BB6A',
                  boxShadow: '1px 1px 3px rgba(0, 0, 0, 0.3), -0.5px -0.5px 1px rgba(255, 255, 255, 0.08)',
                  transform: 'translate(6px, 6px)',
                  zIndex: 1,
                  border: '0.5px solid rgba(0, 0, 0, 0.1)',
                }}
              />
              <span 
                className="absolute rounded transition-all duration-200"
                style={{ 
                  width: '11px',
                  height: '11px',
                  backgroundColor: '#EF5350',
                  boxShadow: '1px 1px 3px rgba(0, 0, 0, 0.3), -0.5px -0.5px 1px rgba(255, 255, 255, 0.08)',
                  transform: 'translate(4px, 4px)',
                  zIndex: 2,
                  border: '0.5px solid rgba(0, 0, 0, 0.1)',
                }}
              />
              <span 
                className="absolute rounded transition-all duration-200"
                style={{ 
                  width: '11px',
                  height: '11px',
                  backgroundColor: '#5B9BD5',
                  boxShadow: '1px 1px 3px rgba(0, 0, 0, 0.3), -0.5px -0.5px 1px rgba(255, 255, 255, 0.08)',
                  transform: 'translate(2px, 2px)',
                  zIndex: 3,
                  border: '0.5px solid rgba(0, 0, 0, 0.1)',
                }}
              />
            </span>
            <span className="transition-all duration-200 group-hover:translate-x-0.5 flex-shrink-0" style={{ fontWeight: 500 }}>历史</span>
            {workspaceHistory.length > 0 && (
              <span 
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 transition-all duration-200 group-hover:scale-110 ml-auto" 
                style={{ 
                  color: 'var(--neu-text)',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  minWidth: '22px',
                  textAlign: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  letterSpacing: '0.02em',
                }}
              >
                {workspaceHistory.length}
              </span>
            )}
          </span>
        </button>

        {showHistory && (
          <div className="neu-pressed rounded-lg max-h-96 overflow-auto">
            <div className="p-3 space-y-2">
              {autoHistory.length > 0 && (
                <div className="mb-3 pb-3" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
                  <div className="flex items-center gap-2 mb-2.5 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--neu-accent)' }}>最近自动保存</span>
                    <span className="flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--neu-accent), transparent)' }}></span>
                  </div>
                  <div className="space-y-1.5">
                    {autoHistory.map((history) => {
                      const historyConnection = connections.find(c => c.id === history.connectionId);
                      const pathParts = [
                        historyConnection?.name || "未知连接",
                        history.database && history.database !== "" ? history.database : null,
                        history.table
                      ].filter(Boolean);
                      
                      return (
                        <button
                          key={history.id}
                          onClick={() => handleRestoreWorkspace(history.id)}
                          className="w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all duration-200 group neu-flat hover:neu-hover active:neu-active"
                          style={{ color: 'var(--neu-text)' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs" style={{ color: 'var(--neu-accent)' }}>⚡</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {pathParts.map((part, idx) => (
                                    <span key={idx} className="flex items-center gap-1.5">
                                      <span className="font-medium text-xs" style={{ color: 'var(--neu-text)' }}>{part}</span>
                                      {idx < pathParts.length - 1 && (
                                        <span className="text-[10px]" style={{ color: 'var(--neu-text-light)' }}>→</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="text-[10px] font-mono ml-5" style={{ color: 'var(--neu-text-light)' }}>
                                {new Date(history.savedAt).toLocaleString("zh-CN", {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </div>
                            </div>
                            <span className="transition-colors flex-shrink-0 text-sm" style={{ color: 'var(--neu-text-light)' }}>▶</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {manualHistory.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2.5 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--neu-accent)' }}>已保存的工作</span>
                    <span className="flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--neu-accent), transparent)' }}></span>
                  </div>
                  <div className="space-y-1.5">
                    {manualHistory.map((history) => {
                      const historyConnection = connections.find(c => c.id === history.connectionId);
                      const pathParts = [
                        historyConnection?.name || "未知连接",
                        history.database && history.database !== "" ? history.database : null,
                        history.table
                      ].filter(Boolean);
                      
                      return (
                        <div
                          key={history.id}
                          className="group relative px-3 py-2.5 rounded-lg transition-all duration-200 neu-flat hover:neu-hover"
                        >
                          <button
                            onClick={() => handleRestoreWorkspace(history.id)}
                            className="w-full text-left"
                            style={{ color: 'var(--neu-text)' }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-xs" style={{ color: 'var(--neu-accent)' }}>💾</span>
                                  <div className="font-semibold text-xs break-words">{history.name}</div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap ml-5 mb-1">
                                  {pathParts.map((part, idx) => (
                                    <span key={idx} className="flex items-center gap-1.5">
                                      <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>{part}</span>
                                      {idx < pathParts.length - 1 && (
                                        <span className="text-[10px]" style={{ color: 'var(--neu-text-light)' }}>→</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                                <div className="text-[10px] font-mono ml-5" style={{ color: 'var(--neu-text-light)' }}>
                                  {new Date(history.savedAt).toLocaleString("zh-CN", {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </div>
                              </div>
                              <span className="transition-colors text-sm flex-shrink-0" style={{ color: 'var(--neu-text-light)' }}>▶</span>
                            </div>
                          </button>
                          <button
                            onClick={(e) => handleDeleteHistory(e, history.id)}
                            className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 p-1.5 rounded-md transition-all duration-200 neu-flat hover:neu-hover"
                            style={{ color: 'var(--neu-error)' }}
                            title="删除"
                          >
                            <span className="text-xs">🗑️</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : autoHistory.length === 0 && (
                <div className="text-center text-xs py-8" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="text-2xl mb-2 opacity-40">📚</div>
                  <div>暂无工作历史</div>
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
            <div className="text-sm mb-1 font-medium" style={{ color: 'var(--neu-text)' }}>暂无连接</div>
            <div className="text-xs" style={{ color: 'var(--neu-text-light)' }}>点击上方按钮创建新连接</div>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--neu-dark)' }}>
            {connections.map((connection) => {
              const isExpanded = expandedConnections.has(connection.id);
              const showDatabases = connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql";
              const isCurrentConnection = currentConnectionId === connection.id;
              const isConnecting = connectingConnections.has(connection.id);
              
              return (
                <div key={connection.id} style={{ borderBottom: '1px solid var(--neu-dark)' }}>
                  <div
                    className={`group relative p-3.5 transition-all duration-200 cursor-pointer ${
                      isConnecting
                        ? "neu-pressed"
                        : isCurrentConnection
                        ? "neu-raised"
                        : "neu-flat hover:neu-hover"
                    }`}
                    style={{
                      borderLeft: isConnecting ? '4px solid var(--neu-warning)' : isCurrentConnection ? '4px solid var(--neu-accent)' : '4px solid transparent'
                    }}
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
                          <div className="w-3 h-3 rounded-full animate-pulse" style={{ 
                            backgroundColor: 'var(--neu-warning)',
                            boxShadow: '0 0 10px var(--neu-warning), 0 0 20px rgba(255, 167, 38, 0.3)'
                          }} title="正在连接..."></div>
                        ) : isCurrentConnection ? (
                          <div className="w-3 h-3 rounded-full" style={{ 
                            backgroundColor: 'var(--neu-success)',
                            boxShadow: '0 0 10px var(--neu-success), 0 0 20px rgba(102, 187, 106, 0.3)'
                          }} title="已连接"></div>
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full neu-pressed" style={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.1)'
                          }} title="未连接"></div>
                        )}
                      </div>
                      
                      {/* 连接信息 */}
                      <div 
                        className="flex-1 min-w-0"
                        onClick={() => !isConnecting && handleConnectionClick(connection)}
                      >
                        <div className="font-semibold text-sm flex items-center gap-1.5 min-w-0" style={{ color: 'var(--neu-text)' }}>
                          <span className="break-words">{connection.name}</span>
                        </div>
                        <div className="text-xs mt-1 font-medium uppercase tracking-wide" style={{ color: 'var(--neu-text-light)' }}>
                          {connection.type}
                        </div>
                      </div>
                      
                      {/* 操作按钮组 */}
                      <div className={`flex items-center gap-1.5 transition-all duration-200 flex-shrink-0 ${
                        isConnecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                      }`}>
                        {/* 连接/断开按钮 */}
                        {isCurrentConnection ? (
                          // 已连接时显示断开按钮
                          <button
                            onClick={(e) => handleDisconnect(e, connection)}
                            disabled={isConnecting}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200 neu-hover neu-active neu-raised"
                            style={{ color: 'var(--neu-warning)' }}
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
                                ? "neu-pressed cursor-wait"
                                : "neu-flat hover:neu-hover active:neu-active"
                            }`}
                            style={{ color: isConnecting ? 'var(--neu-warning)' : 'var(--neu-text)' }}
                            title={isConnecting ? "正在连接..." : "连接"}
                          >
                            {isConnecting ? (
                              <svg className="animate-spin h-3.5 w-3.5" style={{ color: 'var(--neu-warning)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                          style={{ color: 'var(--neu-text)' }}
                          title="编辑"
                        >
                          <span className="text-xs">✏️</span>
                        </button>
                        
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => handleDelete(e, connection.id)}
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                          style={{ color: 'var(--neu-error)' }}
                          title="删除"
                        >
                          <span className="text-xs">🗑️</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && isCurrentConnection && (
                    <div className="neu-pressed pl-5 pr-3 py-2.5" style={{ borderLeft: '4px solid var(--neu-accent)' }}>
                      {showDatabases ? (
                        // MySQL/PostgreSQL/MSSQL: Show databases
                        <>
                          {loadingDatabases ? (
                            <div className="text-xs py-2.5 px-2 flex items-center gap-2" style={{ color: 'var(--neu-text-light)' }}>
                              <svg className="animate-spin h-3 w-3" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>加载中...</span>
                            </div>
                          ) : databases.length === 0 ? (
                            <div className="text-xs py-2.5 px-2" style={{ color: 'var(--neu-text-light)' }}>暂无数据库</div>
                          ) : (
                            <div className="space-y-1">
                              {databases.map((db) => {
                                const isSelected = currentDatabase === db;
                                
                                return (
                                  <div
                                    key={db}
                                    data-database={db}
                                    onClick={(e) => handleDatabaseClick(e, db)}
                                    className={`text-xs py-2 px-2.5 rounded-md cursor-pointer transition-all duration-200 truncate flex items-center gap-2 group ${
                                      isSelected
                                        ? "neu-raised"
                                        : "neu-flat hover:neu-hover"
                                    }`}
                                    style={{ 
                                      color: isSelected ? 'var(--neu-accent-dark)' : 'var(--neu-text)',
                                      fontWeight: isSelected ? '600' : 'normal'
                                    }}
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
                        <div className="text-xs py-2.5 px-2 flex items-center gap-2" style={{ color: 'var(--neu-text-light)' }}>
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

