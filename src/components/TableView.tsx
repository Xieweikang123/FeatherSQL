import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import { listTables, executeSql, listDatabases } from "../lib/commands";
import { buildTableName } from "../lib/utils";
import TableStructure from "./TableStructure";
import ImportDialog from "./ImportDialog";

interface DatabaseTables {
  [database: string]: string[];
}

export default function TableView() {
  const {
    connections,
    currentConnectionId,
    currentDatabase,
    setCurrentDatabase,
    getCurrentTab,
    updateTab,
    setSelectedTable,
    addLog,
    loadSql,
  } = useConnectionStore();
  
  const [databases, setDatabases] = useState<string[]>([]);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTables>({});
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [loadingDatabases, setLoadingDatabases] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewingStructure, setViewingStructure] = useState<string | null>(null);
  const [importingTable, setImportingTable] = useState<string | null>(null);
  const [importingTableDb, setImportingTableDb] = useState<string | null>(null);

  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const connectionType = currentConnection?.type;

  // Load databases list
  useEffect(() => {
    const loadDatabases = async () => {
      if (!currentConnectionId || connectionType === "sqlite") {
        setDatabases([]);
        return;
      }
      
      setLoading(true);
      try {
        const dbList = await listDatabases(currentConnectionId);
        setDatabases(dbList);
        addLog(`已加载 ${dbList.length} 个数据库`);
      } catch (error) {
        addLog(`加载数据库列表失败: ${error}`);
        setDatabases([]);
      } finally {
        setLoading(false);
      }
    };

    if (currentConnectionId && connectionType !== "sqlite") {
      loadDatabases();
    }
  }, [currentConnectionId, connectionType]);

  // Load tables for SQLite (single database)
  useEffect(() => {
    const loadTables = async () => {
      if (!currentConnectionId || connectionType !== "sqlite") return;
      
      setLoading(true);
      try {
        const tableList = await listTables(currentConnectionId, "");
        setDatabaseTables({ "SQLite": tableList });
        addLog(`已加载 SQLite 的 ${tableList.length} 个表`);
      } catch (error) {
        addLog(`加载表列表失败: ${error}`);
        setDatabaseTables({});
      } finally {
        setLoading(false);
      }
    };

    if (currentConnectionId && connectionType === "sqlite") {
      loadTables();
    }
  }, [currentConnectionId, connectionType]);

  const loadTablesForDatabase = async (database: string) => {
    if (!currentConnectionId || databaseTables[database]) {
      return; // Already loaded
    }

    setLoadingDatabases(prev => new Set([...prev, database]));
    try {
      const tableList = await listTables(currentConnectionId, database);
      setDatabaseTables(prev => ({ ...prev, [database]: tableList }));
      addLog(`已加载数据库 "${database}" 的 ${tableList.length} 个表`);
    } catch (error) {
      addLog(`加载数据库 "${database}" 的表列表失败: ${error}`);
      setDatabaseTables(prev => ({ ...prev, [database]: [] }));
    } finally {
      setLoadingDatabases(prev => {
        const next = new Set(prev);
        next.delete(database);
        return next;
      });
    }
  };

  // Auto-expand current database if set
  useEffect(() => {
    if (currentDatabase && !expandedDatabases.has(currentDatabase)) {
      setExpandedDatabases(prev => new Set([...prev, currentDatabase]));
      loadTablesForDatabase(currentDatabase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDatabase]);

  const toggleDatabase = (database: string) => {
    setExpandedDatabases(prev => {
      const next = new Set(prev);
      if (next.has(database)) {
        next.delete(database);
      } else {
        next.add(database);
        loadTablesForDatabase(database);
      }
      return next;
    });
  };

  const handleTableClick = async (tableName: string, database: string, showStructure: boolean = false) => {
    if (!currentConnectionId || !currentConnection) {
      addLog("请先选择连接");
      return;
    }

    // If right-click or Ctrl+click, show structure instead
    if (showStructure) {
      // Set current database if different (for non-SQLite)
      if (connectionType !== "sqlite" && database !== currentDatabase) {
        setCurrentDatabase(database);
      }
      setViewingStructure(tableName);
      return;
    }

    // Set current database if different
    if (connectionType !== "sqlite" && database !== currentDatabase) {
      setCurrentDatabase(database);
    }

    // Set selected table - this will switch to SQL editor view
    setSelectedTable(tableName);

    // Build escaped table name with database prefix if needed
    const escapedTableName = buildTableName(tableName, currentConnection.type, database);
    // Use TOP for MSSQL, LIMIT for other databases
    const sql = currentConnection.type === "mssql" 
      ? `SELECT TOP 100 * FROM ${escapedTableName}`
      : `SELECT * FROM ${escapedTableName} LIMIT 100`;

    // Load SQL into editor
    loadSql(sql);
    addLog(`查询表: ${tableName}${database ? ` (数据库: ${database})` : ""}`);

    // Execute query
    const currentTab = getCurrentTab();
    if (!currentTab) return;
    
    updateTab(currentTab.id, { error: null, isQuerying: true });
    try {
      const dbParam = currentConnection.type === "sqlite" ? "" : (database || undefined);
      const result = await executeSql(currentConnectionId, sql, dbParam);
      updateTab(currentTab.id, { queryResult: result, error: null, isQuerying: false });
      addLog(`查询成功，返回 ${result.rows.length} 行`);
    } catch (error) {
      const errorMsg = String(error);
      updateTab(currentTab.id, { error: errorMsg, queryResult: null, isQuerying: false });
      addLog(`查询失败: ${errorMsg}`);
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

  // Filter tables based on search query
  const getFilteredTables = (tables: string[]) => {
    if (!searchQuery) return tables;
    return tables.filter(table =>
      table.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const hasResults = connectionType === "sqlite" 
    ? (databaseTables["SQLite"] || []).length > 0
    : databases.length > 0;

  // If viewing structure, show structure view
  if (viewingStructure) {
    return (
      <TableStructure
        tableName={viewingStructure}
        onClose={() => setViewingStructure(null)}
      />
    );
  }

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text)' }}
              title={viewMode === 'list' ? '切换到网格视图' : '切换到列表视图'}
            >
              <span className="text-sm">{viewMode === 'list' ? '⊞' : '☰'}</span>
            </button>
          </div>
        </div>
        
        {/* Search box */}
        <div className="relative">
          <input
            type="text"
            placeholder={currentDatabase && connectionType !== "sqlite" ? "搜索表..." : "搜索数据库或表..."}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Auto-expand databases that match search (only if no database is selected)
              if (e.target.value && !currentDatabase) {
                const query = e.target.value.toLowerCase();
                databases.forEach(db => {
                  if (db.toLowerCase().includes(query) && !expandedDatabases.has(db)) {
                    setExpandedDatabases(prev => new Set([...prev, db]));
                    loadTablesForDatabase(db);
                  }
                });
              }
            }}
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

      {/* Database and table tree */}
      <div className="flex-1 overflow-auto p-4">
        {loading && databases.length === 0 ? (
          <div className="text-center text-sm py-12 flex flex-col items-center gap-3" style={{ color: 'var(--neu-text-light)' }}>
            <svg className="animate-spin h-6 w-6" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>加载中...</span>
          </div>
        ) : !hasResults ? (
          <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
            <div className="text-4xl mb-3 opacity-40">📋</div>
            <div className="font-medium">暂无数据库</div>
          </div>
        ) : currentDatabase && connectionType !== "sqlite" ? (
          // Show only tables for selected database
          (() => {
            const tables = getFilteredTables(databaseTables[currentDatabase] || []);
            const isLoading = loadingDatabases.has(currentDatabase);
            
            if (isLoading) {
              return (
                <div className="text-center text-sm py-12 flex flex-col items-center gap-3" style={{ color: 'var(--neu-text-light)' }}>
                  <svg className="animate-spin h-6 w-6" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>加载中...</span>
                </div>
              );
            }
            
            if (tables.length === 0) {
              return (
                <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="text-4xl mb-3 opacity-40">📋</div>
                  <div className="font-medium">数据库 "{currentDatabase}" 暂无表</div>
                </div>
              );
            }
            
            return viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {tables.map((table) => (
                  <div
                    key={table}
                    onClick={() => handleTableClick(table, currentDatabase)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleTableClick(table, currentDatabase, true);
                    }}
                    className="group relative rounded-lg p-3 cursor-pointer transition-all duration-200 neu-flat hover:neu-hover active:neu-active min-w-0"
                    style={{ backgroundColor: 'rgba(30, 30, 30, 0.6)' }}
                    title={`左键点击查询表，右键点击查看结构: ${table}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 pr-12">
                      <span className="text-xl transition-transform duration-200 group-hover:scale-110 flex-shrink-0 mt-0.5 opacity-70">📄</span>
                      <span className="text-sm font-medium flex-1 min-w-0 leading-relaxed" style={{ color: 'rgba(240, 240, 240, 0.85)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {table}
                      </span>
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImportingTable(table);
                          setImportingTableDb(currentDatabase);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-accent)' }}
                        title="导入数据"
                      >
                        <span className="text-xs">📥</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTableClick(table, currentDatabase, true);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-text-light)' }}
                        title="查看表结构"
                      >
                        <span className="text-xs">🔍</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {tables.map((table) => (
                  <div
                    key={table}
                    onClick={() => handleTableClick(table, currentDatabase)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleTableClick(table, currentDatabase, true);
                    }}
                    className="group text-sm py-2.5 px-3.5 rounded-lg cursor-pointer transition-all duration-200 flex items-start gap-2.5 neu-flat hover:neu-hover active:neu-active min-w-0"
                    style={{ color: 'var(--neu-text)' }}
                    title={`左键点击查询表，右键点击查看结构: ${table}`}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5 opacity-70">📄</span>
                    <span className="font-normal flex-1 min-w-0 leading-relaxed" style={{ color: 'rgba(240, 240, 240, 0.85)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{table}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImportingTable(table);
                          setImportingTableDb(currentDatabase);
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-accent)' }}
                        title="导入数据"
                      >
                        <span className="text-xs">📥</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTableClick(table, currentDatabase, true);
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-text-light)' }}
                        title="查看表结构"
                      >
                        <span className="text-xs">🔍</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        ) : connectionType === "sqlite" ? (
          // SQLite: show tables directly (no database tree)
          (() => {
            const tables = getFilteredTables(databaseTables["SQLite"] || []);
            return tables.length === 0 ? (
              <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
                <div className="text-4xl mb-3 opacity-40">📋</div>
                <div className="font-medium">无匹配的表</div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {tables.map((table) => (
                  <div
                    key={table}
                    onClick={() => handleTableClick(table, "SQLite")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleTableClick(table, "SQLite", true);
                    }}
                    className="group relative rounded-lg p-3 cursor-pointer transition-all duration-200 neu-flat hover:neu-hover active:neu-active min-w-0"
                    style={{ backgroundColor: 'rgba(30, 30, 30, 0.6)' }}
                    title={`左键点击查询表，右键点击查看结构: ${table}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 pr-12">
                      <span className="text-xl transition-transform duration-200 group-hover:scale-110 flex-shrink-0 mt-0.5 opacity-70">📄</span>
                      <span className="text-sm font-medium flex-1 min-w-0 leading-relaxed" style={{ color: 'rgba(240, 240, 240, 0.85)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {table}
                      </span>
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImportingTable(table);
                          setImportingTableDb("SQLite");
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-accent)' }}
                        title="导入数据"
                      >
                        <span className="text-xs">📥</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTableClick(table, "SQLite", true);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-text-light)' }}
                        title="查看表结构"
                      >
                        <span className="text-xs">🔍</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {tables.map((table) => (
                  <div
                    key={table}
                    onClick={() => handleTableClick(table, "SQLite")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleTableClick(table, "SQLite", true);
                    }}
                    className="group text-sm py-2.5 px-3.5 rounded-lg cursor-pointer transition-all duration-200 flex items-start gap-2.5 neu-flat hover:neu-hover active:neu-active min-w-0"
                    style={{ color: 'var(--neu-text)' }}
                    title={`左键点击查询表，右键点击查看结构: ${table}`}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5 opacity-70">📄</span>
                    <span className="font-normal flex-1 min-w-0 leading-relaxed" style={{ color: 'rgba(240, 240, 240, 0.85)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{table}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImportingTable(table);
                          setImportingTableDb("SQLite");
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-accent)' }}
                        title="导入数据"
                      >
                        <span className="text-xs">📥</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTableClick(table, "SQLite", true);
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                        style={{ color: 'var(--neu-text-light)' }}
                        title="查看表结构"
                      >
                        <span className="text-xs">🔍</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        ) : (
          // Other databases: show tree structure
          (() => {
            const filteredDatabases = databases.filter(db => {
              if (!searchQuery) return true;
              const query = searchQuery.toLowerCase();
              if (db.toLowerCase().includes(query)) return true;
              // Check if any table in this database matches
              const tables = databaseTables[db] || [];
              return tables.some(table => table.toLowerCase().includes(query));
            });

            if (filteredDatabases.length === 0) {
              return (
                <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
                  <div className="text-4xl mb-3 opacity-40">📋</div>
                  <div className="font-medium">无匹配的数据库或表</div>
                </div>
              );
            }

            return (
              <div className="space-y-1">
                {filteredDatabases.map((database) => {
                  const isExpanded = expandedDatabases.has(database);
                  const tables = databaseTables[database] || [];
                  const filteredTables = getFilteredTables(tables);
                  const isLoading = loadingDatabases.has(database);
                  const showDatabase = !searchQuery || database.toLowerCase().includes(searchQuery.toLowerCase());

                  return (
                    <div key={database}>
                      {/* Database row */}
                      {showDatabase && (
                        <div
                          onClick={() => toggleDatabase(database)}
                          className={`group text-sm py-2.5 px-3.5 rounded-lg cursor-pointer transition-all duration-200 flex items-center gap-2.5 neu-flat hover:neu-hover active:neu-active ${
                            currentDatabase === database ? 'ring-2 ring-[var(--neu-accent)]' : ''
                          }`}
                          style={{ 
                            color: 'var(--neu-text)'
                          }}
                          title={`点击展开/折叠数据库: ${database}`}
                        >
                          <span className="text-base flex-shrink-0 transition-transform duration-200" style={{ 
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            opacity: 0.7
                          }}>
                            ▶
                          </span>
                          <span className="text-base flex-shrink-0 opacity-70">📁</span>
                          <span className="font-medium flex-1 min-w-0 leading-relaxed" style={{ 
                            color: currentDatabase === database ? 'var(--neu-accent)' : 'rgba(240, 240, 240, 0.85)',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word'
                          }}>
                            {database}
                          </span>
                          {isLoading && (
                            <svg className="animate-spin h-4 w-4 flex-shrink-0" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                          {!isLoading && (
                            <span className="text-xs opacity-50" style={{ color: 'var(--neu-text-light)' }}>
                              {tables.length}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Tables under database */}
                      {isExpanded && (
                        <div className="ml-6 mt-1 space-y-1">
                          {isLoading ? (
                            <div className="text-xs py-2 px-3.5" style={{ color: 'var(--neu-text-light)' }}>
                              加载中...
                            </div>
                          ) : filteredTables.length === 0 ? (
                            <div className="text-xs py-2 px-3.5" style={{ color: 'var(--neu-text-light)' }}>
                              {tables.length === 0 ? "暂无表" : "无匹配的表"}
                            </div>
                          ) : (
                            filteredTables.map((table) => (
                              <div
                                key={`${database}-${table}`}
                                onClick={() => handleTableClick(table, database)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  handleTableClick(table, database, true);
                                }}
                                className="group text-sm py-2 px-3.5 rounded-lg cursor-pointer transition-all duration-200 flex items-start gap-2.5 neu-flat hover:neu-hover active:neu-active min-w-0"
                                style={{ color: 'var(--neu-text)' }}
                                title={`左键点击查询表，右键点击查看结构: ${table}`}
                              >
                                <span className="text-base flex-shrink-0 mt-0.5 opacity-70">📄</span>
                                <span className="font-normal flex-1 min-w-0 leading-relaxed" style={{ color: 'rgba(240, 240, 240, 0.85)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{table}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setImportingTable(table);
                                      setImportingTableDb(database);
                                    }}
                                    className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                                    style={{ color: 'var(--neu-accent)' }}
                                    title="导入数据"
                                  >
                                    <span className="text-xs">📥</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTableClick(table, database, true);
                                    }}
                                    className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                                    style={{ color: 'var(--neu-text-light)' }}
                                    title="查看表结构"
                                  >
                                    <span className="text-xs">🔍</span>
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* Import Dialog */}
      {importingTable && (
        <ImportDialog
          tableName={importingTable}
          onClose={() => {
            setImportingTable(null);
            setImportingTableDb(null);
          }}
          onSuccess={() => {
            // 如果当前选中的表就是导入的表，刷新查询结果
            const currentTab = getCurrentTab();
            if (currentTab?.selectedTable === importingTable && importingTableDb) {
              handleTableClick(importingTable, importingTableDb);
            }
            setImportingTable(null);
            setImportingTableDb(null);
          }}
        />
      )}
    </div>
  );
}

