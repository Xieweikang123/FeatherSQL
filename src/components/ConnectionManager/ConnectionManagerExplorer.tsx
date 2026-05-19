import type { MouseEvent } from "react";
import type { Connection } from "../../lib/commands";
import type { WorkspaceHistory } from "../../store/connectionStore";
import {
  IconPlus,
  IconHistory,
  IconChevron,
  IconServer,
  IconDatabase,
  IconTable,
  IconEdit,
  IconTrash,
  IconPlay,
  IconUnplug,
  IconPlug,
  IconSpinner,
} from "./SidebarIcons";

interface DatabaseTables {
  [database: string]: string[];
}

function getDbTypeBadge(type: string) {
  switch (type) {
    case "mysql":
      return { bg: "rgba(233, 118, 39, 0.2)", color: "#E9894D", label: "MySQL" };
    case "postgres":
      return { bg: "rgba(91, 155, 213, 0.2)", color: "#7BB3E5", label: "PG" };
    case "sqlite":
      return { bg: "rgba(144, 164, 174, 0.2)", color: "#90A4AE", label: "SQLite" };
    case "mssql":
      return { bg: "rgba(239, 83, 80, 0.2)", color: "#EF9A9A", label: "MSSQL" };
    default:
      return { bg: "rgba(255,255,255,0.08)", color: "var(--neu-text-light)", label: type };
  }
}

export interface ConnectionManagerExplorerProps {
  connections: Connection[];
  databases: string[];
  currentConnectionId: string | null;
  currentDatabase: string | null;
  expandedConnections: Set<string>;
  expandedDatabases: Set<string>;
  databaseTables: DatabaseTables;
  loadingDatabases: boolean;
  loadingTables: Set<string>;
  connectingConnections: Set<string>;
  showHistory: boolean;
  autoHistory: WorkspaceHistory[];
  manualHistory: WorkspaceHistory[];
  workspaceHistoryCount: number;
  onToggleHistory: () => void;
  onNewConnection: () => void;
  onRestoreWorkspace: (historyId: string) => void;
  onDeleteHistory: (e: MouseEvent, historyId: string) => void;
  onToggleConnectionExpand: (e: MouseEvent, connection: Connection) => void;
  onConnectionClick: (connection: Connection) => void;
  onDisconnect: (e: MouseEvent, connection: Connection) => void;
  onEdit: (e: MouseEvent, connection: Connection) => void;
  onDeleteConnection: (e: MouseEvent, id: string) => void;
  onToggleDatabase: (e: MouseEvent, connectionId: string, database: string) => void;
  onDatabaseClick: (e: MouseEvent, connectionId: string, database: string) => void;
  onTableClick: (e: MouseEvent, database: string, table: string) => void;
  onTableContextMenu: (e: MouseEvent, database: string, table: string) => void;
}

