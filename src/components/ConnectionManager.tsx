import { useEffect, useState, useRef, useCallback } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { useConnectionStore } from "../store/connectionStore";
import {
  selectCurrentConnectionId,
  selectCurrentDatabase,
} from "../store/selectors";
import {
  getConnections,
  deleteConnection,
  disconnectConnection,
  listDatabases,
  listTables,
  type Connection,
} from "../lib/commands";
import { runTabQuery } from "../services/tabQueryService";
import { openTableBrowse } from "../services/tableBrowseService";
import { buildTableSelectSql } from "../utils/sqlGenerator";
import ConnectionForm from "./ConnectionForm";
import TableContextMenu from "./ConnectionManager/TableContextMenu";
import TableStructure from "./TableStructure";
import ConnectionManagerExplorer from "./ConnectionManager/ConnectionManagerExplorer";

interface DatabaseTables {
  [database: string]: string[];
}

export default function ConnectionManager() {
  const connections = useConnectionStore((s) => s.connections);
  const currentConnectionId = useConnectionStore(selectCurrentConnectionId);
  const currentDatabase = useConnectionStore(selectCurrentDatabase);
  const setConnections = useConnectionStore((s) => s.setConnections);
  const setCurrentConnection = useConnectionStore((s) => s.setCurrentConnection);
  const setCurrentDatabase = useConnectionStore((s) => s.setCurrentDatabase);
  const setSelectedTable = useConnectionStore((s) => s.setSelectedTable);
  const restoreWorkspaceState = useConnectionStore((s) => s.restoreWorkspaceState);
  const getWorkspaceHistory = useConnectionStore((s) => s.getWorkspaceHistory);
  const restoreWorkspaceHistory = useConnectionStore((s) => s.restoreWorkspaceHistory);
  const deleteWorkspaceHistory = useConnectionStore((s) => s.deleteWorkspaceHistory);
  const loadSql = useConnectionStore((s) => s.loadSql);
  const currentTabId = useConnectionStore((s) => s.currentTabId);
  const getCurrentTab = useConnectionStore((s) => s.getCurrentTab);
  const updateTab = useConnectionStore((s) => s.updateTab);
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [databaseTables, setDatabaseTables] = useState<DatabaseTables>({});
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());
  const [connectingConnections, setConnectingConnections] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; table: string; database: string } | null>(null);
  const [viewingStructure, setViewingStructure] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { type: "deleteConnection"; id: string }
    | { type: "deleteWorkspaceHistory"; historyId: string }
    | null
  >(null);
  const lastSidebarConnectionRef = useRef<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  // Auto-expand current database if set
  useEffect(() => {
    if (currentDatabase && currentConnectionId && !expandedDatabases.has(currentDatabase)) {
      setExpandedDatabases(prev => new Set([...prev, currentDatabase]));
      loadTablesForDatabase(currentConnectionId, currentDatabase);
    }
  }, [currentDatabase, currentConnectionId]);

  const loadConnections = async () => {
    try {
      const conns = await getConnections();
      setConnections(conns);
    } catch (error) {
    }
  };

  const handleConnectionClick = async (connection: Connection) => {
    // ????????????????????????????
    if (connectingConnections.has(connection.id)) {
      return;
    }

    // ?????????????????????????????????
    if (currentConnectionId === connection.id) {
      return;
    }

    // ?????????????
    setConnectingConnections(prev => new Set(prev).add(connection.id));

    try {
      // ??????????????????????????????????????????????
      if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
        // ??? MySQL/PostgreSQL/MSSQL???????????????????????????
        await listDatabases(connection.id);
      } else if (connection.type === "sqlite") {
        // ??? SQLite?????????????????????????????SQLite ???????????????
        setCurrentDatabase("");
      }

      // ?????????????????????????
      setCurrentConnection(connection.id);
      setCurrentDatabase(null);

      // Reset databases and tables when switching connections
      setDatabases([]);
      setDatabaseTables({});
      setExpandedDatabases(new Set());
      
      // ????????????????????????????????????
      setExpandedConnections(new Set([connection.id]));
      
      // ??????????????????????MySQL/PostgreSQL/MSSQL??
      if (connection.type === "mysql" || connection.type === "postgres" || connection.type === "mssql") {
        loadDatabases(connection.id);
      }
    } catch (error) {
      const errorMsg = String(error);
    } finally {
      // ????????????????
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
    } catch (error) {
      setDatabases([]);
    } finally {
      setLoadingDatabases(false);
    }
  };


  const loadTablesForDatabase = async (
    connectionId: string,
    database: string,
    force = false
  ) => {
    if (!force && databaseTables[database]) {
      return; // Already loaded
    }

    setLoadingTables(prev => new Set([...prev, database]));
    try {
      const tableList = await listTables(connectionId, database);
      setDatabaseTables(prev => ({ ...prev, [database]: tableList }));
    } catch (error) {
      setDatabaseTables(prev => ({ ...prev, [database]: [] }));
    } finally {
      setLoadingTables(prev => {
        const next = new Set(prev);
        next.delete(database);
        return next;
      });
    }
  };

  const syncSidebarToCurrentTab = useCallback(async () => {
    const tab = getCurrentTab();
    if (!tab?.connectionId) {
      if (lastSidebarConnectionRef.current !== null) {
        setDatabases([]);
        setDatabaseTables({});
        setExpandedConnections(new Set());
        setExpandedDatabases(new Set());
        lastSidebarConnectionRef.current = null;
      }
      return;
    }

    const connection = connections.find((c) => c.id === tab.connectionId);
    if (!connection) {
      return;
    }

    if (lastSidebarConnectionRef.current !== tab.connectionId) {
      setDatabaseTables({});
      setDatabases([]);
      lastSidebarConnectionRef.current = tab.connectionId;
    }

    setExpandedConnections(new Set([connection.id]));

    try {
      if (
        connection.type === "mysql" ||
        connection.type === "postgres" ||
        connection.type === "mssql"
      ) {
        await listDatabases(connection.id);
        await loadDatabases(connection.id);
      }
    } catch {
      setDatabases([]);
    }

    if (tab.database !== null) {
      const dbKey = connection.type === "sqlite" ? "" : tab.database;
      setExpandedDatabases(new Set([dbKey]));
      await loadTablesForDatabase(connection.id, dbKey, true);
    } else {
      setExpandedDatabases(new Set());
    }
  }, [connections, getCurrentTab]);

  useEffect(() => {
    void syncSidebarToCurrentTab();
  }, [currentTabId, syncSidebarToCurrentTab]);

  const toggleDatabase = (e: React.MouseEvent, connectionId: string, database: string) => {
    e.stopPropagation();
    setExpandedDatabases(prev => {
      const next = new Set(prev);
      if (next.has(database)) {
        next.delete(database);
      } else {
        next.add(database);
        loadTablesForDatabase(connectionId, database);
      }
      return next;
    });
  };

  const handleDatabaseClick = (e: React.MouseEvent, connectionId: string, database: string) => {
    e.stopPropagation();
    if (currentConnectionId !== connectionId) {
      setCurrentConnection(connectionId);
    }
    setCurrentDatabase(database);
    // Auto-expand if not already expanded
    if (!expandedDatabases.has(database)) {
      setExpandedDatabases(prev => new Set([...prev, database]));
      loadTablesForDatabase(connectionId, database);
    }
  };

  const handleTableClick = async (
    e: React.MouseEvent,
    connectionId: string,
    database: string,
    table: string
  ) => {
    e.stopPropagation();

    const connection = connections.find((c) => c.id === connectionId);
    if (!connection) return;

    if (currentConnectionId !== connectionId) {
      setCurrentConnection(connectionId);
    }

    const targetDatabase = connection.type === "sqlite" ? "" : database;
    const latestTab = getCurrentTab();
    if (latestTab?.database !== targetDatabase) {
      setCurrentDatabase(targetDatabase);
    }

    const currentTab = getCurrentTab();
    if (!currentTab) return;

    await openTableBrowse({
      tabId: currentTab.id,
      connectionId,
      connection,
      database,
      tableName: table,
    });
  };

  const handleTableContextMenu = (e: React.MouseEvent, database: string, table: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      table,
      database,
    });
  };

  const handleQueryTable = async () => {
    if (!contextMenu || !currentConnectionId) return;

    const { table, database } = contextMenu;
    const connection = connections.find((c) => c.id === currentConnectionId);
    if (!connection) return;

    if (connection.type !== "sqlite" && database !== currentDatabase) {
      setCurrentDatabase(database);
    }

    const currentTab = getCurrentTab();
    if (!currentTab) return;

    await openTableBrowse({
      tabId: currentTab.id,
      connectionId: currentConnectionId,
      connection,
      database,
      tableName: table,
    });
  };

  const handleViewStructure = () => {
    if (!contextMenu) return;
    
    const { table, database } = contextMenu;
    const connection = connections.find(c => c.id === currentConnectionId);
    if (!connection) return;

    // Set current database if different (for non-SQLite)
    if (connection.type !== "sqlite" && database !== currentDatabase) {
      setCurrentDatabase(database);
    }
    
    setViewingStructure(table);
  };

  const handleGenerateSelect = () => {
    if (!contextMenu || !currentConnectionId) return;
    
    const { table, database } = contextMenu;
    const connection = connections.find(c => c.id === currentConnectionId);
    if (!connection) return;

    // Set current database if different
    if (connection.type !== "sqlite" && database !== currentDatabase) {
      setCurrentDatabase(database);
    }

    // Set selected table
    setSelectedTable(table);

    const sql = buildTableSelectSql(table, connection.type, database);

    // Load SQL into editor (but don't execute)
    loadSql(sql);
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

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPendingConfirm({ type: "deleteConnection", id });
  };

  const confirmDeleteConnection = async (id: string) => {
    try {
      await deleteConnection(id);
      if (currentConnectionId === id) {
        setCurrentConnection(null);
        setDatabases([]);
        setDatabaseTables({});
        setExpandedDatabases(new Set());
        lastSidebarConnectionRef.current = null;
      }
      const newExpanded = new Set(expandedConnections);
      newExpanded.delete(id);
      setExpandedConnections(newExpanded);
      loadConnections();
    } catch (error) {
      console.error("Failed to delete connection:", error);
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
      // ?????????????????????????????????????????????????
      if (currentConnectionId === connection.id) {
        setCurrentConnection(null);
        setDatabases([]);
        setDatabaseTables({});
        setExpandedDatabases(new Set());
        setCurrentDatabase(null);
        setExpandedConnections(prev => {
          const newSet = new Set(prev);
          newSet.delete(connection.id);
          return newSet;
        });
      }
    } catch (error) {
      const errorMsg = String(error);
    }
  };

  const handleRestoreWorkspace = async (historyId?: string) => {
    let savedState;
    let historyName = "最近工作区";
    
    if (historyId) {
      const history = restoreWorkspaceHistory(historyId);
      if (!history) {
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
      return;
    }

    // Find the connection
    const connection = connections.find(c => c.id === savedState.connectionId);
    if (!connection) {
      return;
    }

    // Close history panel immediately
    setShowHistory(false);

    try {
      // Connect to the saved connection (even if not currently connected)
      if (currentConnectionId !== connection.id) {
        // Ensure connection is expanded
        setExpandedConnections(new Set([connection.id]));
        await handleConnectionClick(connection);
        
        // Wait for connection to be established (check store state)
        // Use a polling approach to check if connection is established
        let attempts = 0;
        while (attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const store = useConnectionStore.getState();
          if (store.getCurrentTab()?.connectionId === connection.id) {
            break;
          }
          attempts++;
        }
        
        // Final check
        const finalStore = useConnectionStore.getState();
        if (finalStore.getCurrentTab()?.connectionId !== connection.id) {
          throw new Error(`连接失败: ${connection.name}`);
        }
      } else {
        // Ensure connection is expanded even if already connected
        setExpandedConnections(new Set([connection.id]));
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
        // Wait for database to be set
        let dbAttempts = 0;
        while (dbAttempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const store = useConnectionStore.getState();
          if (store.getCurrentTab()?.database === savedState.database) {
            // Scroll to the selected database after a short delay to ensure DOM is updated
            setTimeout(() => {
              const dbElement = document.querySelector(`[data-database="${savedState.database}"]`);
              if (dbElement) {
                dbElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                // Highlight the database briefly
                dbElement.classList.add('sidebar-tree-row--flash');
                setTimeout(() => {
                  dbElement.classList.remove('sidebar-tree-row--flash');
                }, 1000);
              }
            }, 200);
            break;
          }
          dbAttempts++;
        }
      }

      // Restore table / SQL and run query (otherwise UI stays on "查询中..." forever)
      const tabAfterRestore = useConnectionStore.getState().getCurrentTab();
      if (!tabAfterRestore) {
        return;
      }

      const databaseForQuery =
        connection.type === "sqlite" ? "" : (savedState.database ?? "");

      if (savedState.table) {
        await openTableBrowse({
          tabId: tabAfterRestore.id,
          connectionId: connection.id,
          connection,
          database: savedState.database ?? "",
          tableName: savedState.table,
        });
      } else if (savedState.sql?.trim()) {
        loadSql(savedState.sql);
        await runTabQuery({
          tabId: tabAfterRestore.id,
          sql: savedState.sql.trim(),
          connectionId: connection.id,
          database: databaseForQuery,
          mode: "full",
        });
      }
    } catch (error) {
      const errorMsg = String(error);
    }
  };

  const handleDeleteHistory = (e: React.MouseEvent, historyId: string) => {
    e.stopPropagation();
    setPendingConfirm({ type: "deleteWorkspaceHistory", historyId });
  };


  const workspaceHistory = getWorkspaceHistory();
  const autoHistory = workspaceHistory.filter(h => h.id.startsWith("auto-"));
  const manualHistory = workspaceHistory.filter(h => !h.id.startsWith("auto-"));

  return (
    <>
      <ConnectionManagerExplorer
        connections={connections}
        databases={databases}
        currentConnectionId={currentConnectionId}
        currentDatabase={currentDatabase}
        expandedConnections={expandedConnections}
        expandedDatabases={expandedDatabases}
        databaseTables={databaseTables}
        loadingDatabases={loadingDatabases}
        loadingTables={loadingTables}
        connectingConnections={connectingConnections}
        showHistory={showHistory}
        autoHistory={autoHistory}
        manualHistory={manualHistory}
        workspaceHistoryCount={workspaceHistory.length}
        onToggleHistory={() => setShowHistory(!showHistory)}
        onNewConnection={() => {
          setEditingConnection(null);
          setShowForm(true);
        }}
        onRestoreWorkspace={handleRestoreWorkspace}
        onDeleteHistory={handleDeleteHistory}
        onToggleConnectionExpand={toggleDatabaseList}
        onConnectionClick={handleConnectionClick}
        onDisconnect={handleDisconnect}
        onEdit={handleEdit}
        onDeleteConnection={handleDelete}
        onToggleDatabase={toggleDatabase}
        onDatabaseClick={handleDatabaseClick}
        onTableClick={handleTableClick}
        onTableContextMenu={handleTableContextMenu}
      />

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

      {contextMenu && (
        <TableContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onViewStructure={handleViewStructure}
          onQueryTable={handleQueryTable}
          onGenerateSelect={handleGenerateSelect}
        />
      )}

      {viewingStructure && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setViewingStructure(null)}
        >
          <div
            className="w-full h-full max-w-4xl max-h-[90vh] m-4 neu-raised rounded-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <TableStructure
              tableName={viewingStructure}
              onClose={() => setViewingStructure(null)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingConfirm?.type === "deleteConnection"}
        title="删除连接"
        message="确定要删除此连接吗？该操作不可恢复。"
        confirmText="删除"
        type="danger"
        onConfirm={() => {
          const id = pendingConfirm?.type === "deleteConnection" ? pendingConfirm.id : "";
          setPendingConfirm(null);
          if (id) void confirmDeleteConnection(id);
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <ConfirmDialog
        isOpen={pendingConfirm?.type === "deleteWorkspaceHistory"}
        title="删除工作区历史"
        message="确定要删除这条工作区历史记录吗？"
        confirmText="删除"
        type="danger"
        onConfirm={() => {
          if (pendingConfirm?.type === "deleteWorkspaceHistory") {
            deleteWorkspaceHistory(pendingConfirm.historyId);
            setShowHistory(false);
            setTimeout(() => setShowHistory(true), 10);
          }
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}

