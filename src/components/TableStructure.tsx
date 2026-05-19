import { useEffect, useState } from "react";
import { useConnectionStore } from "../store/connectionStore";
import {
  selectCurrentConnectionId,
  selectCurrentDatabase,
} from "../store/selectors";
import { describeTable, executeSql, type ColumnInfo } from "../lib/commands";
import { escapeIdentifier, buildTableName } from "../lib/utils";
import ConfirmDialog from "./ConfirmDialog";

interface TableStructureProps {
  tableName: string;
  onClose: () => void;
}

interface EditableColumnInfo extends ColumnInfo {
  originalName: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

export default function TableStructure({ tableName, onClose }: TableStructureProps) {
  const currentConnectionId = useConnectionStore(selectCurrentConnectionId);
  const currentDatabase = useConnectionStore(selectCurrentDatabase);
  const connections = useConnectionStore((s) => s.connections);

  const [columns, setColumns] = useState<EditableColumnInfo[]>([]);
  const [originalColumns, setOriginalColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  const currentConnection = connections.find(c => c.id === currentConnectionId);
  const connectionType = currentConnection?.type;

  useEffect(() => {
    loadStructure();
  }, [currentConnectionId, tableName, currentDatabase, connectionType]);

  const loadStructure = async () => {
    if (!currentConnectionId) {
      setError("请先选择连接");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dbParam = connectionType === "sqlite" ? "" : (currentDatabase || undefined);
      const structure = await describeTable(currentConnectionId, tableName, dbParam);
      setOriginalColumns(structure);
      setColumns(structure.map(col => ({ ...col, originalName: col.name })));
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleEditMode = () => {
    if (editMode) {
      // 取消编辑，恢复原始数据
      setColumns(originalColumns.map(col => ({ ...col, originalName: col.name })));
      setEditMode(false);
    } else {
      setEditMode(true);
    }
  };

  const handleSave = async () => {
    if (!currentConnectionId || !currentConnection || !connectionType) return;

    setSaving(true);
    setError(null);

    try {
      const dbParam = connectionType === "sqlite" ? "" : (currentDatabase || undefined);
      const escapedTableName = buildTableName(tableName, connectionType, currentDatabase);
      const sqlStatements: string[] = [];

      // 生成 ALTER TABLE 语句
      for (const col of columns) {
        if (col.isDeleted) continue; // 跳过已删除的字段

        if (col.isNew) {
          // 添加新字段
          const sql = generateAddColumnSql(col, escapedTableName, connectionType);
          if (sql) sqlStatements.push(sql);
        } else if (col.originalName !== col.name || 
                   col.data_type !== originalColumns.find(c => c.name === col.originalName)?.data_type ||
                   col.nullable !== originalColumns.find(c => c.name === col.originalName)?.nullable ||
                   col.default !== originalColumns.find(c => c.name === col.originalName)?.default) {
          // 修改现有字段
          const originalCol = originalColumns.find(c => c.name === col.originalName);
          if (originalCol) {
            const sql = generateModifyColumnSql(col, originalCol, escapedTableName, connectionType);
            if (sql) sqlStatements.push(sql);
          }
        }
      }

      // 删除字段
      for (const originalCol of originalColumns) {
        if (!columns.find(c => c.originalName === originalCol.name && !c.isDeleted)) {
          const sql = generateDropColumnSql(originalCol.name, escapedTableName, connectionType);
          if (sql) {
            sqlStatements.push(sql);
          } else if (connectionType === "sqlite") {
            throw new Error("SQLite 不支持删除列，需要重建表");
          }
        }
      }

      if (sqlStatements.length === 0) {
        setEditMode(false);
        setSaving(false);
        return;
      }

      // 执行所有 ALTER TABLE 语句
      for (const sql of sqlStatements) {
        await executeSql(currentConnectionId, sql, dbParam);
      }

      // 重新加载表结构
      await loadStructure();
      setEditMode(false);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const generateAddColumnSql = (col: EditableColumnInfo, tableName: string, dbType: string | undefined): string | null => {
    if (!dbType) return null;
    const escapedColName = escapeIdentifier(col.name, dbType);
    let sql = `ALTER TABLE ${tableName} ADD COLUMN ${escapedColName} ${col.data_type}`;
    
    if (!col.nullable && dbType !== "sqlite") {
      sql += " NOT NULL";
    }
    
    if (col.default !== null && col.default !== undefined && col.default !== "") {
      // 如果默认值看起来不像数字或函数调用，添加引号
      const defaultVal = col.default.trim();
      const needsQuotes = !/^[\d.]+$/.test(defaultVal) && 
                         !defaultVal.toUpperCase().startsWith('CURRENT_') &&
                         !defaultVal.toUpperCase().startsWith('NOW()') &&
                         !defaultVal.startsWith("'") &&
                         !defaultVal.startsWith('"');
      sql += ` DEFAULT ${needsQuotes ? `'${defaultVal.replace(/'/g, "''")}'` : defaultVal}`;
    }
    
    return sql;
  };

  const generateModifyColumnSql = (
    newCol: EditableColumnInfo,
    oldCol: ColumnInfo,
    tableName: string,
    dbType: string | undefined
  ): string | null => {
    if (!dbType) return null;
    const escapedColName = escapeIdentifier(newCol.name, dbType);
    const escapedOldName = escapeIdentifier(oldCol.name, dbType);

    if (dbType === "mysql") {
      // MySQL: ALTER TABLE ... MODIFY COLUMN
      let sql = `ALTER TABLE ${tableName} MODIFY COLUMN ${escapedColName} ${newCol.data_type}`;
      if (!newCol.nullable) {
        sql += " NOT NULL";
      }
      if (newCol.default !== null && newCol.default !== undefined && newCol.default !== "") {
        sql += ` DEFAULT ${newCol.default}`;
      } else if (oldCol.default !== null && (newCol.default === null || newCol.default === "")) {
        sql += " DEFAULT NULL";
      }
      // 如果字段名改变，需要额外的 RENAME COLUMN
      if (newCol.name !== oldCol.name) {
        return `ALTER TABLE ${tableName} RENAME COLUMN ${escapedOldName} TO ${escapedColName}; ${sql}`;
      }
      return sql;
    } else if (dbType === "postgres") {
      // PostgreSQL: ALTER TABLE ... ALTER COLUMN
      const statements: string[] = [];
      
      if (newCol.name !== oldCol.name) {
        statements.push(`ALTER TABLE ${tableName} RENAME COLUMN ${escapedOldName} TO ${escapedColName}`);
      }
      
      if (newCol.data_type !== oldCol.data_type) {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${escapedColName} TYPE ${newCol.data_type}`);
      }
      
      if (newCol.nullable !== oldCol.nullable) {
        if (newCol.nullable) {
          statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${escapedColName} DROP NOT NULL`);
        } else {
          statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${escapedColName} SET NOT NULL`);
        }
      }
      
      if (newCol.default !== oldCol.default) {
        if (newCol.default === null || newCol.default === "") {
          statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${escapedColName} DROP DEFAULT`);
        } else {
          const defaultVal = newCol.default.trim();
          const needsQuotes = !/^[\d.]+$/.test(defaultVal) && 
                             !defaultVal.toUpperCase().startsWith('CURRENT_') &&
                             !defaultVal.toUpperCase().startsWith('NOW()') &&
                             !defaultVal.startsWith("'") &&
                             !defaultVal.startsWith('"');
          statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${escapedColName} SET DEFAULT ${needsQuotes ? `'${defaultVal.replace(/'/g, "''")}'` : defaultVal}`);
        }
      }
      
      return statements.length > 0 ? statements.join("; ") : null;
    } else if (dbType === "mssql") {
      // MSSQL: ALTER TABLE ... ALTER COLUMN
      let sql = `ALTER TABLE ${tableName} ALTER COLUMN ${escapedColName} ${newCol.data_type}`;
      if (!newCol.nullable) {
        sql += " NOT NULL";
      }
      // 如果字段名改变，需要 sp_rename
      if (newCol.name !== oldCol.name) {
        return `EXEC sp_rename '${tableName}.${oldCol.name}', '${newCol.name}', 'COLUMN'; ${sql}`;
      }
      return sql;
    } else if (dbType === "sqlite") {
      // SQLite 的 ALTER TABLE 支持有限，只能重命名表和添加列
      if (newCol.isNew) {
        return generateAddColumnSql(newCol, tableName, dbType);
      }
      // SQLite 不支持修改列，需要重建表
      return null; // 提示用户 SQLite 限制
    }
    
    return null;
  };

  const generateDropColumnSql = (colName: string, tableName: string, dbType: string | undefined): string | null => {
    if (!dbType) return null;
    if (dbType === "sqlite") {
      // SQLite 不支持 DROP COLUMN（需要重建表）
      return null;
    }
    const escapedColName = escapeIdentifier(colName, dbType);
    return `ALTER TABLE ${tableName} DROP COLUMN ${escapedColName}`;
  };

  const handleAddColumn = () => {
    const newColumn: EditableColumnInfo = {
      name: `new_column_${Date.now()}`,
      originalName: `new_column_${Date.now()}`,
      data_type: "VARCHAR(255)",
      nullable: true,
      default: null,
      primary_key: false,
      auto_increment: false,
      isNew: true,
    };
    setColumns([...columns, newColumn]);
  };

  const handleDeleteColumn = (index: number) => {
    const col = columns[index];
    if (col.isNew) {
      // 新字段直接删除
      setColumns(columns.filter((_, i) => i !== index));
    } else {
      // 现有字段标记为删除
      setColumns(columns.map((c, i) => i === index ? { ...c, isDeleted: true } : c));
    }
  };

  const handleRestoreColumn = (index: number) => {
    setColumns(columns.map((c, i) => i === index ? { ...c, isDeleted: false } : c));
  };

  const updateColumn = (index: number, updates: Partial<EditableColumnInfo>) => {
    setColumns(columns.map((col, i) => i === index ? { ...col, ...updates } : col));
  };

  const handleSaveClick = () => {
    setConfirmAction(() => handleSave);
    setShowConfirmDialog(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text)' }}
              title="关闭"
            >
              ←
            </button>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
              表结构: {tableName}
            </h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-sm flex flex-col items-center gap-3" style={{ color: 'var(--neu-text-light)' }}>
            <svg className="animate-spin h-6 w-6" style={{ color: 'var(--neu-accent)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 neu-flat" style={{ borderBottom: '1px solid var(--neu-dark)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
              style={{ color: 'var(--neu-text)' }}
              title="关闭"
            >
              ←
            </button>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
                表结构: {tableName}
              </h2>
              {currentConnection?.type === "sqlite" ? (
                <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>(SQLite)</span>
              ) : currentDatabase ? (
                <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>({currentDatabase})</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={handleEditMode}
                  className="px-3 py-1.5 text-xs rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active"
                  style={{ color: 'var(--neu-text)' }}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveClick}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs rounded-lg transition-all duration-200 neu-raised hover:neu-hover active:neu-active disabled:opacity-50"
                  style={{ color: 'var(--neu-accent)' }}
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </>
            ) : (
              <button
                onClick={handleEditMode}
                className="px-3 py-1.5 text-xs rounded-lg transition-all duration-200 neu-raised hover:neu-hover active:neu-active"
                style={{ color: 'var(--neu-accent)' }}
              >
                编辑
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SQLite Warning */}
      {editMode && connectionType === "sqlite" && (
        <div className="p-4 neu-pressed rounded-lg m-4" style={{ 
          borderLeft: '4px solid var(--neu-warning)',
          color: 'var(--neu-warning)'
        }}>
          <div className="font-semibold mb-1">⚠️ SQLite 限制:</div>
          <div className="text-sm">SQLite 仅支持添加新列，不支持修改或删除现有列。如需修改现有列，需要重建表。</div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 neu-pressed rounded-lg m-4" style={{ 
          borderLeft: '4px solid var(--neu-error)',
          color: 'var(--neu-error)'
        }}>
          <div className="font-semibold mb-1">错误:</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {columns.length === 0 ? (
          <div className="text-center text-sm py-12" style={{ color: 'var(--neu-text-light)' }}>
            <div className="text-4xl mb-3 opacity-40">📋</div>
            <div className="font-medium">暂无字段信息</div>
          </div>
        ) : (
          <div className="space-y-2">
            {columns.map((column, index) => {
              if (column.isDeleted) {
                return (
                  <div
                    key={index}
                    className="rounded-lg p-4 neu-pressed opacity-50"
                    style={{ border: '1px solid var(--neu-dark)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold line-through" style={{ color: 'var(--neu-text)' }}>
                          {column.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--neu-error)', backgroundColor: 'rgba(239, 83, 80, 0.2)' }}>
                          已删除
                        </span>
                      </div>
                      {editMode && (
                        <button
                          onClick={() => handleRestoreColumn(index)}
                          className="px-2 py-1 text-xs rounded transition-all duration-200 neu-flat hover:neu-hover"
                          style={{ color: 'var(--neu-accent)' }}
                        >
                          恢复
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={`rounded-lg p-4 ${column.isNew ? 'neu-raised' : 'neu-flat'}`}
                  style={{ border: '1px solid var(--neu-dark)' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      {editMode ? (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium w-16" style={{ color: 'var(--neu-text)' }}>字段名:</label>
                            <input
                              type="text"
                              value={column.name}
                              onChange={(e) => updateColumn(index, { name: e.target.value })}
                              className="flex-1 px-2 py-1 text-xs rounded neu-flat"
                              style={{ 
                                color: 'var(--neu-text)',
                                backgroundColor: 'var(--neu-bg)',
                                border: '1px solid var(--neu-dark)'
                              }}
                              disabled={column.primary_key}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium w-16" style={{ color: 'var(--neu-text)' }}>类型:</label>
                            <input
                              type="text"
                              value={column.data_type}
                              onChange={(e) => updateColumn(index, { data_type: e.target.value })}
                              className="flex-1 px-2 py-1 text-xs rounded neu-flat font-mono"
                              style={{ 
                                color: 'var(--neu-text)',
                                backgroundColor: 'var(--neu-bg)',
                                border: '1px solid var(--neu-dark)'
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium w-16" style={{ color: 'var(--neu-text)' }}>可空:</label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={column.nullable}
                                onChange={(e) => updateColumn(index, { nullable: e.target.checked })}
                                disabled={column.primary_key}
                                className="w-4 h-4 rounded"
                                style={{ accentColor: 'var(--neu-accent)' }}
                              />
                              <span className="text-xs" style={{ color: 'var(--neu-text-light)' }}>
                                {column.nullable ? "是" : "否"}
                              </span>
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium w-16" style={{ color: 'var(--neu-text)' }}>默认值:</label>
                            <input
                              type="text"
                              value={column.default || ""}
                              onChange={(e) => updateColumn(index, { default: e.target.value || null })}
                              placeholder="NULL"
                              className="flex-1 px-2 py-1 text-xs rounded neu-flat font-mono"
                              style={{ 
                                color: 'var(--neu-text)',
                                backgroundColor: 'var(--neu-bg)',
                                border: '1px solid var(--neu-dark)'
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold" style={{ color: 'var(--neu-text)' }}>
                              {column.name}
                            </span>
                            {column.isNew && (
                              <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-accent)' }}>
                                新字段
                              </span>
                            )}
                            {column.primary_key && (
                              <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-accent)' }}>
                                PK
                              </span>
                            )}
                            {column.auto_increment && (
                              <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-accent)' }}>
                                AI
                              </span>
                            )}
                            {!column.nullable && (
                              <span className="text-xs px-2 py-0.5 rounded neu-raised" style={{ color: 'var(--neu-warning)' }}>
                                NOT NULL
                              </span>
                            )}
                          </div>
                          <div className="space-y-1 text-xs" style={{ color: 'var(--neu-text-light)' }}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">类型:</span>
                              <span className="font-mono">{column.data_type}</span>
                            </div>
                            {column.default !== null && (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">默认值:</span>
                                <span className="font-mono">{column.default}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="font-medium">可空:</span>
                              <span>{column.nullable ? "是" : "否"}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    {editMode && (
                      <div className="flex-shrink-0">
                        <button
                          onClick={() => handleDeleteColumn(index)}
                          disabled={column.primary_key}
                          className="px-2 py-1 text-xs rounded transition-all duration-200 neu-flat hover:neu-hover disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ color: 'var(--neu-error)' }}
                          title={column.primary_key ? "主键字段不能删除" : "删除字段"}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {editMode && (
              <div className="space-y-2">
                <button
                  onClick={handleAddColumn}
                  className="w-full py-3 rounded-lg transition-all duration-200 neu-flat hover:neu-hover active:neu-active border-2 border-dashed"
                  style={{ 
                    color: 'var(--neu-accent)',
                    borderColor: 'var(--neu-accent)'
                  }}
                >
                  <span className="text-sm font-medium">+ 添加字段</span>
                </button>
                {connectionType === "sqlite" && (
                  <div className="text-xs p-2 rounded neu-pressed" style={{ color: 'var(--neu-text-light)' }}>
                    💡 提示: SQLite 仅支持添加新列，修改或删除现有列需要重建表
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="确认修改表结构"
        message="修改表结构可能会影响现有数据，确定要继续吗？"
        confirmText="确定"
        cancelText="取消"
        type="warning"
        onConfirm={() => {
          setShowConfirmDialog(false);
          if (confirmAction) {
            confirmAction();
          }
        }}
        onCancel={() => {
          setShowConfirmDialog(false);
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