export default function ConnectionManagerExplorer(props: ConnectionManagerExplorerProps) {
  const {
    connections,
    databases,
    currentConnectionId,
    currentDatabase,
    expandedConnections,
    expandedDatabases,
    databaseTables,
    loadingDatabases,
    loadingTables,
    connectingConnections,
    showHistory,
    autoHistory,
    manualHistory,
    workspaceHistoryCount,
    onToggleHistory,
    onNewConnection,
    onRestoreWorkspace,
    onDeleteHistory,
    onToggleConnectionExpand,
    onConnectionClick,
    onDisconnect,
    onEdit,
    onDeleteConnection,
    onToggleDatabase,
    onDatabaseClick,
    onTableClick,
    onTableContextMenu,
  } = props;

  return (
    <div className="sidebar-explorer">
      <div className="sidebar-explorer-header">
        <div className="sidebar-explorer-title">资源管理器</div>
        <div className="sidebar-toolbar">
          <button type="button" onClick={onNewConnection} className="sidebar-btn sidebar-btn--primary">
            <IconPlus size={14} />
            新建连接
          </button>
          <button
            type="button"
            onClick={onToggleHistory}
            className={`sidebar-btn${showHistory ? " sidebar-btn--active" : ""}`}
            title="工作历史"
          >
            <IconHistory size={14} />
            历史
            {workspaceHistoryCount > 0 && (
              <span className="sidebar-btn-badge">{workspaceHistoryCount}</span>
            )}
          </button>
        </div>

        {showHistory && (
          <div className="sidebar-history-panel">
            {autoHistory.length > 0 && (
              <>
                <div className="sidebar-history-section-title">最近自动保存</div>
                {autoHistory.map((history) => (
                  <HistoryItem
                    key={history.id}
                    history={history}
                    connections={connections}
                    onRestore={() => onRestoreWorkspace(history.id)}
                  />
                ))}
              </>
            )}
            {manualHistory.length > 0 && (
              <>
                <div className="sidebar-history-section-title">已保存的工作</div>
                {manualHistory.map((history) => (
                  <div key={history.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onRestoreWorkspace(history.id)}
                      className="sidebar-history-item"
                    >
                      <div className="sidebar-history-item-path">{history.name}</div>
                      <HistoryPath history={history} connections={connections} muted />
                      <HistoryTime savedAt={history.savedAt} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onDeleteHistory(e, history.id)}
                      className="sidebar-icon-btn sidebar-icon-btn--danger absolute right-3 top-2 opacity-0 group-hover:opacity-100"
                      title="删除"
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </>
            )}
            {autoHistory.length === 0 && manualHistory.length === 0 && (
              <div className="sidebar-tree-empty" style={{ padding: "24px 16px" }}>
                <div className="sidebar-tree-empty-hint">暂无工作历史</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-tree">
        {connections.length === 0 ? (
          <div className="sidebar-tree-empty">
            <IconPlug className="sidebar-tree-empty-icon" size={40} />
            <div className="sidebar-tree-empty-title">暂无连接</div>
            <div className="sidebar-tree-empty-hint">点击「新建连接」开始</div>
          </div>
        ) : (
          connections.map((connection) => {
            const isExpanded = expandedConnections.has(connection.id);
            const showDatabases =
              connection.type === "mysql" ||
              connection.type === "postgres" ||
              connection.type === "mssql";
            const isCurrent = currentConnectionId === connection.id;
            const isConnecting = connectingConnections.has(connection.id);
            const typeBadge = getDbTypeBadge(connection.type);

            return (
              <div key={connection.id} className="sidebar-tree-group">
                <div
                  className={[
                    "sidebar-tree-row sidebar-tree-row--connection",
                    isCurrent && "sidebar-tree-row--active",
                    isConnecting && "sidebar-tree-row--connecting",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    onClick={(e) => onToggleConnectionExpand(e, connection)}
                    className={`sidebar-chevron-btn${isExpanded ? " sidebar-chevron-btn--open" : ""}`}
                    title={isExpanded ? "收起" : "展开"}
                    disabled={isConnecting}
                  >
                    <IconChevron />
                  </button>
                  <span
                    className={`sidebar-status-dot ${
                      isConnecting
                        ? "sidebar-status-dot--connecting"
                        : isCurrent
                          ? "sidebar-status-dot--online"
                          : "sidebar-status-dot--offline"
                    }`}
                  />
                  <span className="sidebar-row-icon">
                    <IconServer size={14} />
                  </span>
                  <span
                    className="sidebar-row-label"
                    onClick={() => !isConnecting && onConnectionClick(connection)}
                    title={connection.name}
                  >
                    {connection.name}
                  </span>
                  <span
                    className="sidebar-type-badge"
                    style={{ background: typeBadge.bg, color: typeBadge.color }}
                  >
                    {typeBadge.label}
                  </span>
                  <div className="sidebar-row-actions">
                    {isCurrent ? (
                      <button
                        type="button"
                        onClick={(e) => onDisconnect(e, connection)}
                        disabled={isConnecting}
                        className="sidebar-icon-btn sidebar-icon-btn--warn"
                        title="断开连接"
                      >
                        <IconUnplug />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isConnecting) onConnectionClick(connection);
                        }}
                        disabled={isConnecting}
                        className="sidebar-icon-btn"
                        title={isConnecting ? "正在连接..." : "连接"}
                      >
                        {isConnecting ? <IconSpinner size={12} /> : <IconPlay />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => onEdit(e, connection)}
                      className="sidebar-icon-btn"
                      title="编辑"
                    >
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onDeleteConnection(e, connection.id)}
                      className="sidebar-icon-btn sidebar-icon-btn--danger"
                      title="删除"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>

                {isExpanded && isCurrent && (
                  <div className="sidebar-tree-children">
                    {showDatabases ? (
                      loadingDatabases ? (
                        <div className="sidebar-tree-loading">
                          <IconSpinner size={12} />
                          加载数据库...
                        </div>
                      ) : databases.length === 0 ? (
                        <div className="sidebar-tree-loading">暂无数据库</div>
                      ) : (
                        databases.map((db) => {
                          const isSelected = currentDatabase === db;
                          const isDbExpanded = expandedDatabases.has(db);
                          const tables = databaseTables[db] || [];
                          const isLoading = loadingTables.has(db);

                          return (
                            <div key={db}>
                              <div
                                data-database={db}
                                className={[
                                  "sidebar-tree-row sidebar-tree-indent-1",
                                  isSelected && "sidebar-tree-row--active",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                title={db}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => onToggleDatabase(e, connection.id, db)}
                                  className={`sidebar-chevron-btn${isDbExpanded ? " sidebar-chevron-btn--open" : ""}`}
                                >
                                  <IconChevron />
                                </button>
                                <span className="sidebar-row-icon">
                                  <IconDatabase />
                                </span>
                                <span
                                  className="sidebar-row-label"
                                  onClick={(e) => onDatabaseClick(e, connection.id, db)}
                                >
                                  {db}
                                </span>
                                {isLoading ? (
                                  <IconSpinner size={11} />
                                ) : (
                                  tables.length > 0 && (
                                    <span className="sidebar-table-count">{tables.length}</span>
                                  )
                                )}
                              </div>
                              {isDbExpanded && (
                                <div>
                                  {isLoading ? (
                                    <div className="sidebar-tree-loading">加载表...</div>
                                  ) : tables.length === 0 ? (
                                    <div className="sidebar-tree-loading">暂无表</div>
                                  ) : (
                                    tables.map((table) => (
                                      <div
                                        key={`${db}-${table}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => onTableClick(e, db, table)}
                                        onContextMenu={(e) => onTableContextMenu(e, db, table)}
                                        className="sidebar-tree-row sidebar-tree-row--table sidebar-tree-indent-2"
                                        title="左键查询，右键菜单"
                                      >
                                        <span className="sidebar-chevron-placeholder" />
                                        <span className="sidebar-row-icon">
                                          <IconTable />
                                        </span>
                                        <span className="sidebar-row-label">{table}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )
                    ) : (
                      <div className="sidebar-tree-hint">SQLite 已连接，表将在主区域显示</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function HistoryTime({ savedAt }: { savedAt: string }) {
  return (
    <div className="sidebar-history-item-time">
      {new Date(savedAt).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </div>
  );
}

function HistoryPath({
  history,
  connections,
  muted,
}: {
  history: WorkspaceHistory;
  connections: Connection[];
  muted?: boolean;
}) {
  const conn = connections.find((c) => c.id === history.connectionId);
  const parts = [
    conn?.name || "未知连接",
    history.database && history.database !== "" ? history.database : null,
    history.table,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div
      className="sidebar-history-item-path"
      style={muted ? { opacity: 0.7, fontWeight: 400, marginTop: 2 } : undefined}
    >
      {parts.join(" / ")}
    </div>
  );
}

function HistoryItem({
  history,
  connections,
  onRestore,
}: {
  history: WorkspaceHistory;
  connections: Connection[];
  onRestore: () => void;
}) {
  return (
    <button type="button" onClick={onRestore} className="sidebar-history-item">
      <HistoryPath history={history} connections={connections} />
      <HistoryTime savedAt={history.savedAt} />
    </button>
  );
}
